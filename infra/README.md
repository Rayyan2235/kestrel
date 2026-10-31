# Kestrel infra (AWS CDK, Python)

The serverless stack from the upscale plan (P5). It is **synth only** for now: there is no AWS account yet, so nothing here has been deployed.

```
Browser -> CloudFront -+-> S3 web (Origin Access Control)
                       +-> /api/* -> API Gateway HTTP API -> API Lambda (Node 22, arm64)
Browser -presigned POST-> S3 data: voice/ expires in 1 day, replays/ in 30 days
API Lambda -> Aurora DSQL (IAM auth) ; SQS verify queue (+ DLQ after 3 receives) ; Bedrock
```

- **No VPC, so no NAT and no interface endpoints.** Every Lambda reaches AWS services over their public endpoints with IAM.
- **Both buckets block all public access**, enforce TLS and are reachable from CloudFront only through Origin Access Control.
- **HTTP API throttling:** 20 req/s (burst 40) by default. The Bedrock route (`/api/agent/turn`) allows 2 req/s (burst 5), and the voice routes (`/api/voice/transcribe`, `/api/voice/speak`, and `/api/voice/upload-url`, whose grants each allow a 10 MB upload) 1 req/s (burst 3). These limits are per route across all users.
- **Least privilege:** the API role connects to this one DSQL cluster as a non-admin user, sends only to the verify queue, reads and deletes `voice/*`, writes `replays/*`, reads two named SSM parameters, and invokes Anthropic models only.
- **`cdk destroy` leaves nothing behind:** buckets empty themselves, logs and the DSQL cluster are deleted (deletion protection is off), and logs are kept for 30 days.

## Secrets

The template never holds a secret. The owner creates two SSM parameters once, before the first deploy:

| Parameter | Type | Used for |
| --- | --- | --- |
| `/kestrel/elevenlabs-api-key` | SecureString | The API Lambda reads it at run time. |
| `/kestrel/origin-header` | String | CloudFront sends it as `x-kestrel-origin` on every `/api/*` request, and the API Lambda receives it as `ORIGIN_SECRET` through the same dynamic reference. `apps/api/src/edge.ts` rejects requests without it (compared in constant time), which blocks direct calls to the API endpoint. It has to be a String because CloudFront can't resolve a SecureString. |

## Check it

From this folder (on Windows the venv's Python is `.venv/Scripts/python`; elsewhere `.venv/bin/python`):

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pytest -q tests   # infra policy checks
.venv/Scripts/python app.py               # synth to cdk.out/Kestrel.template.json
```

The CDK CLI is not needed: both commands synthesize in-process (Node must be on PATH). The tests check that there is no VPC or NAT, that the buckets block public access, that `voice/` expires after 1 day and `replays/` after 30, that the costly routes are throttled below the default, and that no IAM statement grants `*`.

## Not yet

- The API bundle is real: `pnpm build` writes `apps/api/dist-lambda/lambda.mjs` (`@fastify/aws-lambda`, esbuild), and `app.py` deploys it. Without a build it synthesizes a 503 placeholder.
- On AWS the API still reads `ELEVENLABS_API_KEY` and `DATABASE_URL` from its environment. Reading the SecureString key from SSM, and connecting to DSQL with IAM tokens, come with the first deploy (P6). Until then `ELEVENLABS_KEY_PARAM` and `DSQL_ENDPOINT` are set but unread.
- The presigned voice upload route is built (`apps/api/src/storage/s3.ts`; the API role may put only to `voice/*` and `replays/*`). The 9 MB end-to-end check needs a deployed stack.
- The verifier Lambda that reads the queue comes in P3.
