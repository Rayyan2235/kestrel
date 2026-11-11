from aws_cdk import (
    CfnOutput,
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
    aws_s3_deployment as s3deploy,
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
# A CloudFormation dynamic reference: resolved at deploy, never written into the template.
ORIGIN_SECRET_REF = f"{{{{resolve:ssm:{ORIGIN_HEADER_PARAM}}}}}"

# Requests per second, per route, across all learners. HTTP API has no
# per-client limit; these cap what a runaway client can spend.
DEFAULT_THROTTLE = {"rate": 20, "burst": 40}
COSTLY_ROUTES = {
    # Bedrock
    "POST /api/agent/turn": {"rate": 2, "burst": 5},
    # ElevenLabs
    "POST /api/voice/transcribe": {"rate": 1, "burst": 3},
    "POST /api/voice/speak": {"rate": 1, "burst": 3},
    # Each grant allows a 10 MB S3 upload
    "POST /api/voice/upload-url": {"rate": 1, "burst": 3},
}

# Fixed names so the GitHub deploy role (github_oidc.py) can be scoped to them.
API_FUNCTION_NAME = "kestrel-api"
# CloudFront and API Gateway call this alias, never $LATEST. A deploy publishes
# a new version and moves the alias; a failed post-deploy gate moves it back.
LIVE_ALIAS = "live"

# A request path that names a file (has an extension) is served as is.
SPA_FILE_RE = r"\.[a-z0-9]+$"
SPA_ROUTES_JS = f"""function handler(event) {{
  var request = event.request;
  if (!/{SPA_FILE_RE}/i.test(request.uri)) request.uri = "/index.html";
  return request;
}}"""

VOICE_PREFIX = "voice/"
REPLAYS_PREFIX = "replays/"


class KestrelStack(Stack):
    def __init__(
        self,
        scope: Construct,
        id: str,
        *,
        api_code: lambda_.Code,
        web_source: s3deploy.ISource | None = None,
        **kwargs,
    ) -> None:
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
            function_name=API_FUNCTION_NAME,
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
                # apps/api/src/edge.ts: requests must carry CloudFront's secret.
                "ORIGIN_HEADER": ORIGIN_HEADER,
                "ORIGIN_SECRET": ORIGIN_SECRET_REF,
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
                resources=[self.format_arn(service="ssm", resource="parameter", resource_name=ELEVENLABS_KEY_PARAM.lstrip("/"))],
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

        live = lambda_.Alias(self, "ApiLive", alias_name=LIVE_ALIAS, version=api_fn.current_version)

        http = apigw.HttpApi(self, "Http", description="Kestrel API, behind CloudFront")
        target = integrations.HttpLambdaIntegration("ApiTarget", live)
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
            custom_headers={ORIGIN_HEADER: ORIGIN_SECRET_REF},
        )
        # The web app routes on the path (/console, /lab/...), as Caddy's
        # try_files does on Vultr. A path without a file extension gets
        # index.html. Only the S3 behavior runs this, so /api/* is untouched.
        spa_routes = cloudfront.Function(
            self,
            "SpaRoutes",
            runtime=cloudfront.FunctionRuntime.JS_2_0,
            code=cloudfront.FunctionCode.from_inline(SPA_ROUTES_JS),
        )
        site = cloudfront.Distribution(
            self,
            "Site",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(web),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                function_associations=[
                    cloudfront.FunctionAssociation(
                        function=spa_routes, event_type=cloudfront.FunctionEventType.VIEWER_REQUEST
                    )
                ],
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

        # The browser's Origin on AWS; edge.ts allows it alongside localhost.
        api_fn.add_environment("SITE_ORIGIN", f"https://{site.distribution_domain_name}")

        # Presigned POST uploads come from the site's own origin only.
        data.add_cors_rule(
            allowed_methods=[s3.HttpMethods.POST],
            allowed_origins=[f"https://{site.distribution_domain_name}"],
            allowed_headers=["*"],
            max_age=3000,
        )

        # The built web app (apps/web/dist). The upload replaces the bucket's
        # contents and invalidates the distribution in the same deploy.
        if web_source is not None:
            s3deploy.BucketDeployment(
                self,
                "WebDeploy",
                sources=[web_source],
                destination_bucket=web,
                distribution=site,
                distribution_paths=["/*"],
                # The MuJoCo and ONNX wasm make the build about 40 MB.
                memory_limit=1024,
            )

        # Read by .github/workflows/deploy.yml.
        CfnOutput(self, "SiteUrl", value=f"https://{site.distribution_domain_name}")
        CfnOutput(self, "ApiFunctionName", value=api_fn.function_name)
        CfnOutput(self, "ApiAlias", value=live.alias_name)
