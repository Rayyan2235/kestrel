from aws_cdk import ArnFormat, CfnOutput, Duration, Stack, aws_iam as iam
from constructs import Construct

from kestrel_infra.stack import API_FUNCTION_NAME

# Keyless deploys from GitHub Actions (P6). The workflow trades its OIDC token
# for this role; no AWS access key is stored in GitHub.
#
# Only jobs in the repo's `production` environment can assume it, and the
# environment only accepts the main branch (set in the repo's settings). The
# role itself can do almost nothing: it assumes the CDK bootstrap roles, which
# hold the CloudFormation rights, and moves the API's `live` alias back when
# the post-deploy gate fails.

GITHUB_ISSUER = "token.actions.githubusercontent.com"
REPO = "Rayyan2235/kestrel"
ENVIRONMENT = "production"
# The default `cdk bootstrap` qualifier.
CDK_QUALIFIER = "hnb659fds"


class DeployAccessStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        provider = iam.OidcProviderNative(
            self,
            "GitHub",
            url=f"https://{GITHUB_ISSUER}",
            client_ids=["sts.amazonaws.com"],
        )
        role = iam.Role(
            self,
            "Deploy",
            description="GitHub Actions deploys of Kestrel (main branch, production environment)",
            max_session_duration=Duration.hours(1),
            assumed_by=iam.WebIdentityPrincipal(
                provider.oidc_provider_arn,
                conditions={
                    "StringEquals": {
                        f"{GITHUB_ISSUER}:aud": "sts.amazonaws.com",
                        f"{GITHUB_ISSUER}:sub": f"repo:{REPO}:environment:{ENVIRONMENT}",
                    }
                },
            ),
        )

        # `cdk deploy` runs as the bootstrap roles (deploy, file publishing, lookup).
        role.add_to_policy(
            iam.PolicyStatement(
                actions=["sts:AssumeRole"],
                resources=[f"arn:aws:iam::{self.account}:role/cdk-{CDK_QUALIFIER}-*-{self.account}-{self.region}"],
            )
        )
        # Rollback: read the alias before the deploy, point it back after a failed gate.
        function_arn = self.format_arn(
            service="lambda", resource="function", resource_name=API_FUNCTION_NAME, arn_format=ArnFormat.COLON_RESOURCE_NAME
        )
        role.add_to_policy(
            iam.PolicyStatement(
                actions=["lambda:GetAlias", "lambda:UpdateAlias"],
                resources=[function_arn, f"{function_arn}:*"],
            )
        )

        # Set as the repo variable AWS_DEPLOY_ROLE_ARN (infra/README.md).
        CfnOutput(self, "DeployRoleArn", value=role.role_arn)

