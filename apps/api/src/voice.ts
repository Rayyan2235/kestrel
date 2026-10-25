export class ProviderError extends Error {
  constructor(public status: number, public provider: string, detail = "") {
    super(`${provider} rejected the request (${status})${detail ? `: ${detail}` : ". Check the server credentials, permissions and quota."}`);
  }
}
async function eleven(path: string, body: BodyInit, signal: AbortSignal, json = false) {
  const response = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, ...(json ? { "Content-Type": "application/json" } : {}) },
    body, signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
  });
  if (!response.ok) {
    // ElevenLabs explains 400s with useful validation details (for example an
    // unsupported audio container). Surface only that safe message, never the
    // request headers or API key.
    let detail = "";
    try {
      const payload = await response.json() as { detail?: unknown; message?: unknown };
      const value = typeof payload.detail === "object" && payload.detail !== null
        ? (payload.detail as { message?: unknown }).message
        : payload.detail ?? payload.message;
      if (typeof value === "string") detail = value.replace(/[\r\n]+/g, " ").slice(0, 300);
    } catch { /* Provider gave no readable validation message. */ }
    throw new ProviderError(response.status, "ElevenLabs", detail);
  }
  return response;
}
export async function transcribe(audio: Buffer, mime: string, signal: AbortSignal) {
  const form = new FormData();
  form.set("model_id", "scribe_v2");
  form.set("language_code", "en");
  form.set("tag_audio_events", "false");
  form.set("file", new Blob([new Uint8Array(audio)], { type: mime }), "recording." + (mime.includes("mp4") ? "m4a" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "webm"));
  const response = await eleven("speech-to-text", form, signal);
  const data = await response.json() as { text?: unknown };
  if (typeof data.text !== "string") throw new Error("Invalid transcription");
  return { text: data.text.trim().slice(0, 2000) };
}
export async function speak(text: string, signal: AbortSignal) {
  const plain = text.replace(/[*_`#]/g, "").replace(/\p{Extended_Pictographic}/gu, "").trim();
  const voice = process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX";
  const response = await eleven(`text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, JSON.stringify({ text: plain, model_id: "eleven_flash_v2_5" }), signal, true);
  return Buffer.from(await response.arrayBuffer());
}
