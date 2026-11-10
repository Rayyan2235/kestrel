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

### After the first deploy: the database role (once)

On AWS the API reads the ElevenLabs key from `/kestrel/elevenlabs-api-key` at cold start (`apps/api/src/secrets/ssm.ts`) and logs in to DSQL with a fresh IAM token per connection as the non-admin role `kestrel_api` (`apps/api/src/db/dsql.ts`). Until the role exists, the site runs with progress off (the web shows its offline level).

The first deploy prints `DsqlEndpoint` and `ApiRoleArn`. With admin credentials:

```sh
ENDPOINT=<DsqlEndpoint>
TOKEN=$(aws dsql generate-db-connect-admin-auth-token --hostname "$ENDPOINT" --region us-east-1 --expires-in 900)
# 1. The schema, as admin (the token must be URL-encoded inside the URL).
DATABASE_URL="postgres://admin:$(node -p 'encodeURIComponent(process.argv[1])' "$TOKEN")@$ENDPOINT:5432/postgres?sslmode=require" pnpm db:migrate
# 2. The API's role, linked to the Lambda role.
psql "host=$ENDPOINT user=admin dbname=postgres sslmode=require password=$TOKEN" <<'SQL'
CREATE ROLE kestrel_api WITH LOGIN;
AWS IAM GRANT kestrel_api TO '<ApiRoleArn>';
GRANT SELECT, INSERT, UPDATE, DELETE ON learners, prediction_locks, attempts, xp_events, concept_mastery, prompt_stats TO kestrel_api;
-- 3. The verifier's role (VerifierRoleArn): read attempts and locks, decide attempts, append XP.
CREATE ROLE kestrel_verifier WITH LOGIN;
AWS IAM GRANT kestrel_verifier TO '<VerifierRoleArn>';
GRANT SELECT, UPDATE ON attempts TO kestrel_verifier;
GRANT SELECT ON prediction_locks TO kestrel_verifier;
GRANT INSERT ON learners, xp_events TO kestrel_verifier;
-- 4. The nightly job's role (AnalyticsRoleArn): read everything, write the summaries, delete for retention.
CREATE ROLE kestrel_analytics WITH LOGIN;
AWS IAM GRANT kestrel_analytics TO '<AnalyticsRoleArn>';
GRANT SELECT, DELETE ON learners, prediction_locks, attempts, xp_events TO kestrel_analytics;
GRANT SELECT, INSERT, UPDATE, DELETE ON concept_mastery, prompt_stats TO kestrel_analytics;
SQL
```

These steps are written from the AWS DSQL docs and have not been run yet; the first deploy will confirm them.

## Alarms and logs (P7)

`kestrel_infra/alarms.py` adds eight CloudWatch alarms (the free tier covers 10) and one AWS Budget. All of them email the owner through one SNS topic (`AlarmTopicArn`):

| Alarm | Fires when |
| --- | --- |
| `VerifyDlqNotEmpty` | A verify message is in the dead-letter queue (it failed 3 receives). |
| `VerifyQueueStuck` | The oldest verify message has waited 60 s or more. |
| `ApiServerErrors` | The HTTP API returns 5 or more 5xx responses in 5 minutes. |
| `ApiFunctionErrors`, `VerifierErrors` | A Lambda invocation crashes, times out or runs out of memory. |
| `VerifierSlow` | A verification takes 80% or more of the verifier's 60 s timeout. |
| `AnalyticsErrors` | The nightly analytics and retention job fails (P8). |
| `BillingOver10` | Estimated charges for the month reach $10 (us-east-1 only, where the billing metric lives). |
| `kestrel-credits` budget | Spend before credits passes 50% of `AWS_CREDITS_USD` (default 100) for the year. Credits keep the bill near $0, so the $10 alarm alone would not notice them running out. |

The verifier reports a failed message in `batchItemFailures` instead of raising, so a poison message is never a Lambda error. SQS retries it and, after 3 receives (each after the 360 s visibility timeout), moves it to the DLQ. `VerifyQueueStuck` fires first, within a few minutes; `VerifyDlqNotEmpty` fires after about 12-18 minutes.

**Logs:** both Lambdas log JSON, kept 30 days. The API writes one object per request (`apps/api/src/log.ts`): method, route pattern, status and ms, plus the error name and the first 200 characters of its message on a 5xx. It never logs a raw URL, a body or a header. The verifier logs the attempt id and outcome, never the claim.

**Setup (once):**
1. Billing console, Billing preferences: turn on **Receive CloudWatch billing alerts**. Without it the billing metric never appears and `BillingOver10` stays at "insufficient data".
2. GitHub, Settings, Variables: set `ALARM_EMAIL`, and `AWS_CREDITS_USD` to your credit amount. The deploy passes both to `app.py`.
3. After the next deploy, confirm the subscription in the email AWS sends.

**The done-check (a poison message emails an alarm).** With admin credentials, after a deploy:

```sh
QUEUE=$(aws cloudformation describe-stacks --stack-name Kestrel --query "Stacks[0].Outputs[?OutputKey=='VerifyQueueUrl'].OutputValue" --output text)
aws sqs send-message --queue-url "$QUEUE" --message-body 'not a verify message'
# Expect a VerifyQueueStuck email within minutes, then VerifyDlqNotEmpty. Then clear the DLQ:
#   aws sqs purge-queue --queue-url <the DLQ url, from the SQS console>
```

## Nightly analytics and retention (P8)

EventBridge Scheduler runs `kestrel-analytics` at 07:00 UTC. It is the verifier's image with another entry point (`verifier/kestrel_analytics/nightly.py`), connecting to DSQL as `kestrel_analytics`.

1. **Retention first** (`retention.py`): learners not seen for 180 days are deleted with their XP, mastery, attempts and locks. So are attempts over 180 days old whose learner row never existed. Each DELETE is its own transaction of at most 1,000 rows (DSQL allows 3,000), children before parents, because the foreign keys don't cascade.
2. **Then the summaries**, recomputed from attempts the verifier marked `verified` (`model.py`):
   - `concept_mastery`: a Beta(1 + successes, 1 + failures) posterior per learner and concept. Moments prompts and the balance beam are both the `moments` concept.
   - `prompt_stats`: attempts, successes and the median tries to the first success, per prompt.

To delete one learner now (for example, on request), run from `verifier/` with an admin `DATABASE_URL` (see the DSQL steps above):

```sh
DATABASE_URL=... python -m kestrel_analytics.forget <learner-uuid>
```

## Not yet

- The API bundle is real: `pnpm build` writes `apps/api/dist-lambda/lambda.mjs` (`@fastify/aws-lambda`, esbuild), and `app.py` deploys it. Without a build it synthesizes a 503 placeholder.
- The deliberately broken deploy that proves the rollback (P6's done-check) needs the first deploy.
- The presigned voice upload route is built (`apps/api/src/storage/s3.ts`; the API role may put only to `voice/*` and `replays/*`). The 9 MB end-to-end check needs a deployed stack.
- **The verifier Lambda** (`verifier/`, P4) reads the verify queue: batch size 1, at most 2 at once, partial batch failure reporting, 3 receives then the DLQ. It re-simulates Moments attempts and writes the verdict and XP in one transaction (ADR-003). The API's `POST /api/attempts/submit` puts the claim in `replays/<attempt>.json` and sends the message; where the queue is configured, `/api/xp-events` refuses the awards the verifier owns.
