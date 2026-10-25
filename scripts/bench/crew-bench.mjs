import { chromium } from "@playwright/test";
const RUNS = Number(process.env.RUNS ?? 1);
const browser = await chromium.launch(process.env.CI ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : { channel: "chromium" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(process.env.URL ?? "http://127.0.0.1:5180/sandbox.html");
await page.waitForFunction(() => window.kestrelSim && window.kestrelSim.kit.id === "pythagoras", null, { timeout: 90000 });
const rows = await page.evaluate(async (runs) => {
  const sim = window.kestrelSim; sim.stop();
  const out = [];
  for (let k = 0; k < runs; k++) {
    const events = [];
    sim["listener"] = (e) => events.push({ ...e, t: +(sim["data"].time).toFixed(1) });
    sim.reset(); for (let i = 0; i < 25; i++) await sim["controlStep"]();
    const task = { kind: "build_squares" };
    const refusal = sim.runTask(task); if (refusal) { out.push({ refusal }); continue; }
    let n = 0;
    while (n < 50 * 300) { await sim["controlStep"](); n++; if (events.some((e) => e.type === "task-done" && e.task === task)) break; }
    const done = events.find((e) => e.type === "task-done" && e.task === task);
    const props = sim.propPositions();
    const errs = sim.kit.slots.map((s) => { const p = props.get(s.forProp); return `${s.forProp}:${(Math.hypot(p[0] - s.pos[0], p[1] - s.pos[1]) * 100).toFixed(1)}cm`; }).join(" ");
    out.push({ run: k, s: +(n / 50).toFixed(1), ok: done?.ok, errs, falls: events.filter((e) => e.type === "fell").map((e) => e.duck), duckContact: sim.contacts()["pip↔nova"] ?? null, finishes: events.filter((e) => e.type === "task-done").map((e) => `${e.t}s ${e.duck}: ${e.summary.slice(0, 70)}`) });
  }
  return out;
}, RUNS);
for (const r of rows) console.log(JSON.stringify(r, null, 1));
await browser.close();
