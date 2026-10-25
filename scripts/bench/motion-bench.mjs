// Movement bench: takes the sandbox's DuckSim (Free play kit), stops its real-time
// loop and fast-steps physics with fixed commands, measuring what the policy achieves.
// Config via env: BENCH = JSON {clamp?: number, cases?: [...]}
import { chromium } from "@playwright/test";
const URL = process.env.URL ?? "http://127.0.0.1:5180/sandbox.html";
const CFG = JSON.parse(process.env.BENCH ?? "{}");
const browser = await chromium.launch(process.env.CI ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : { channel: "chromium" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(URL);
await page.waitForFunction(() => window.kestrelSim, null, { timeout: 90000 });
await page.getByRole("button", { name: /Free play/ }).click();
await page.waitForFunction(() => window.kestrelSim.kit.id === "free", null, { timeout: 30000 });
const out = await page.evaluate(async (cfg) => {
  const sim = window.kestrelSim;
  sim.stop();
  const m = sim["model"], d = sim["data"];
  if (cfg.clamp) {
    // Duckverse / infer_policy.py: XL330 firmware current limit ≈ 0.64 N·m.
    for (let a = 0; a < 14; a++) { m.actuator_forcerange[2 * a] = -cfg.clamp; m.actuator_forcerange[2 * a + 1] = cfg.clamp; }
  }
  const twist = { vx: 0, vy: 0, wz: 0 };
  // Inject the full 3-D twist (current DuckSim only passes vx, wz to cmd[0], cmd[2]).
  const build = sim["buildObs"].bind(sim);
  sim["buildObs"] = () => { const o = build(); if (sim["mode"] === "walk" && !sim["recovery"]) { o[48] = twist.vx; o[49] = twist.vy; o[50] = twist.wz; } return o; };
  sim["twist"] = () => [twist.vx, twist.wz];
  const step = async (k) => { for (let i = 0; i < k; i++) await sim["controlStep"](); };
  const pose = () => { const q = d.qpos; return { x: q[0], y: q[1], yaw: Math.atan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] * q[5] + q[6] * q[6])) }; };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const fell = () => sim["recovery"] !== null;
  async function fresh(yaw = 0) {
    sim.reset();
    const q = d.qpos; q[0] = -0.6; q[1] = 0; q[3] = Math.cos(yaw / 2); q[4] = 0; q[5] = 0; q[6] = Math.sin(yaw / 2);
    sim["mujoco"].mj_forward(m, d);
    twist.vx = twist.vy = twist.wz = 0;
    await step(50); // settle 1 s
  }
  // Body-frame velocity over a window.
  function bodyVel(a, b, dt) {
    const dx = b.x - a.x, dy = b.y - a.y, c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    return { fwd: (c * dx + s * dy) / dt, lat: (-s * dx + c * dy) / dt, yawRate: wrap(b.yaw - a.yaw) / dt };
  }
  const res = { forward: [], lateral: [], turn: [], stop: [], headings: [] };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // A. Forward speed from rest: 1 s initiation window and steady 2 s window.
  for (const vx of cfg.vx ?? [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6]) {
    await fresh(); twist.vx = vx;
    const p0 = pose(); await step(50); const p1 = pose(); await step(50); const p2 = pose(); await step(100); const p3 = pose();
    res.forward.push({ vx, first1s: r3(bodyVel(p0, p1, 1).fwd), steady: r3(bodyVel(p2, p3, 2).fwd), drift: r3(bodyVel(p2, p3, 2).lat), yawRate: r3(bodyVel(p2, p3, 2).yawRate), fell: fell() });
  }
  // B. Turning from rest (pure) and while walking.
  for (const [vx, wz] of cfg.turn ?? [[0, 1], [0, 1.6], [0, 2.5], [0.25, 1], [0.25, 1.6], [0.4, 1.6]]) {
    await fresh(); twist.vx = vx; twist.wz = wz;
    const p0 = pose(); await step(50); const p1 = pose(); await step(100); const p2 = pose();
    const v = bodyVel(p1, p2, 2);
    const speed = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    res.turn.push({ vx, wz, first1sYawRate: r3(bodyVel(p0, p1, 1).yawRate), yawRate: r3(v.yawRate), speed: r3(speed), radius: v.yawRate ? r3(Math.abs(speed / v.yawRate)) : null, fell: fell() });
  }
  // C. Lateral command (the slot upstream leaves at zero; Duckverse uses ±0.15).
  for (const vy of cfg.vy ?? [0.1, 0.15, 0.25, -0.15]) {
    await fresh(); twist.vy = vy;
    const p0 = pose(); await step(50); const p1 = pose(); await step(100); const p2 = pose();
    const v = bodyVel(p1, p2, 2);
    res.lateral.push({ vy, first1sLat: r3(bodyVel(p0, p1, 1).lat), lat: r3(v.lat), fwd: r3(v.fwd), yawRate: r3(v.yawRate), fell: fell() });
  }
  // D. Stopping: walk 3 s, command zero, measure coast distance and settle time.
  for (const vx of cfg.stopVx ?? [0.25, 0.4]) {
    await fresh(); twist.vx = vx; await step(150);
    const p0 = pose(); twist.vx = 0;
    let settled = null, prev = pose();
    for (let i = 1; i <= 150; i++) { await step(1); const p = pose(); if (settled === null && Math.hypot(p.x - prev.x, p.y - prev.y) / 0.02 < 0.01 && i > 5) settled = i * 0.02; prev = p; }
    const p1 = pose();
    res.stop.push({ vx, coast: r3(Math.hypot(p1.x - p0.x, p1.y - p0.y)), settleS: settled, fell: fell() });
  }
  // E. Repeatability from several headings: 3 s at the default walking command.
  for (const deg of cfg.headings ?? [0, 90, 180, 270]) {
    await fresh((deg * Math.PI) / 180); twist.vx = cfg.headingVx ?? 0.25;
    const p0 = pose(); await step(150); const p1 = pose();
    const v = bodyVel(p0, p1, 3);
    res.headings.push({ deg, fwd: r3(v.fwd), lat: r3(v.lat), yawDriftDeg: r3((wrap(p1.yaw - p0.yaw) * 180) / Math.PI), fell: fell() });
  }
  return res;
}, CFG);
for (const [k, rows] of Object.entries(out)) { console.log(`== ${k}`); for (const r of rows) console.log(JSON.stringify(r)); }
await browser.close();
