import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { s3VoiceStore, VOICE_KEY, type VoiceStore } from "./s3.js";

// Signing is local, so fake credentials never reach the network. Reads and
// deletes go through a stubbed client.send.
const signer = new S3Client({ region: "us-east-1", credentials: { accessKeyId: "AKIDFAKE", secretAccessKey: "fake" } });
const KEY = "voice/123e4567-e89b-42d3-a456-426614174000";
afterEach(() => vi.unstubAllEnvs());

function stubbed(audio = "x".repeat(200)) {
  const send = vi.fn(async (command: unknown) =>
    command instanceof GetObjectCommand ? { ContentType: "audio/webm", Body: { transformToByteArray: async () => Buffer.from(audio) } } : {},
  );
  return { send, store: s3VoiceStore({ send } as unknown as S3Client, "data-bucket") };
}

it("grants a 5-minute upload of 1 byte to 10 MB of audio under a fresh voice/<uuid> key", async () => {
  const before = Date.now();
  const grant = await s3VoiceStore(signer, "data-bucket").presign();
  expect(grant.key).toMatch(VOICE_KEY);
  expect(grant.fields.key).toBe(grant.key);
  const policy = JSON.parse(Buffer.from(grant.fields.Policy!, "base64").toString());
  expect(policy.conditions).toContainEqual(["content-length-range", 1, 10485760]);
  expect(policy.conditions).toContainEqual(["starts-with", "$Content-Type", "audio/"]);
  expect(policy.conditions).toContainEqual({ key: grant.key });
  const expires = Date.parse(policy.expiration) - before;
  expect(expires).toBeGreaterThan(290_000);
  expect(expires).toBeLessThanOrEqual(301_000);
});

it("deletes the clip after transcribing it, and also when transcription fails", async () => {
  const { send, store } = stubbed();
  expect(await store.consume(KEY, async (audio, mime) => `${audio.length} ${mime}`)).toBe("200 audio/webm");
  expect(send.mock.calls.at(-1)![0]).toBeInstanceOf(DeleteObjectCommand);
  send.mockClear();
  await expect(store.consume(KEY, async () => { throw new Error("ElevenLabs down"); })).rejects.toThrow("ElevenLabs down");
  expect(send.mock.calls.map(([c]) => (c as object).constructor)).toEqual([GetObjectCommand, DeleteObjectCommand]);
  expect((send.mock.calls[1]![0] as DeleteObjectCommand).input).toEqual({ Bucket: "data-bucket", Key: KEY });
});

it("transcribes an uploaded key only on an S3 server, and only for voice/<uuid> keys", async () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "test");
  const transcribe = vi.fn().mockResolvedValue({ text: "Move right" });
  const providers = { agentTurn: vi.fn(), speak: vi.fn(), transcribe };
  const { store } = stubbed();
  const s3 = buildApp(providers, null, null, store as VoiceStore);
  const direct = buildApp(providers);
  try {
    expect((await s3.inject("/api/health")).json().voiceUpload).toBe("s3");
    expect((await direct.inject("/api/health")).json().voiceUpload).toBe("direct");
    const ok = await s3.inject({ method: "POST", url: "/api/voice/transcribe", payload: { key: KEY } });
    expect(ok.json()).toEqual({ text: "Move right" });
    expect(transcribe.mock.calls[0]!.slice(0, 2)).toEqual([Buffer.from("x".repeat(200)), "audio/webm"]);
    for (const key of ["replays/123e4567-e89b-42d3-a456-426614174000", "voice/../replays/x", `${KEY}x`])
      expect((await s3.inject({ method: "POST", url: "/api/voice/transcribe", payload: { key } })).statusCode).toBe(400);
    expect((await direct.inject({ method: "POST", url: "/api/voice/transcribe", payload: { key: KEY } })).statusCode).toBe(404);
    expect((await direct.inject({ method: "POST", url: "/api/voice/upload-url" })).statusCode).toBe(404);
  } finally {
    await s3.close();
    await direct.close();
  }
});
