import { AgentResponseSchema, DuckTaskSchema, MOMENTS, slotFilled, type AgentMessage, type AgentRequest, type BotId, type DuckTask } from "@kestrel/contracts";
import type { DuckSim, SimEvent } from "../simulation/duckSim";
import type { LessonId } from "../lessons/lessonContent";

export type AgentPhase = "Ready" | "Listening" | "Microphone permission" | "Transcribing" | "Thinking" | "Acting" | "Speaking";
type Outcome = { ok: boolean; summary: string };
export type Recipient = BotId | "both";
const aborted = () => new DOMException("Stopped", "AbortError");
const concisePublicText = (text: string) => text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.slice(0, 2).join("").trim().slice(0, 320) ?? "";
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
  private pending = new Map<DuckTask, (outcome: Outcome) => void>();
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private captureHeld = false;
  private captureTimer: ReturnType<typeof setTimeout> | undefined;
  private playbackCancel: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private soundBuffer: Promise<AudioBuffer> | null = null;
  private soundSource: AudioBufferSourceNode | null = null;
  private soundDone: (() => void) | null = null;
  private recipient: Recipient = "pip";
  robotSound = true;
  phase: AgentPhase = "Ready";

  constructor(private sim: DuckSim, private add: (who: "you" | "duck", text: string, ok?: boolean, speaker?: BotId) => void, private change: (phase: AgentPhase) => void, private onLearningAction: (action: "book" | "quiz", lesson: LessonId) => void = () => {}) {}
  private setPhase(phase: AgentPhase) { this.phase = phase; this.change(phase); }
  setRecipient(recipient: Recipient) { this.recipient = recipient; }
  private alive(signal: AbortSignal) { if (signal.aborted) throw aborted(); }
  private silence() {
    try { this.playbackCancel?.(); } catch { /* A source that failed before start cannot be stopped. */ }
    this.playbackCancel = null;
    try { this.soundSource?.stop(); } catch { /* The source may already have ended. */ }
    this.soundSource = null;
    this.soundDone?.();
    this.soundDone = null;
  }
  primeRobotSound() {
    if (!this.robotSound || typeof window === "undefined" || !("AudioContext" in window)) return;
    this.audioContext ??= new AudioContext();
    void this.audioContext.resume().catch(error => console.warn("Could not enable robot sound playback:", error));
    this.soundBuffer ??= fetch("/audio/bd1-reply.mp3")
      .then(response => {
        if (!response.ok) throw new Error(`Audio file request failed (${response.status}).`);
        return response.arrayBuffer();
      })
      .then(bytes => this.audioContext!.decodeAudioData(bytes))
      .catch(error => { this.soundBuffer = null; throw error; });
  }
  setRobotSound(enabled: boolean) { this.robotSound = enabled; if (!enabled) this.silence(); else this.primeRobotSound(); }
  setVoice(enabled: boolean) { this.setRobotSound(enabled); }
  cancel(clearHistory = false) {
    this.controller.abort();
    this.controller = new AbortController();
    this.version++;
    for (const resolve of this.pending.values()) resolve({ ok: false, summary: "Interrupted by the learner." });
    this.pending.clear();
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
  event(event: SimEvent): boolean {
    if (event.type === "reset") this.cancel(true);
    else if (event.type === "task-done") {
      const resolve = this.pending.get(event.task);
      if (!resolve) return false;
      resolve({ ok: event.ok, summary: event.summary });
      this.pending.delete(event.task);
      return true;
    }
    return false;
  }
  private world(recipient: Recipient): AgentRequest["world"] {
    const positions = this.sim.propPositions();
    const status = this.sim.status(recipient === "nova" ? "nova" : "pip");
    const novaStatus = this.sim.status("nova");
    const pipStatus = this.sim.status("pip");
    return {
      lesson: this.sim.kit.id,
      duck: { ...status.pose, mode: status.mode },
      robots: {
        pip: { ...pipStatus.pose, mode: pipStatus.mode },
        nova: { ...novaStatus.pose, mode: novaStatus.mode },
      },
      // Paddles are part of their weights, not things to talk about.
      props: this.sim.kit.props.filter(p => p.role !== "paddle").map(p => ({ id: p.id, label: p.label, movable: p.joint === "free", position: positions.get(p.id) ?? [p.pos[0], p.pos[1]], ...(p.units ? { units: p.units } : {}) })),
      slots: this.sim.kit.slots.map(s => ({ forProp: s.forProp, position: s.pos, filled: slotFilled(positions.get(s.forProp) ?? [99, 99], s) })),
      ...(status.balance ? { balance: balanceSnapshot(status.balance) } : {}),
    };
  }
  private async say(text: string, signal: AbortSignal) {
    this.alive(signal);
    text = concisePublicText(text);
    if (!text) return;
    this.add("duck", text, true, this.recipient === "nova" ? "nova" : "pip");
    if (!this.robotSound) return;
    await this.playRobotSound(signal);
  }
  async announce(text: string, ok = true, playSound = true) {
    const signal = this.controller.signal;
    const concise = concisePublicText(text);
    if (!concise) return;
    this.add("duck", concise, ok, this.recipient === "nova" ? "nova" : "pip");
    if (this.robotSound && playSound) {
      try { await this.playRobotSound(signal); }
      finally { if (!signal.aborted) this.setPhase("Ready"); }
    }
  }
  private async playRobotSound(signal: AbortSignal, updatePhase = true) {
    this.alive(signal);
    this.primeRobotSound();
    const context = this.audioContext;
    const bufferPromise = this.soundBuffer;
    if (!context || !bufferPromise) return;
    if (updatePhase) this.setPhase("Speaking");
    try {
      const buffer = await bufferPromise;
      this.alive(signal);
      await context.resume();
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", stop);
          this.playbackCancel = null;
          this.soundDone = null;
          this.soundSource = null;
          resolve();
        };
        const stop = () => { this.soundSource?.stop(); finish(); };
        const timer = setTimeout(finish, 10000);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = finish;
        this.soundSource = source;
        this.soundDone = finish;
        this.playbackCancel = stop;
        signal.addEventListener("abort", stop, { once: true });
        try { source.start(); } catch (error) {
          clearTimeout(timer);
          signal.removeEventListener("abort", stop);
          this.playbackCancel = null;
          this.soundDone = null;
          this.soundSource = null;
          reject(error);
        }
      });
    } catch (error) {
      console.warn("Robot reply sound could not play:", error);
      if (this.soundBuffer === bufferPromise && error instanceof Error && !signal.aborted) this.soundBuffer = null;
    }
  }
  private act(task: DuckTask, signal: AbortSignal, recipient: Recipient): Promise<Outcome> {
    this.alive(signal);
    this.setPhase("Acting");
    const shared = task.kind === "build_squares" || task.kind === "set_balance";
    if (recipient === "both" && ["push", "go_to", "place_weight"].includes(task.kind))
      return Promise.resolve({ ok: false, summary: "That object task needs one robot. Choose Pip or Nova, or ask for a coordinated lesson action." });
    const targets: (BotId | "lab")[] = shared ? ["lab"] : recipient === "both" ? ["pip", "nova"] : [recipient];
    const tasks = targets.map(() => structuredClone(task));
    const waits = tasks.map((copy, i) => new Promise<Outcome>((resolve, reject) => {
      const finish = (outcome: Outcome) => { clearTimeout(timer); signal.removeEventListener("abort", stop); this.pending.delete(copy); resolve(outcome); };
      const stop = () => { clearTimeout(timer); this.pending.delete(copy); reject(aborted()); };
      const timer = setTimeout(() => {
        this.sim.stopAll();
        finish({ ok: false, summary: "Action timed out; the simulator did not report success." });
      }, shared ? 300000 : 180000);
      this.pending.set(copy, finish);
      signal.addEventListener("abort", stop, { once: true });
      const target = targets[i] === "lab" ? "pip" : targets[i]!;
      const refusal = this.sim.runTask(copy, target);
      if (refusal) finish({ ok: false, summary: refusal });
    }));
    return Promise.all(waits).then(results => results.length === 1 ? results[0]! : {
      ok: results.every(r => r.ok),
      summary: results.map((r, i) => `${targets[i] === "pip" ? "Pip" : "Nova"}: ${r.summary}`).join(" "),
    });
  }
  async demonstrate(lesson: LessonId): Promise<Outcome> {
    this.cancel();
    const signal = this.controller.signal;
    this.primeRobotSound();
    const task: DuckTask = lesson === "pythagoras"
      ? { kind: "build_squares" }
      : { kind: "set_balance", left_cm: 10, right_cm: 20 };
    try {
      const sound = this.robotSound ? this.playRobotSound(signal, false) : Promise.resolve();
      const outcome = await this.act(task, signal, "both");
      await sound;
      this.alive(signal);
      this.history = [...this.history,
        { role: "user", content: [{ type: "text", text: `The coordinated ${lesson} demonstration finished: ${outcome.summary}` }] },
        { role: "assistant", content: [{ type: "text", text: outcome.summary }] },
      ].slice(-8) as AgentMessage[];
      return outcome;
    } finally { if (!signal.aborted) this.setPhase("Ready"); }
  }
  async submit(text: string, recipient: Recipient = this.recipient, mode: "normal" | "follow-up" = "normal") {
    text = text.trim();
    if (!text) return;
    this.recipient = recipient;
    this.cancel();
    this.primeRobotSound();
    this.add("you", text);
    if (/^(stop|halt|freeze|wait)[.!]?$/i.test(text)) { this.add("duck", "Stopped."); return; }
    const signal = this.controller.signal;
    const version = this.version;
    const modelText = mode === "follow-up" ? `Answer this learner follow-up without reopening the lesson flow: ${text}` : text;
    const messages: AgentMessage[] = [...this.history, { role: "user", content: [{ type: "text", text: modelText }] }];
    const summary: string[] = [];
    const deadline = setTimeout(() => { if (!signal.aborted) { this.cancel(); this.add("duck", "I stopped at the time limit. You can ask me to continue.", false); } }, 8 * 60 * 1000);
    try {
      // Six physical actions, then one text-only measured conclusion.
      for (let step = 0; step <= 6; step++) {
        this.alive(signal);
        this.setPhase("Thinking");
        const request: AgentRequest = { botId: recipient, worldVersion: version, world: this.world(recipient), messages, final: step === 6 };
        const response = AgentResponseSchema.parse(await (await checked(await fetch("/api/agent/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]) }))).json());
        this.alive(signal);
        if (response.worldVersion !== this.version) throw aborted();
        messages.push({ role: "assistant", content: response.content });
        const calls = response.content.filter(b => b.type === "tool_use");
        const words = response.content.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
        const learningCall = calls.find(call => call.name === "open_lesson_book" || call.name === "open_lesson_quiz");
        if (learningCall) {
          if (mode === "follow-up") {
            const reply = concisePublicText(words) || "I can clarify that. Which part would you like me to explain?";
            summary.push(reply);
            await this.say(reply, signal);
          } else if (learningCall.name === "open_lesson_book") {
            const intro = concisePublicText(words) || (learningCall.input.lesson === "pythagoras"
              ? "In a right triangle, the squares on the two shorter sides have areas that add up to the square on the hypotenuse: a squared plus b squared equals c squared."
              : "A moment is the turning effect of a weight: its mass multiplied by its distance from the pivot.");
            summary.push(intro);
            const shownAt = Date.now();
            await this.say(intro, signal);
            // Keep the learner-facing introduction visible before the modal dims the chat.
            const remaining = 2000 - (Date.now() - shownAt);
            if (remaining > 0) await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, remaining);
              const stop = () => { clearTimeout(timer); reject(aborted()); };
              signal.addEventListener("abort", stop, { once: true });
            });
            this.alive(signal);
            this.onLearningAction("book", learningCall.input.lesson);
          } else {
            if (words) { summary.push(words); await this.say(words, signal); }
            this.onLearningAction("quiz", learningCall.input.lesson);
          }
          break;
        }
        if (!calls.length) break;
        if (calls.length !== 1 || step === 6) throw new Error("The agent exceeded its action budget.");
        const call = calls[0];
        if (call.name !== "duck_task") throw new Error("Unknown agent action.");
        const task = DuckTaskSchema.parse(call.input);
        const result = await this.act(task, signal, recipient);
        this.alive(signal);
        summary.push(`Measured ${JSON.stringify(task)}: ${result.summary}`);
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: !result.ok, content: JSON.stringify({ ...result, world: this.world(recipient) }) }] });
        this.alive(signal);
        continue;
      }
      const finalWords = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.content.filter(b => b.type === "text").map(b => b.text).join(" ") : "";
      if (finalWords && !summary.includes(finalWords)) await this.say(finalWords, signal);
      this.history = [...this.history, { role: "user", content: [{ type: "text", text: modelText }] }, { role: "assistant", content: [{ type: "text", text: summary.join("\n").slice(-2400) || "Turn ended." }] }].slice(-8) as AgentMessage[];
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
    this.primeRobotSound();
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
      await this.submit(text);
    } catch (error) {
      if (!signal.aborted) { this.add("duck", (error as Error).message, false); this.setPhase("Ready"); }
    }
  }
}
