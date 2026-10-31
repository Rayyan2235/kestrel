import { buildApp } from "./app.js";
import { connectProgress } from "./progress.js";
import { voiceStoreFromEnv } from "./storage/s3.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
// pnpm starts in apps/api; built entry may also run from the repository root.
const envFile = [resolve("../../.env"), resolve(".env")].find(existsSync);
if (envFile) process.loadEnvFile(envFile);
const progress = await connectProgress();
const app = buildApp(undefined, progress?.store ?? null, progress?.ledger ?? null, voiceStoreFromEnv());
try {
  await app.listen({
    host: "127.0.0.1",
    port: Number(process.env.PORT || 5181),
  });
  console.log("Kestrel API: http://127.0.0.1:5181");
} catch (error) {
  console.error(error);
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await progress?.close();
    process.exit(0);
  });
