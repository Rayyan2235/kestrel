import awsLambdaFastify from "@fastify/aws-lambda";
import { buildApp } from "./app.js";
import { assertEdgeConfigured } from "./edge.js";
import { connectProgress } from "./progress.js";
import { loadSecrets } from "./secrets/ssm.js";
import { voiceStoreFromEnv } from "./storage/s3.js";
import { verifierFromEnv } from "./verify.js";

// AWS Lambda entry (bundled by scripts/build-lambda.mjs to dist-lambda/).
// The same app as index.ts; connections open once per cold start.
assertEdgeConfigured();
await loadSecrets();
const progress = await connectProgress();
const app = buildApp(undefined, {
  progress: progress?.store,
  ledger: progress?.ledger,
  voice: voiceStoreFromEnv(),
  verify: verifierFromEnv(),
  insights: progress?.insights,
});
export const handler = awsLambdaFastify(app);
await app.ready();
