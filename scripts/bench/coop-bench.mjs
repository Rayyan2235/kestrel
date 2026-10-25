// Cooperative balance bench: the full lock → push → withdraw → verify → release
// experiment with both robots, fast-stepped, for several target pairs.
import { chromium } from "@playwright/test";
const CASES = JSON.parse(process.env.CASES ?? "[[10,20],[15,30],[20,20],[10,30],[25,12]]");
const browser = await chromium.launch(process.env.CI ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : { channel: "chromium" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(process.env.URL ?? "http://127.0.0.1:5180/sandbox.html");
await page.waitForFunction(() => window.kestrelSim, null, { timeout: 90000 });
await page.getByRole("button", { name: /Moments/ }).click();
await page.waitForFunction(() => window.kestrelSim.kit.id === "moments", null, { timeout: 30000 });
const rows = await page.evaluate(async (cases) => {
  const sim = window.kestrelSim; sim.stop();
  const events = [];
  sim["listener"] = (e) => events.push({ ...e, t: +sim["data"].time.toFixed(2) });
  const step = async () => sim["controlStep"]();
  const out = [];
  for (const [l, r] of cases) {
    sim.reset(); events.length = 0;
    for (let i = 0; i < 25; i++) await step();
    const task = { kind: "set_balance", left_cm: l, right_cm: r };
    const refusal = sim.runTask(task);
    if (refusal) { out.push({ case: [l, r], refusal }); continue; }
    const phases = [];
    let last = "", n = 0;
    while (n < 50 * 240) {
      await step(); n++;
      const ph = sim.status().experiment?.phase ?? "";
      const pp = sim.status("pip").phase, np = sim.status("nova").phase;
      const key = `${ph}|${pp ?? "-"}|${np ?? "-"}`;
      if (key !== last) { phases.push(`${(n / 50).toFixed(1)}s ${key}`); last = key; }
      if (events.some((e) => e.type === "experiment")) break;
    }
    const res = events.find((e) => e.type === "experiment")?.result;
    const ledger = sim.contacts();
    const robotPushes = Object.fromEntries(Object.entries(ledger).filter(([k]) => /paddle|weight|plank|pivot|pip↔nova/.test(k)).map(([k, v]) => [k, { peakN: +v.peakN.toFixed(2), impulseNs: +v.impulseNs.toFixed(3), maxPenMm: +(v.maxPenetrationM * 1000).toFixed(2), samples: v.samples }]));
    out.push({
      case: [l, r], seconds: +(n / 50).toFixed(1), ok: res?.ok, summary: res?.summary,
      measuredCm: res ? [res.left.cm, res.right.cm] : null, predicted: res?.predicted, measured: res?.measured,
      falls: events.filter((e) => e.type === "fell").map((e) => e.duck), contacts: robotPushes,
      failures: events.filter((e) => e.type === "task-done" && !e.ok).map((e) => `${e.duck}: ${e.summary}`),
      timeline: phases.slice(0, 40),
    });
  }
  return out;
}, CASES);
for (const r of rows) console.log(JSON.stringify(r, null, 1));
await browser.close();
