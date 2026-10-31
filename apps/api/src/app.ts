import Fastify from "fastify";
import { CommandSchema } from "../../../packages/contracts/src/index.js";
import { registerLive, liveProviders, type LiveProviders } from "./live.js";
import { registerLedger, type LedgerStore } from "./ledger.js";
import { registerProgress, type ProgressStore } from "./progress.js";
import type { VoiceStore } from "./storage/s3.js";
export function buildApp(providers: LiveProviders = liveProviders, progress: ProgressStore | null = null, ledger: LedgerStore | null = null, voice: VoiceStore | null = null) {
  const app = Fastify({ bodyLimit: 16_384, logger: false });
  registerLive(app, providers, voice);
  registerProgress(app, progress, ledger);
  registerLedger(app, ledger);
  app.get("/api/health", async () => ({
    name: "Kestrel",
    mode: "sandbox",
    capabilities: { liveAi: Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE), speech: Boolean(process.env.ELEVENLABS_API_KEY), mujoco: false, progress: Boolean(progress) },
    // How the browser sends a recording: through S3 (AWS) or in the request body.
    voiceUpload: voice ? "s3" : "direct",
  }));
  app.post("/api/commands", async (request, reply) => {
    if (!CommandSchema.safeParse(request.body).success)
      return reply.code(400).send({
        code: "INVALID_COMMAND",
        message: "Supply a known bot, a nonempty command and a world version.",
      });
    return reply.code(501).send({
      code: "PROVIDER_NOT_CONNECTED",
      message:
        "The live provider is not connected. The browser provides a labeled scripted preview.",
    });
  });
  return app;
}
