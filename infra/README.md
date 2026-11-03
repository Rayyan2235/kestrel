# Kestrel infra (AWS CDK, Python)

The serverless stack from the upscale plan (P5), and its keyless deploy pipeline (P6). Nothing here has been deployed yet: the pipeline stays off until the owner does the one-time setup below.

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

## Deploys (P6)

`.github/workflows/deploy.yml` runs after **Check Kestrel** passes on main:

1. It trades the job's GitHub OIDC token for the deploy role; no AWS key is stored in GitHub.
2. It runs `pnpm build`, then `cdk deploy Kestrel`. The stack publishes a new API Lambda version and points the `live` alias at it; API Gateway calls only the alias. The web build is uploaded to the site bucket and CloudFront is invalidated in the same deploy.
3. The gate runs against the CloudFront URL: `/api/health`, then `tests/beam-xp-levels.spec.ts` (Level 1 to Level 2) with `KESTREL_BASE_URL` set. The spec fulfils the agent turn and aborts every other `/api` call, so the gate makes no Bedrock or ElevenLabs call.
4. If the gate fails, the `live` alias is moved back to the version it had before the deploy.

What rolls back and what doesn't:
- **The API rolls back** (alias). The stack then drifts from CloudFormation until the next deploy, which sets the alias again.
- **The web files don't roll back.** To restore them, re-run the workflow on the last good commit (`workflow_dispatch`).
- **A failed `cdk deploy`** is rolled back by CloudFormation itself.

**The deploy role** (`kestrel_infra/github_oidc.py`, stack `KestrelDeployAccess`):
- Only jobs in this repo's `production` environment can assume it (`sub` = `repo:Rayyan2235/kestrel:environment:production`, exact match).
- It can assume the CDK bootstrap roles (`cdk-hnb659fds-*`), which do the CloudFormation work, and read or update the `kestrel-api` alias. Nothing else.

**One exception to "no `*` resource":** CDK's `BucketDeployment` grants `cloudfront:CreateInvalidation` and `cloudfront:GetInvalidation` on `*`, with no option to scope them. They can only start or read a cache invalidation. The policy test allows exactly these two.

### One-time owner setup (creates AWS resources)

Needs an AWS account with a billing alert. Run from this folder with admin credentials:

```sh
npx aws-cdk@2.1145.0 bootstrap aws://<account>/us-east-1
npx aws-cdk@2.1145.0 deploy KestrelDeployAccess   # prints DeployRoleArn
```

Then, on GitHub:
1. Create the SSM parameters from **Secrets** above.
2. Settings, Environments: create `production` and limit deployment branches to `main`.
3. Settings, Variables: set `AWS_DEPLOY_ROLE_ARN` to the printed role ARN. Until this is set, the deploy job is skipped.

## Not yet

- The API bundle is real: `pnpm build` writes `apps/api/dist-lambda/lambda.mjs` (`@fastify/aws-lambda`, esbuild), and `app.py` deploys it. Without a build it synthesizes a 503 placeholder.
- On AWS the API still reads `ELEVENLABS_API_KEY` and `DATABASE_URL` from its environment. Reading the SecureString key from SSM, and connecting to DSQL with IAM tokens, are the next PR (P6b). Until then `ELEVENLABS_KEY_PARAM` and `DSQL_ENDPOINT` are set but unread, so a deployed site runs without voice or saved progress (the web falls back to its offline level).
- The deliberately broken deploy that proves the rollback (P6's done-check) needs the first deploy.
- The presigned voice upload route is built (`apps/api/src/storage/s3.ts`; the API role may put only to `voice/*` and `replays/*`). The 9 MB end-to-end check needs a deployed stack.
- The verifier Lambda that reads the queue comes in P3.
