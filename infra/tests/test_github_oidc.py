import aws_cdk as cdk
import pytest
from aws_cdk.assertions import Template

from kestrel_infra.github_oidc import DeployAccessStack

# The GitHub deploy role: who may assume it, and how little it can do.


def arn(value: object) -> object:
    """Resolve CDK's {"Fn::Join": ["", ["arn:", {"Ref": "AWS::Partition"}, ...]]} to a string."""
    if isinstance(value, dict) and "Fn::Join" in value:
        sep, parts = value["Fn::Join"]
        return sep.join("aws" if p == {"Ref": "AWS::Partition"} else p for p in parts)
    return value


@pytest.fixture(scope="module")
def template() -> Template:
    app = cdk.App()
    stack = DeployAccessStack(app, "TestDeployAccess", env=cdk.Environment(account="111111111111", region="us-east-1"))
    return Template.from_stack(stack)


def test_only_main_repo_production_environment_can_assume_it(template: Template) -> None:
    (role,) = template.find_resources("AWS::IAM::Role").values()
    (statement,) = role["Properties"]["AssumeRolePolicyDocument"]["Statement"]
    assert statement["Action"] == "sts:AssumeRoleWithWebIdentity"
    assert statement["Condition"] == {
        "StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "repo:Rayyan2235/kestrel:environment:production",
        }
    }
    # No StringLike: a wildcard sub would let any branch or fork deploy.
    assert "StringLike" not in statement["Condition"]


def test_role_assumes_only_cdk_bootstrap_roles_and_moves_only_the_api_alias(template: Template) -> None:
    (policy,) = template.find_resources("AWS::IAM::Policy").values()
    grants = {}
    for statement in policy["Properties"]["PolicyDocument"]["Statement"]:
        actions = statement["Action"] if isinstance(statement["Action"], list) else [statement["Action"]]
        resources = statement["Resource"] if isinstance(statement["Resource"], list) else [statement["Resource"]]
        assert statement["Effect"] == "Allow"
        for action in actions:
            grants[action] = [arn(r) for r in resources]
    assert set(grants) == {"sts:AssumeRole", "lambda:GetAlias", "lambda:UpdateAlias"}
    assert grants["sts:AssumeRole"] == ["arn:aws:iam::111111111111:role/cdk-hnb659fds-*-111111111111-us-east-1"]
    assert grants["lambda:UpdateAlias"] == [
        "arn:aws:lambda:us-east-1:111111111111:function:kestrel-api",
        "arn:aws:lambda:us-east-1:111111111111:function:kestrel-api:*",
    ]


def test_role_arn_is_an_output(template: Template) -> None:
    assert "DeployRoleArn" in template.find_outputs("*")
