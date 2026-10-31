import aws_cdk as cdk
import pytest
from aws_cdk import aws_lambda as lambda_
from aws_cdk.assertions import Match, Template

from kestrel_infra.stack import COSTLY_ROUTES, KestrelStack

# Infra policy checks on the synthesized template. In-process synth: no CDK
# CLI, no AWS credentials, nothing deployed.


@pytest.fixture(scope="module")
def template() -> Template:
    app = cdk.App()
    stack = KestrelStack(
        app,
        "Test",
        api_code=lambda_.Code.from_inline("exports.handler = async () => ({ statusCode: 503 });"),
        env=cdk.Environment(region="us-east-1"),
    )
    return Template.from_stack(stack)


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
        "POST /api/two-bot/respond",
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
    for policy in template.find_resources("AWS::IAM::Policy").values():
        for statement in policy["Properties"]["PolicyDocument"]["Statement"]:
            actions = statement["Action"] if isinstance(statement["Action"], list) else [statement["Action"]]
            if "s3:PutObject" in actions:
                resources = statement["Resource"] if isinstance(statement["Resource"], list) else [statement["Resource"]]
                put += [r["Fn::Join"][1][-1] for r in resources]
    assert sorted(put) == ["/replays/*", "/voice/*"]


def test_api_role_grants_no_wildcard_actions(template: Template) -> None:
    for name, policy in template.find_resources("AWS::IAM::Policy").items():
        for statement in policy["Properties"]["PolicyDocument"]["Statement"]:
            actions = statement["Action"] if isinstance(statement["Action"], list) else [statement["Action"]]
            assert "*" not in actions, name
            assert statement.get("Resource") != "*", name
