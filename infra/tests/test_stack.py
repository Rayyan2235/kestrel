import re

import aws_cdk as cdk
import pytest
from aws_cdk import aws_ecr_assets as ecr_assets, aws_lambda as lambda_, aws_s3_deployment as s3deploy
from aws_cdk.assertions import Match, Template

from kestrel_infra.stack import VERIFIER_CONTEXT_EXCLUDE, VERIFIER_FUNCTION_NAME, API_FUNCTION_NAME, COSTLY_ROUTES, LIVE_ALIAS, ORIGIN_SECRET_REF, SPA_FILE_RE, SPA_ROUTES_JS, KestrelStack

# Infra policy checks on the synthesized template. In-process synth: no CDK
# CLI, no AWS credentials, nothing deployed.


def synth(web_source: s3deploy.ISource | None = None, verifier_code: lambda_.DockerImageCode | None = None) -> Template:
    app = cdk.App()
    stack = KestrelStack(
        app,
        "Test",
        api_code=lambda_.Code.from_inline("exports.handler = async () => ({ statusCode: 503 });"),
        web_source=web_source,
        verifier_code=verifier_code,
        env=cdk.Environment(region="us-east-1"),
    )
    return Template.from_stack(stack)


# With a web build, as the deploy workflow synthesizes it; the checks below
# then cover the upload's own Lambda and role too.
@pytest.fixture(scope="module")
def template(tmp_path_factory: pytest.TempPathFactory) -> Template:
    web = tmp_path_factory.mktemp("web")
    (web / "index.html").write_text("<!doctype html>")
    # A stand-in image context: synth only fingerprints it; nothing is built.
    image = tmp_path_factory.mktemp("verifier")
    (image / "Dockerfile").write_text("FROM public.ecr.aws/lambda/python:3.12\n")
    code = lambda_.DockerImageCode.from_image_asset(str(image), platform=ecr_assets.Platform.LINUX_ARM64)
    return synth(s3deploy.Source.asset(str(web)), code)


def test_no_vpc_or_nat(template: Template) -> None:
    for kind in ("AWS::EC2::VPC", "AWS::EC2::NatGateway", "AWS::EC2::VPCEndpoint"):
        template.resource_count_is(kind, 0)
    for name, fn in template.find_resources("AWS::Lambda::Function").items():
        assert "VpcConfig" not in fn["Properties"], name


def test_buckets_block_public_access(template: Template) -> None:
    buckets = template.find_resources("AWS::S3::Bucket")
    assert len(buckets) == 2
    for name, b in buckets.items():
        assert b["Properties"]["PublicAccessBlockConfiguration"] == {
            "BlockPublicAcls": True,
            "BlockPublicPolicy": True,
            "IgnorePublicAcls": True,
            "RestrictPublicBuckets": True,
        }, name


def test_voice_expires_in_1_day_and_replays_in_30(template: Template) -> None:
    template.has_resource_properties(
        "AWS::S3::Bucket",
        {
            "LifecycleConfiguration": {
                "Rules": Match.array_with(
                    [
                        Match.object_like({"Prefix": "voice/", "ExpirationInDays": 1, "Status": "Enabled"}),
                        Match.object_like({"Prefix": "replays/", "ExpirationInDays": 30, "Status": "Enabled"}),
                    ]
                )
            }
        },
    )


def test_http_api_throttles_bedrock_and_voice_routes(template: Template) -> None:
    stages = template.find_resources("AWS::ApiGatewayV2::Stage")
    assert len(stages) == 1
    props = next(iter(stages.values()))["Properties"]
    assert props["DefaultRouteSettings"]["ThrottlingRateLimit"] > 0
    keys = {r["Properties"]["RouteKey"] for r in template.find_resources("AWS::ApiGatewayV2::Route").values()}
    for key in (
        "POST /api/agent/turn",
        "POST /api/voice/transcribe",
        "POST /api/voice/speak",
        "POST /api/voice/upload-url",
    ):
        assert key in COSTLY_ROUTES and key in keys, key
        limits = props["RouteSettings"][key]
        assert 0 < limits["ThrottlingRateLimit"] < props["DefaultRouteSettings"]["ThrottlingRateLimit"], key
        assert limits["ThrottlingBurstLimit"] > 0, key


