// Explicit paid integration check; not part of CI. Run while pnpm dev is serving.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:5180";
async function post(path, body, mime = "application/json") {
  const t = performance.now();
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": mime }, body: typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  console.log(path, Math.round(performance.now() - t), "ms");
  return r;
}
const phrase = "Please walk forward twenty centimeters.";
const audio = Buffer.from(await (await post("/api/voice/speak", { text: phrase })).arrayBuffer());
assert(audio.length > 1000);
const transcript = await (await post("/api/voice/transcribe", audio, "audio/mpeg")).json();
console.log("Synthetic speech transcript:", transcript.text);
assert.match(transcript.text, /walk forward/i);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", async r => {
    if (r.url().endsWith("/api/agent/turn")) console.log("Agent response", r.status(), JSON.stringify(await r.json()).slice(0, 2000));
  });
  await page.addInitScript(({ base64 }) => {
    window.__played = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__played++; return play.call(this); };
    // Synthetic audio source exercises MediaRecorder and the real STT endpoint.
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      await ctx.resume();
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const output = ctx.createMediaStreamDestination();
      source.connect(output);
      source.start(ctx.currentTime + 0.5);
      output.stream.getTracks().forEach(track => track.addEventListener("ended", () => { void ctx.close(); }));
      return output.stream;
    };
  }, { base64: audio.toString("base64") });
  await page.goto(base + "/sandbox.html");
  await page.waitForFunction(() => window.kestrelSim, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const start = await page.evaluate(() => window.kestrelSim.status().pose);
  const mic = page.getByRole("button", { name: "Hold to talk", exact: true });
  await mic.dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Hold to talk"]').getAttribute("aria-pressed") === "true");
  await page.waitForTimeout(5000);
  await mic.dispatchEvent("pointerup", { pointerId: 1 });
  await page.waitForFunction(() => document.querySelector('[role="log"]').textContent.includes("Moved"), null, { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-phase"]'), null, { timeout: 90000 });
  const end = await page.evaluate(() => ({ pose: window.kestrelSim.status().pose, played: window.__played }));
  console.log("Microphone pipeline", { movedMeters: Math.hypot(end.pose.x - start.x, end.pose.y - start.y), playedReplies: end.played });
  assert(end.played > 0);
  assert(Math.hypot(end.pose.x - start.x, end.pose.y - start.y) > 0.12);
  console.log("Voice log", await page.getByRole("log").innerText());
  await page.getByRole("button", { name: "Spoken replies" }).click();
  await page.getByRole("button", { name: "Reset the lab" }).click();
  await page.getByLabel("Task for your duck").fill("Show me with the squares why 9 plus 16 equals 25.");
  await page.getByRole("button", { name: "Send task" }).click();
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(5000);
    const snapshot = await page.evaluate(() => {
      const sim = window.kestrelSim;
      return { phase: document.querySelector('[data-testid="agent-phase"]')?.textContent, duck: sim.status().pose, slots: sim.kit.slots.map(s => { const p = sim.propPositions().get(s.forProp); return { id: s.forProp, distance: Math.hypot(p[0] - s.pos[0], p[1] - s.pos[1]) }; }) };
    });
    if (i % 3 === 0 || !snapshot.phase) console.log("Demo", JSON.stringify(snapshot));
    if (!snapshot.phase) break;
  }
  console.log("Demo log", await page.getByRole("log").innerText());
  console.log("Page errors", errors);
  assert.equal(errors.length, 0);
  await page.screenshot({ path: "test-results/live-voice-demo.png" });
} finally { await browser.close(); }
