import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AgentRequestSchema, validConversation } from "../../../packages/contracts/src/index.js";
import { agentTurn } from "./agent.js";
import { VOICE_KEY, type VoiceStore } from "./storage/s3.js";
import { AUDIO_MAX_BYTES, AUDIO_TYPE, ProviderError, speak, transcribe } from "./voice.js";

export const liveProviders = { agentTurn, speak, transcribe };
export type LiveProviders = typeof liveProviders;
export function registerLive(app: FastifyInstance, providers: LiveProviders = liveProviders, voice: VoiceStore | null = null) {
  // No provider bodies, audio, history, or credentials are logged or persisted.
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const origin = request.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return reply.code(403).send({ message: "Use the local Kestrel page." });
  });
  let active = 0;
  async function run(request: FastifyRequest, reply: FastifyReply, fn: (signal: AbortSignal) => Promise<unknown>) {
    if (active >= 4) return reply.code(429).send({ message: "The lab is busy. Try again shortly." });
    active++;
    const controller = new AbortController();
    const close = () => { if (!reply.raw.writableEnded) controller.abort(); };
    reply.raw.on("close", close);
    try { return await fn(controller.signal); }
    catch (error) {
      if (controller.signal.aborted) return reply.code(499).send({ message: "Request stopped." });
      return reply.code(502).send({ code: "PROVIDER_ERROR", message: error instanceof ProviderError ? error.message : "Claude or speech request failed. Check the server model, credentials and provider access, then try again." });
    } finally { active--; reply.raw.off("close", close); }
  }
  app.post("/api/agent/turn", { bodyLimit: 196608 }, async (request, reply) => {
    const parsed = AgentRequestSchema.safeParse(request.body);
    if (!parsed.success || !validConversation(parsed.data.messages)) return reply.code(400).send({ message: "Invalid agent request or unpaired action results." });
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) return reply.code(503).send({ message: "Set Bedrock credentials in the server .env." });
    return run(request, reply, signal => providers.agentTurn(parsed.data, signal));
  });
  app.addContentTypeParser(AUDIO_TYPE, { parseAs: "buffer", bodyLimit: AUDIO_MAX_BYTES }, (_request, body, done) => done(null, body));
  // On AWS the clip is uploaded to S3 first (see storage/s3.ts); elsewhere it comes in the body.
  app.post("/api/voice/upload-url", async (_request, reply) => {
    if (!voice) return reply.code(404).send({ message: "This server takes recordings directly." });
    if (!process.env.ELEVENLABS_API_KEY) return reply.code(503).send({ message: "Set ELEVENLABS_API_KEY in the server .env." });
    return voice.presign();
  });
  app.post("/api/voice/transcribe", { bodyLimit: AUDIO_MAX_BYTES }, async (request, reply) => {
    const uploaded = z.object({ key: z.string().regex(VOICE_KEY) }).strict().safeParse(request.body);
    if (!uploaded.success && (!Buffer.isBuffer(request.body) || request.body.length < 100)) return reply.code(400).send({ message: "Record some audio first." });
    if (uploaded.success && !voice) return reply.code(404).send({ message: "This server takes recordings directly." });
    if (!process.env.ELEVENLABS_API_KEY) return reply.code(503).send({ message: "Set ELEVENLABS_API_KEY in the server .env." });
    if (uploaded.success) return run(request, reply, signal => voice!.consume(uploaded.data.key, (audio, mime) => providers.transcribe(audio, mime, signal)));
    return run(request, reply, signal => providers.transcribe(request.body as Buffer, request.headers["content-type"]!, signal));
  });
  app.post("/api/voice/speak", async (request, reply) => {
    const parsed = z.object({ text: z.string().trim().min(1).max(2400) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Supply 1-2400 characters to speak." });
    if (!process.env.ELEVENLABS_API_KEY) return reply.code(503).send({ message: "Set ELEVENLABS_API_KEY in the server .env." });
    return run(request, reply, async signal => reply.type("audio/mpeg").send(await providers.speak(parsed.data.text, signal)));
  });
}