def test_api_role_can_sign_voice_uploads_only_under_voice(template: Template) -> None:
    put = []
    for name, policy in template.find_resources("AWS::IAM::Policy").items():
        if not name.startswith("ApiServiceRole"):
            continue
        for statement in policy["Properties"]["PolicyDocument"]["Statement"]:
            actions = statement["Action"] if isinstance(statement["Action"], list) else [statement["Action"]]
            if "s3:PutObject" in actions:
                resources = statement["Resource"] if isinstance(statement["Resource"], list) else [statement["Resource"]]
                put += [r["Fn::Join"][1][-1] for r in resources]
    assert sorted(put) == ["/replays/*", "/voice/*"]


# CDK's BucketDeployment grants these on "*" and offers no way to scope them.
# They can only start or read a cache invalidation, never read or change data.
INVALIDATION_ONLY = {"cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"}


def test_api_role_grants_no_wildcard_actions(template: Template) -> None:
    for name, policy in template.find_resources("AWS::IAM::Policy").items():
        for statement in policy["Properties"]["PolicyDocument"]["Statement"]:
            actions = statement["Action"] if isinstance(statement["Action"], list) else [statement["Action"]]
            assert "*" not in actions, name
            if statement.get("Resource") == "*":
                assert set(actions) <= INVALIDATION_ONLY, name


def test_resources_have_no_dependency_cycle(template: Template) -> None:
    # Template.from_stack refuses an undeployable template ("dependency
    # cycle"), so building the fixture is the check.
    assert template.to_json()["Resources"]


def test_origin_secret_is_an_ssm_reference_never_a_literal(template: Template) -> None:
    (fn,) = [
        f for f in template.find_resources("AWS::Lambda::Function").values()
        if "ORIGIN_HEADER" in f["Properties"].get("Environment", {}).get("Variables", {})
    ]
    env = fn["Properties"]["Environment"]["Variables"]
    assert env["ORIGIN_SECRET"] == ORIGIN_SECRET_REF == "{{resolve:ssm:/kestrel/origin-header}}"
    assert "Fn::GetAtt" in env["SITE_ORIGIN"]["Fn::Join"][1][1]
    (site,) = template.find_resources("AWS::CloudFront::Distribution").values()
    headers = [h for o in site["Properties"]["DistributionConfig"]["Origins"] for h in o.get("OriginCustomHeaders", [])]
    assert headers == [{"HeaderName": "x-kestrel-origin", "HeaderValue": ORIGIN_SECRET_REF}]


def test_api_routes_call_the_live_alias_not_latest(template: Template) -> None:
    template.has_resource_properties(
        "AWS::Lambda::Function", {"FunctionName": API_FUNCTION_NAME}
    )
    (alias_id, alias), = template.find_resources("AWS::Lambda::Alias").items()
    assert alias["Properties"]["Name"] == LIVE_ALIAS
    assert "Fn::GetAtt" in alias["Properties"]["FunctionVersion"]
    integrations = template.find_resources("AWS::ApiGatewayV2::Integration").values()
    assert integrations
    for integration in integrations:
        assert integration["Properties"]["IntegrationUri"] == {"Ref": alias_id}


def test_site_paths_without_an_extension_serve_index_html(template: Template) -> None:
    (fn,) = template.find_resources("AWS::CloudFront::Function").values()
    assert fn["Properties"]["FunctionCode"] == SPA_ROUTES_JS
    (site,) = template.find_resources("AWS::CloudFront::Distribution").values()
    config = site["Properties"]["DistributionConfig"]
    assert config["DefaultCacheBehavior"]["FunctionAssociations"][0]["EventType"] == "viewer-request"
    (api,) = config["CacheBehaviors"]
    assert api["PathPattern"] == "/api/*" and "FunctionAssociations" not in api


def test_spa_rewrite_keeps_files_and_rewrites_routes() -> None:
    # The same regex the CloudFront Function uses.
    assert f"/{SPA_FILE_RE}/i" in SPA_ROUTES_JS
    pattern = re.compile(SPA_FILE_RE, re.I)
    for uri in ("/", "/console", "/lab/beam"):
        assert not pattern.search(uri), uri
    for uri in ("/index.html", "/assets/mujoco-Mp9KyG2b.wasm", "/favicon.svg"):
        assert pattern.search(uri), uri


