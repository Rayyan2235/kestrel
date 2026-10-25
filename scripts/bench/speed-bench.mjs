// Real-physics comparison of previous navigation rates and the faster preset.
// Run with CI=1 URL=http://127.0.0.1:5180/console node scripts/bench/speed-bench.mjs
import { chromium } from "@playwright/test";
const browser = await chromium.launch(process.env.CI ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : { channel: "chromium" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(process.env.URL ?? "http://127.0.0.1:5180/sandbox.html");
await page.waitForFunction(() => window.kestrelSim, null, { timeout: 90000 });
await page.getByRole("button", { name: /Free play/ }).click();
await page.waitForFunction(() => window.kestrelSim.kit.id === "free", null, { timeout: 30000 });
const rows = await page.evaluate(async () => {
  const sim = window.kestrelSim; sim.stop();
  const { Navigator, NAV } = await import("/src/simulation/navigate.ts");
  const m = sim["model"], d = sim["data"], mj = sim["mujoco"];
  const pip = sim.robot("pip"), nova = sim.robot("nova");
  function newController() {
    const nav = new Navigator();
    return (pose, speed, goal) => { const t = nav.to(pose, speed, goal); return { ...t, arrived: nav.status === "arrived" }; };
  }
  const tw = { vx: 0, wz: 0 };
  pip.advance = function () { this.twist[0] = tw.vx; this.twist[1] = 0; this.twist[2] = tw.wz; return null; };
  nova.advance = function () { this.twist.fill(0); return null; };
  const step = async () => sim["controlStep"]();
  async function place(x, y, yaw) {
    sim.reset();
    const q = d.qpos, f = pip.freeQ; q[f] = x; q[f + 1] = y; q[f + 3] = Math.cos(yaw / 2); q[f + 6] = Math.sin(yaw / 2);
    const g = nova.freeQ; q[g] = 1.2; q[g + 1] = 1.2; // park Nova out of the way
    mj.mj_forward(m, d); tw.vx = tw.wz = 0;
    for (let i = 0; i < 50; i++) await step();
  }
  const starts = [[-0.8, -0.6, 0], [-0.8, -0.6, Math.PI]];
  const goals = [[-0.5, -0.6], [0.2, -0.6], [-0.8, 0.4]];
  const out = [];
  for (const [label, make] of [["baseline", newController], ["faster", newController]]) {
    Object.assign(NAV, label === "baseline" ? {cruise:.55, approach:.3, spin:3, spinNear:1.8} : {cruise:.65, approach:.35, spin:3.6, spinNear:2.1});
    let done = 0, total = 0, errs = [], times = [], extra = [], falls = 0;
    for (const s of starts) for (const goal of goals) {
      await place(...s);
      const ctrl = make();
      let arrived = false, n = 0, path = 0, prev = pip.pose();
      const straight = Math.hypot(goal[0] - prev.x, goal[1] - prev.y);
      const fall0 = pip.falls;
      while (n < 50 * 30 && !arrived) {
        const pose = pip.pose();
        const c = ctrl(pose, pip.speed(), goal);
        tw.vx = c.vx; tw.wz = c.wz; arrived = c.arrived;
        await step(); n++;
        const p = pip.pose(); path += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p;
      }
      // Let it coast to rest and measure where it really ended up.
      tw.vx = tw.wz = 0; for (let i = 0; i < 25; i++) await step();
      const p = pip.pose();
      total++; if (arrived) { done++; times.push(n / 50); }
      errs.push(Math.hypot(goal[0] - p.x, goal[1] - p.y));
      extra.push(path / Math.max(straight, 1e-6));
      if (pip.falls > fall0) falls++;
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const sorted = (a) => [...a].sort((x, y) => x - y);
    out.push({ controller: label, completed: `${done}/${total}`, meanTimeS: +mean(times).toFixed(1), maxTimeS: +Math.max(0, ...times).toFixed(1), meanFinalErrCm: +(mean(errs) * 100).toFixed(1), p90FinalErrCm: +(sorted(errs)[Math.floor(0.9 * errs.length)] * 100).toFixed(1), meanPathRatio: +mean(extra).toFixed(2), falls });
  }
  return out;
});
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
