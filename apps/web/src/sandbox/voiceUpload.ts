// Sends a recording to /api/voice/transcribe and returns its response. When
// /api/health says `voiceUpload: "s3"` (AWS), the clip goes to S3 first by
// presigned POST, because Lambda can't take a 10 MB request; otherwise
// (Vultr, local) it rides in the request body.

let mode: Promise<string> | null = null;
const uploadMode = () =>
  (mode ??= fetch("/api/health")
    .then((r) => r.json())
    .then((h) => (h.voiceUpload === "s3" ? "s3" : "direct"))
    .catch(() => "direct"));

export async function transcribeRecording(blob: Blob, signal: AbortSignal): Promise<Response> {
  const type = blob.type || "audio/webm";
  if ((await uploadMode()) !== "s3")
    return fetch("/api/voice/transcribe", { method: "POST", headers: { "Content-Type": type }, body: blob, signal });
  const grant = await fetch("/api/voice/upload-url", { method: "POST", signal });
  if (!grant.ok) return grant;
  const { url, fields, key } = (await grant.json()) as { url: string; fields: Record<string, string>; key: string };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("Content-Type", type);
  form.set("file", blob);
  const upload = await fetch(url, { method: "POST", body: form, signal });
  if (!upload.ok) return Response.json({ message: "The recording didn't upload. Please try again." }, { status: 502 });
  return fetch("/api/voice/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), signal });
}
