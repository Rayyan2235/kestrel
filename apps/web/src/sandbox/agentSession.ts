import { AgentResponseSchema, DuckTaskSchema, MOMENTS, slotFilled, type AgentMessage, type AgentRequest, type BotId, type DuckTask } from "@kestrel/contracts";
import type { DuckSim, SimEvent } from "../simulation/duckSim";

export type AgentPhase = "Ready" | "Listening" | "Microphone permission" | "Transcribing" | "Thinking" | "Acting" | "Speaking";
type Outcome = { ok: boolean; summary: string };
const aborted = () => new DOMException("Stopped", "AbortError");
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status}).`);
  }
  return response;
}

/** The balance as measured, in the learner's terms: grams, sides and centimetres. */
export function balanceSnapshot(b: NonNullable<ReturnType<DuckSim["status"]>["balance"]>): NonNullable<AgentRequest["world"]["balance"]> {
  // Round first, then classify, so the label agrees with the number shown.
  const deg = Math.round(Math.abs((b.angle * 180) / Math.PI) * 10) / 10;
  return {
    plank: b.pin === "free" ? "released" : b.pin,
    lowSide: deg < 0.5 ? "level" : b.angle > 0 ? "left" : "right",
    tiltDeg: deg,
    weights: [...b.rails].map(([id, at]) => ({
      id,
      grams: MOMENTS.weights.find(w => w.id === id)?.grams ?? 0,
      side: at < 0 ? "left" as const : "right" as const,
      cm: Math.round(Math.abs(at) * 1000) / 10,
    })),
  };
}

/** One owner for capture, requests, physical actions and playback cancellation. */
export class AgentSession {
  private controller = new AbortController();
  private version = 0;
  private history: AgentMessage[] = [];
  private pending: { task: DuckTask; resolve: (outcome: Outcome) => void } | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private captureHeld = false;
  private captureTimer: ReturnType<typeof setTimeout> | undefined;
  private playbackCancel: (() => void) | null = null;
  private speechController: AbortController | null = null;
  voice = true;
  phase: AgentPhase = "Ready";
  /** Which robot this turn speaks as (resolved by the console). */
  private botId: BotId = "pip";
  /** Set by the console to route a transcript (by spoken name) before it is submitted. */
  onTranscript?: (text: string) => void | Promise<void>;

  constructor(private sim: DuckSim, private add: (who: "you" | "duck", text: string, ok?: boolean) => void, private change: (phase: AgentPhase) => void) {}
  private setPhase(phase: AgentPhase) { this.phase = phase; this.change(phase); }
  private alive(signal: AbortSignal) { if (signal.aborted) throw aborted(); }
  private silence() {
    this.speechController?.abort();
    this.audio?.pause();
    this.playbackCancel?.();
    this.playbackCancel = null;
    this.audio = null;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = null;
  }
  setVoice(enabled: boolean) { this.voice = enabled; if (!enabled) this.silence(); }
  cancel(clearHistory = false) {
    this.controller.abort();
    this.controller = new AbortController();
    this.version++;
    this.pending?.resolve({ ok: false, summary: "Interrupted by the learner." });
    this.pending = null;
    this.sim.stopAll?.();
    this.sim.tasks.cancel();
    this.sim.manual = { vx: 0, wz: 0 };
    this.silence();
    this.captureHeld = false;
    clearTimeout(this.captureTimer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (clearHistory) this.history = [];
    this.setPhase("Ready");
  }
  event(event: SimEvent) {
    if (event.type === "reset") this.cancel(true);
    else if (event.type === "task-done" && this.pending?.task === event.task) {
      this.pending.resolve({ ok: event.ok, summary: event.summary });
      this.pending = null;
    }
  }
  private world(): AgentRequest["world"] {
    const positions = this.sim.propPositions();
    const status = this.sim.status();
    return {
      lesson: this.sim.kit.id,
      duck: { ...status.pose, mode: status.mode },
      // Paddles are part of their weights, not things to talk about.
      props: this.sim.kit.props.filter(p => p.role !== "paddle").map(p => ({ id: p.id, label: p.label, movable: p.joint === "free", position: positions.get(p.id) ?? [p.pos[0], p.pos[1]], ...(p.units ? { units: p.units } : {}) })),
      slots: this.sim.kit.slots.map(s => ({ forProp: s.forProp, position: s.pos, filled: slotFilled(positions.get(s.forProp) ?? [99, 99], s) })),
      ...(status.balance ? { balance: balanceSnapshot(status.balance) } : {}),
    };
  }
  private async say(text: string, signal: AbortSignal) {
    this.alive(signal);
    this.add("duck", text);
    if (!this.voice) return;
    this.setPhase("Speaking");
    const speech = new AbortController();
    this.speechController = speech;
    try {
      const response = await checked(await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.any([signal, speech.signal, AbortSignal.timeout(55000)]) }));
      const blob = await response.blob();
      this.alive(signal);
      if (!this.voice || speech.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      this.audioUrl = url;
      const audio = new Audio(url);
      this.audio = audio;
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", stop);
          this.playbackCancel = null;
          error ? reject(error) : resolve();
        };
        const stop = () => { audio.pause(); finish(aborted()); };
        const timer = setTimeout(() => { audio.pause(); finish(new Error("Speech playback timed out.")); }, 90000);
        this.playbackCancel = () => finish();
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error("Speech playback failed."));
        signal.addEventListener("abort", stop, { once: true });
        void audio.play().catch(() => finish(new Error("Browser blocked speech playback. You can keep using text, or enable sound and try again.")));
      });
      URL.revokeObjectURL(url);
      if (this.audio === audio) { this.audio = null; this.audioUrl = null; }
    } catch (error) {
      this.alive(signal);
      if (!speech.signal.aborted) this.add("duck", `Speech unavailable: ${(error as Error).message}`, false);
    }
  }
  private act(task: DuckTask, signal: AbortSignal): Promise<Outcome> {
    this.alive(signal);
    this.setPhase("Acting");
    return new Promise((resolve, reject) => {
      const finish = (outcome: Outcome) => { clearTimeout(timer); signal.removeEventListener("abort", stop); resolve(outcome); };
      const stop = () => { clearTimeout(timer); this.pending = null; reject(aborted()); };
      const timer = setTimeout(() => {
        this.sim.tasks.cancel(); this.pending = null;
        finish({ ok: false, summary: "Action timed out; the simulator did not report success." });
      }, 180000);
      this.pending = { task, resolve: finish };
      signal.addEventListener("abort", stop, { once: true });
      const refusal = this.sim.runTask(task);
      if (refusal) { this.pending = null; finish({ ok: false, summary: refusal }); }
    });
  }
  async submit(text: string, botId: BotId = "pip") {
    text = text.trim();
    if (!text) return;
    this.botId = botId;
    this.cancel();
    this.add("you", text);
    if (/^(stop|halt|freeze|wait)[.!]?$/i.test(text)) { this.add("duck", "Stopped."); return; }
    const signal = this.controller.signal;
    const version = this.version;
    const messages: AgentMessage[] = [...this.history, { role: "user", content: [{ type: "text", text }] }];
    const summary: string[] = [];
    const deadline = setTimeout(() => { if (!signal.aborted) { this.cancel(); this.add("duck", "I stopped at the time limit. You can ask me to continue.", false); } }, 8 * 60 * 1000);
    try {
      // Six physical actions, then one text-only measured conclusion.
      for (let step = 0; step <= 6; step++) {
        this.alive(signal);
        this.setPhase("Thinking");
        const request: AgentRequest = { botId: this.botId, worldVersion: version, world: this.world(), messages, final: step === 6 };
        const response = AgentResponseSchema.parse(await (await checked(await fetch("/api/agent/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]) }))).json());
        this.alive(signal);
        if (response.worldVersion !== this.version) throw aborted();
        messages.push({ role: "assistant", content: response.content });
        const words = response.content.filter(b => b.type === "text").map(b => b.text).join(" ");
        if (words) { summary.push(words); await this.say(words, signal); }
        this.alive(signal);
        const calls = response.content.filter(b => b.type === "tool_use");
        if (!calls.length) break;
        if (calls.length !== 1 || step === 6) throw new Error("The agent exceeded its action budget.");
        const call = calls[0];
        const task = DuckTaskSchema.parse(call.input);
        const result = await this.act(task, signal);
        this.alive(signal);
        summary.push(`Measured ${JSON.stringify(task)}: ${result.summary}`);
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: !result.ok, content: JSON.stringify({ ...result, world: this.world() }) }] });
      }
      this.history = [...this.history, { role: "user", content: [{ type: "text", text }] }, { role: "assistant", content: [{ type: "text", text: summary.join("\n").slice(-2400) || "Turn ended." }] }].slice(-8) as AgentMessage[];
    } catch (error) {
      if (!signal.aborted) this.add("duck", (error as Error).message, false);
    } finally {
      clearTimeout(deadline);
      if (!signal.aborted) this.setPhase("Ready");
    }
  }
  async startCapture() {
    if (this.captureHeld) return;
    this.cancel();
    this.captureHeld = true;
    const signal = this.controller.signal;
    this.setPhase("Microphone permission");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone capture requires a supported browser on localhost or HTTPS. You can type instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (signal.aborted || !this.captureHeld) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(m => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (!signal.aborted) void this.transcribe(new Blob(chunks, { type: recorder.mimeType }), signal);
      };
      recorder.onerror = () => { if (!signal.aborted) { this.cancel(); this.add("duck", "Microphone recording failed. Try again or type your request.", false); } };
      recorder.start();
      this.setPhase("Listening");
      this.captureTimer = setTimeout(() => this.endCapture(), 30000);
    } catch (error) {
      if (!signal.aborted) { this.cancel(); this.add("duck", `Microphone unavailable: ${(error as Error).message}`, false); }
    }
  }
  endCapture() {
    this.captureHeld = false;
    clearTimeout(this.captureTimer);
    if (this.recorder?.state === "recording") this.recorder.stop();
    else if (this.phase === "Microphone permission") this.cancel();
  }
  private async transcribe(blob: Blob, signal: AbortSignal) {
    try {
      if (blob.size < 100) throw new Error("No audio captured. Hold the button while speaking.");
      this.setPhase("Transcribing");
      const response = await checked(await fetch("/api/voice/transcribe", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob, signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]) }));
      const { text } = await response.json();
      this.alive(signal);
      if (!text?.trim()) throw new Error("I didn't hear speech. Please try again.");
      await (this.onTranscript ? this.onTranscript(text) : this.submit(text));
    } catch (error) {
      if (!signal.aborted) { this.add("duck", (error as Error).message, false); this.setPhase("Ready"); }
    }
  }
}
