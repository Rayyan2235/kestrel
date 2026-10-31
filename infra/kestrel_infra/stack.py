from aws_cdk import (
    Duration,
    Fn,
    RemovalPolicy,
    Stack,
    aws_apigatewayv2 as apigw,
    aws_apigatewayv2_integrations as integrations,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_dsql as dsql,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_logs as logs,
    aws_s3 as s3,
    aws_sqs as sqs,
)
from constructs import Construct

# The serverless stack from the upscale plan (P5), with every Lambda outside
# a VPC, so there is no NAT and no interface endpoint to pay for:
#
#   Browser -> CloudFront -+-> S3 web (OAC)
#                          +-> /api/* -> HTTP API -> API Lambda (Fastify, arm64)
#   Browser -presigned POST-> S3 data voice/ (1 day) ; replays/ (30 days)
#   API Lambda -> Aurora DSQL (IAM auth) ; SQS verify queue (+ DLQ) ; Bedrock
#
# Secrets are SSM parameters the owner creates by hand; CloudFormation can't
# create a SecureString, and the template never holds a secret value.

# SSM parameters, created once by the owner (see infra/README.md).
ELEVENLABS_KEY_PARAM = "/kestrel/elevenlabs-api-key"  # SecureString
ORIGIN_HEADER_PARAM = "/kestrel/origin-header"  # String: CloudFront can't resolve a SecureString
ORIGIN_HEADER = "x-kestrel-origin"

# Requests per second, per route, across all learners. HTTP API has no
# per-client limit; these cap what a runaway client can spend.
DEFAULT_THROTTLE = {"rate": 20, "burst": 40}
COSTLY_ROUTES = {
    # Bedrock
    "POST /api/agent/turn": {"rate": 2, "burst": 5},
    "POST /api/two-bot/respond": {"rate": 2, "burst": 5},
    # ElevenLabs
    "POST /api/voice/transcribe": {"rate": 1, "burst": 3},
    "POST /api/voice/speak": {"rate": 1, "burst": 3},
}

VOICE_PREFIX = "voice/"
REPLAYS_PREFIX = "replays/"


