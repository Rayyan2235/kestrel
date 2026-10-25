/** Sound effects made with Web Audio, so no clip has to be licensed. */
let ctx: AudioContext | null = null;

/** Create or resume the audio context; call it from a click so the browser allows sound. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** A short cartoon boom: filtered noise falling in pitch, over a low thump. */
export function playBoom() {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(2000, now);
    low.frequency.exponentialRampToValueAtTime(90, now + 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.7, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    noise.connect(low).connect(gain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.72);
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.35);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.6, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.42);
  } catch {
    /* No sound this time. */
  }
}
