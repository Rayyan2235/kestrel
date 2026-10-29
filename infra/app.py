import os
import sys

import aws_cdk as cdk
from aws_cdk import aws_lambda as lambda_

from kestrel_infra.stack import KestrelStack

# The API bundle lands with the deploy pipeline (P6). Until then, synth
# uses a placeholder handler that answers 503, so the stack still renders.
BUNDLE = os.path.join(os.path.dirname(__file__), "..", "apps", "api", "dist-lambda")
if os.path.isdir(BUNDLE):
    code = lambda_.Code.from_asset(BUNDLE)
else:
    print(f"infra: no API bundle at {os.path.normpath(BUNDLE)}; using a 503 placeholder", file=sys.stderr)
    code = lambda_.Code.from_inline(
        "exports.handler = async () => ({ statusCode: 503, body: 'Kestrel API not deployed yet.' });"
    )

# Without the CDK CLI (which sets CDK_OUTDIR), `python app.py` writes to cdk.out/.
app = cdk.App(outdir=os.environ.get("CDK_OUTDIR", "cdk.out"))
KestrelStack(app, "Kestrel", api_code=code, env=cdk.Environment(region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1")))
app.synth()