class KestrelStack(Stack):
    def __init__(self, scope: Construct, id: str, *, api_code: lambda_.Code, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── Storage ──────────────────────────────────────────────────────
        def bucket(name: str, **extra) -> s3.Bucket:
            return s3.Bucket(
                self,
                name,
                block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
                encryption=s3.BucketEncryption.S3_MANAGED,
                enforce_ssl=True,
                removal_policy=RemovalPolicy.DESTROY,
                auto_delete_objects=True,
                **extra,
            )

        web = bucket("Web")
        # Voice clips are deleted after transcription; the rule is the backstop.
        data = bucket(
            "Data",
            lifecycle_rules=[
                s3.LifecycleRule(id="voice-1d", prefix=VOICE_PREFIX, expiration=Duration.days(1)),
                s3.LifecycleRule(id="replays-30d", prefix=REPLAYS_PREFIX, expiration=Duration.days(30)),
                s3.LifecycleRule(id="abort-uploads", abort_incomplete_multipart_upload_after=Duration.days(1)),
            ],
        )

        dlq = sqs.Queue(
            self,
            "VerifyDlq",
            retention_period=Duration.days(14),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
        )
        # Visibility is 6x the verifier's 60 s timeout (AWS guidance).
        queue = sqs.Queue(
            self,
            "Verify",
            visibility_timeout=Duration.seconds(360),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
            dead_letter_queue=sqs.DeadLetterQueue(queue=dlq, max_receive_count=3),
        )

        # Deletion protection off so `cdk destroy` leaves nothing behind.
        cluster = dsql.CfnCluster(self, "Db", deletion_protection_enabled=False)
        cluster.apply_removal_policy(RemovalPolicy.DESTROY)

        # ── API ──────────────────────────────────────────────────────────
        api_fn = lambda_.Function(
            self,
            "Api",
            runtime=lambda_.Runtime.NODEJS_22_X,
            architecture=lambda_.Architecture.ARM_64,
            handler="lambda.handler",
            code=api_code,
            memory_size=512,
            # Under HTTP API's 30 s integration limit.
            timeout=Duration.seconds(28),
            log_group=logs.LogGroup(
                self,
                "ApiLogs",
                retention=logs.RetentionDays.ONE_MONTH,
                removal_policy=RemovalPolicy.DESTROY,
            ),
            environment={
                "DSQL_ENDPOINT": f"{cluster.attr_identifier}.dsql.{self.region}.on.aws",
                "VERIFY_QUEUE_URL": queue.queue_url,
                "DATA_BUCKET": data.bucket_name,
                "ELEVENLABS_KEY_PARAM": ELEVENLABS_KEY_PARAM,
                "ORIGIN_HEADER_PARAM": ORIGIN_HEADER_PARAM,
                "ORIGIN_HEADER": ORIGIN_HEADER,
            },
        )

        # Least privilege: each grant names its resource.
        api_fn.add_to_role_policy(iam.PolicyStatement(actions=["dsql:DbConnect"], resources=[cluster.attr_resource_arn]))
        queue.grant_send_messages(api_fn)
        data.grant_put(api_fn, f"{REPLAYS_PREFIX}*")
        # Presigned voice POSTs are signed with this role, so it needs put on voice/* too.
        data.grant_put(api_fn, f"{VOICE_PREFIX}*")
        data.grant_read(api_fn, f"{VOICE_PREFIX}*")
        data.grant_delete(api_fn, f"{VOICE_PREFIX}*")
        api_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter"],
                resources=[
                    self.format_arn(service="ssm", resource="parameter", resource_name=p.lstrip("/"))
                    for p in (ELEVENLABS_KEY_PARAM, ORIGIN_HEADER_PARAM)
                ],
            )
        )
        api_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                resources=[
                    f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.*",
                    self.format_arn(service="bedrock", resource="inference-profile", resource_name="*anthropic.*"),
                ],
            )
        )

        http = apigw.HttpApi(self, "Http", description="Kestrel API, behind CloudFront")
        target = integrations.HttpLambdaIntegration("ApiTarget", api_fn)
        routes = http.add_routes(path="/api/{proxy+}", methods=[apigw.HttpMethod.ANY], integration=target)
        # The costly routes get their own route keys, so they can be throttled apart.
        for key in COSTLY_ROUTES:
            routes += http.add_routes(path=key.split(" ")[1], methods=[apigw.HttpMethod.POST], integration=target)

        stage = http.default_stage.node.default_child
        stage.default_route_settings = apigw.CfnStage.RouteSettingsProperty(
            throttling_rate_limit=DEFAULT_THROTTLE["rate"], throttling_burst_limit=DEFAULT_THROTTLE["burst"]
        )
        stage.route_settings = {
            key: {"ThrottlingRateLimit": t["rate"], "ThrottlingBurstLimit": t["burst"]} for key, t in COSTLY_ROUTES.items()
        }
        # Route settings may only name routes that already exist.
        for route in routes:
            stage.node.add_dependency(route)

        # ── Edge ─────────────────────────────────────────────────────────
        api_origin = origins.HttpOrigin(
            Fn.select(2, Fn.split("/", http.api_endpoint)),
            custom_headers={ORIGIN_HEADER: f"{{{{resolve:ssm:{ORIGIN_HEADER_PARAM}}}}}"},
        )
        site = cloudfront.Distribution(
            self,
            "Site",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(web),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            additional_behaviors={
                "/api/*": cloudfront.BehaviorOptions(
                    origin=api_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                    origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                )
            },
        )

        # Presigned POST uploads come from the site's own origin only.
        data.add_cors_rule(
            allowed_methods=[s3.HttpMethods.POST],
            allowed_origins=[f"https://{site.distribution_domain_name}"],
            allowed_headers=["*"],
            max_age=3000,
        )