def test_web_deploy_invalidates_the_whole_site(template: Template) -> None:
    template.has_resource_properties(
        "Custom::CDKBucketDeployment", {"DistributionPaths": ["/*"], "Prune": True}
    )


def test_without_a_web_build_nothing_is_uploaded() -> None:
    synth().resource_count_is("Custom::CDKBucketDeployment", 0)


def test_outputs_name_what_the_deploy_workflow_reads(template: Template) -> None:
    assert {"SiteUrl", "ApiFunctionName", "ApiAlias", "ApiRoleArn", "DsqlEndpoint", "VerifyQueueUrl", "AlarmTopicArn"} <= set(template.find_outputs("*"))


def verifier_fn(template: Template) -> tuple[str, dict]:
    ((name, fn),) = [
        (n, f) for n, f in template.find_resources("AWS::Lambda::Function").items()
        if f["Properties"].get("FunctionName") == VERIFIER_FUNCTION_NAME
    ]
    return name, fn["Properties"]


def test_verifier_is_an_arm64_container_sized_for_mujoco(template: Template) -> None:
    _, props = verifier_fn(template)
    assert props["PackageType"] == "Image"
    assert props["Architectures"] == ["arm64"]
    assert props["MemorySize"] == 2048 and props["Timeout"] == 60
    assert "VpcConfig" not in props
    assert set(props["Environment"]["Variables"]) == {"DSQL_ENDPOINT", "DATA_BUCKET"}


def test_queue_visibility_is_six_times_the_verifier_timeout(template: Template) -> None:
    _, props = verifier_fn(template)
    queues = template.find_resources("AWS::SQS::Queue")
    (verify,) = [q for q in queues.values() if "RedrivePolicy" in q["Properties"]]
    assert verify["Properties"]["VisibilityTimeout"] >= 6 * props["Timeout"]
    assert verify["Properties"]["RedrivePolicy"]["maxReceiveCount"] == 3


def test_verifier_takes_one_message_at_a_time_and_reports_partial_failures(template: Template) -> None:
    name, _ = verifier_fn(template)
    (mapping,) = template.find_resources("AWS::Lambda::EventSourceMapping").values()
    props = mapping["Properties"]
    assert props["FunctionName"] == {"Ref": name}
    assert props["BatchSize"] == 1
    assert props["FunctionResponseTypes"] == ["ReportBatchItemFailures"]
    assert props["ScalingConfig"] == {"MaximumConcurrency": 2}


def test_verifier_reads_claims_but_cannot_write_the_bucket(template: Template) -> None:
    name, props = verifier_fn(template)
    role = props["Role"]["Fn::GetAtt"][0]
    actions = []
    for policy in template.find_resources("AWS::IAM::Policy").values():
        if {"Ref": role} in policy["Properties"]["Roles"]:
            for st in policy["Properties"]["PolicyDocument"]["Statement"]:
                actions += st["Action"] if isinstance(st["Action"], list) else [st["Action"]]
    assert "dsql:DbConnect" in actions and "sqs:DeleteMessage" in actions
    assert any(a.startswith("s3:GetObject") for a in actions)
    assert not any(a.startswith(("s3:Put", "s3:Delete")) for a in actions)
    assert "dsql:DbConnectAdmin" not in actions


def test_verifier_image_context_is_only_the_verifier_and_robot_assets(tmp_path) -> None:
    # CDK's own copy (the engine that stages the image context), with the stack's rules.
    from pathlib import Path

    repo = Path(__file__).resolve().parents[2]
    cdk.FileSystem.copy_directory(
        str(repo), str(tmp_path), cdk.CopyOptions(exclude=VERIFIER_CONTEXT_EXCLUDE, ignore_mode=cdk.IgnoreMode.DOCKER)
    )
    copied = {p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*") if p.is_file()}
    for kept in ("verifier/Dockerfile", "verifier/requirements.txt", "verifier/kestrel_verifier/scene.py",
                 "verifier/kits/rules.json", "apps/web/public/microduck/SHA256SUMS"):
        assert kept in copied, kept
    assert any(p.startswith("apps/web/public/microduck/robot/meshes/") for p in copied)
    assert {p.split("/")[0] for p in copied} == {"verifier", "apps"}
    assert not any(p.startswith(("verifier/tests", "apps/web/src", "apps/api")) or ".env" in p for p in copied)
