// Navigation bench: the same start poses and goals driven by the OLD controller
// (steerTo with creep + 1.5 s kick-start, copied from main) and the NEW Navigator.
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
  const { Navigator } = await import("/src/simulation/navigate.ts");
  const m = sim["model"], d = sim["data"], mj = sim["mujoco"];
  const pip = sim.robot("pip"), nova = sim.robot("nova");
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // OLD (main @ 4154acf tasks.ts): steerTo + turn creep, kick-start after 1.5 s stuck.
  function oldController() {
    let anchor = null, stuck = 0, kick = 0;
    return (pose, speed, goal) => {
      if (kick > 0) { kick -= 0.02; return { vx: 0.25, wz: 0, arrived: false }; }
      const dd = Math.hypot(goal[0] - pose.x, goal[1] - pose.y);
      const err = wrap(Math.atan2(goal[1] - pose.y, goal[0] - pose.x) - pose.yaw);
      if (dd <= 0.06) return { vx: 0, wz: 0, arrived: true };
      const wz = clamp(2.2 * err, -1, 1);
      const vx = Math.abs(err) > 0.6 ? 0.1 : clamp(1.4 * dd, 0.06, 0.25) * Math.cos(err);
      const moved = !anchor || Math.hypot(pose.x - anchor.x, pose.y - anchor.y) > 0.02 || Math.abs(wrap(pose.yaw - anchor.yaw)) > 0.06;
      if (moved) { anchor = { ...pose }; stuck = 0; } else if ((stuck += 0.02) > 1.5) { kick = 0.8; anchor = { ...pose }; stuck = 0; }
      return { vx, wz, arrived: false };
    };
  }
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
  const starts = [[-0.8, -0.6, 0], [-0.8, -0.6, Math.PI / 2], [-0.8, -0.6, Math.PI], [-0.8, -0.6, -Math.PI / 2]];
  const goals = [[-0.5, -0.6], [0.2, -0.6], [-0.8, 0.4], [-1.0, -1.0], [0.0, 0.2]];
  const out = [];
  for (const [label, make] of [["old", oldController], ["new", newController]]) {
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
