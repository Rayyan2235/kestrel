import { transcribeRecording } from "./voiceUpload";

/** Capture only on an explicit learner action. Transcribe through the existing server. */
export class RescueVoice {
  private controller = new AbortController();
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private callbacks: {
      status: (s: string) => void;
      transcript: (s: string) => void;
      error: (s: string) => void;
    },
  ) {}
  cancel() {
    this.controller.abort();
    clearTimeout(this.timer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
  async start() {
    this.cancel();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.callbacks.status("Microphone permission");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "This browser cannot record audio. Type your directions instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (signal.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        if (!signal.aborted) {
          this.cancel();
          this.callbacks.status("Ready");
          this.callbacks.error(
            "Recording failed. Try again or type your directions.",
          );
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!signal.aborted)
          void this.transcribe(
            new Blob(chunks, { type: recorder.mimeType }),
            signal,
          );
      };
      recorder.start();
      this.callbacks.status("Listening");
      this.timer = setTimeout(() => this.finish(), 15000);
    } catch (e) {
      if (!signal.aborted) {
        this.cancel();
        this.callbacks.status("Ready");
        this.callbacks.error((e as Error).message);
      }
    }
  }
  finish() {
    clearTimeout(this.timer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    else {
      this.cancel();
      this.callbacks.status("Ready");
    }
  }
  private async transcribe(blob: Blob, signal: AbortSignal) {
    this.callbacks.status("Transcribing");
    try {
      if (blob.size < 100)
        throw new Error(
          "No speech captured. Try again or type your directions.",
        );
      const response = await transcribeRecording(
        blob,
        AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      );
      const data = await response.json();
      if (signal.aborted) return;
      if (!response.ok)
        throw new Error(
          data.message || "Voice is unavailable. Type your directions instead.",
        );
      if (typeof data.text !== "string" || !data.text.trim())
        throw new Error("I did not hear a route. Try again.");
      this.callbacks.status("Ready");
      this.callbacks.transcript(data.text.trim());
    } catch (e) {
      if (!signal.aborted) {
        this.callbacks.status("Ready");
        this.callbacks.error((e as Error).message);
      }
    }
  }
}
