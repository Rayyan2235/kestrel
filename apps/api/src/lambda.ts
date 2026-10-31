import awsLambdaFastify from "@fastify/aws-lambda";
import { buildApp } from "./app.js";
import { connectProgress } from "./progress.js";
import { voiceStoreFromEnv } from "./storage/s3.js";

// AWS Lambda entry (bundled by scripts/build-lambda.mjs to dist-lambda/).
// The same app as index.ts; connections open once per cold start.
const progress = await connectProgress();
const app = buildApp(undefined, progress?.store ?? null, progress?.ledger ?? null, voiceStoreFromEnv());
export const handler = awsLambdaFastify(app);
await app.ready();
