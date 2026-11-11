import os
import sys

import aws_cdk as cdk
from aws_cdk import aws_lambda as lambda_, aws_s3_deployment as s3deploy

from kestrel_infra.github_oidc import DeployAccessStack
from kestrel_infra.stack import KestrelStack

# The API bundle comes from `pnpm build` (apps/api/scripts/build-lambda.mjs).
# Without it, synth uses a placeholder handler that answers 503.
BUNDLE = os.path.join(os.path.dirname(__file__), "..", "apps", "api", "dist-lambda")
if os.path.isdir(BUNDLE):
    code = lambda_.Code.from_asset(BUNDLE)
else:
    print(f"infra: no API bundle at {os.path.normpath(BUNDLE)}; using a 503 placeholder", file=sys.stderr)
    code = lambda_.Code.from_inline(
        "exports.handler = async () => ({ statusCode: 503, body: 'Kestrel API not deployed yet.' });"
    )

# The web build from `pnpm build` (apps/web/dist). Without it, the stack
# deploys no site files.
WEB = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "dist")
web = s3deploy.Source.asset(WEB) if os.path.isdir(WEB) else None
if web is None:
    print(f"infra: no web build at {os.path.normpath(WEB)}; the site bucket stays empty", file=sys.stderr)

# Without the CDK CLI (which sets CDK_OUTDIR), `python app.py` writes to cdk.out/.
app = cdk.App(outdir=os.environ.get("CDK_OUTDIR", "cdk.out"))
env = cdk.Environment(account=os.environ.get("CDK_DEFAULT_ACCOUNT"), region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"))
KestrelStack(app, "Kestrel", api_code=code, web_source=web, env=env)
# Deployed once by the owner, by hand (infra/README.md); the workflow never touches it.
DeployAccessStack(app, "KestrelDeployAccess", env=env)
app.synth()
