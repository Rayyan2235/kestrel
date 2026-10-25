import type { Vec2 } from "@kestrel/contracts";
import type { DuckPose } from "./tasks";

// Closed-loop driving for the Microduck walking policy, tuned from measured
// behaviour (fast-stepped MuJoCo, BEST_alpha_walking.onnx, flat floor):
//
//   forward command   0.10–0.20  →  0 m/s (gait never starts: dead zone)
//                     0.25 / 0.30 / 0.40 / 0.55 / 0.60  →  0.108 / 0.137 / 0.171 / ~0.24 / 0.272 m/s
//                     1.0  →  falls
//   backward command  −0.15 to −0.30  →  0 m/s · −0.40  →  −0.19 to −0.24 m/s
//   lateral command   ±0.25  →  0 m/s (this policy ignores the strafe slot)
//   pure turn         1.0 → stalls · 1.6 → 0.86 rad/s · 3.0 → 1.75 rad/s, radius ≤ 1 cm
//   walk + turn       vx 0.25, wz 1.0–1.6 → radius 0.14–0.17 m
//   stop              coasts 1.0 cm from 0.25, 1.8 cm from 0.40; settles in ~0.5 s
//
// So it never commands inside a dead zone: forward is 0 or ≥ GAIT_MIN, a
// pivot is 0 or ≥ SPIN_MIN. It pivots on the spot (the policy really can),
// then walks with gentle steering, with hysteresis between the two, and
// counts a goal as reached only once the duck has stopped moving.
// After ROSClaw Duckverse's WalkTo/TurnTo (Apache-2.0), with the commands
// re-measured for this policy instead of copied.

// 2026-10-25: six real-physics approach/turn runs at the faster settings:
// 6/6 arrivals, no falls; mean 4.2 s vs 5.2 s, final error 2.4 cm vs 2.5 cm.
export const NAV = {
  gaitMin: 0.25,
  cruise: 0.65,
  approach: 0.35,
  /** Backing up: the policy ignores −0.15 to −0.30 entirely. */
  back: -0.4,
  spin: 3.6,
  spinNear: 2.1,
  spinMin: 1.6,
  steerGain: 2.0,
  steerMax: 1.2,
  pivotEnter: 0.6, // rad: stop walking and pivot beyond this bearing error
  pivotExit: 0.14, // rad: pivoting stops here; the turn coasts a little further
  slowWithin: 0.3, // m: approach speed inside this distance
  arrive: 0.035, // m
  passed: 0.07, // m: this close with the goal behind counts as reached (no orbiting)
  faceTol: 0.1, // rad
  settleSpeed: 0.01, // m/s
  settleSteps: 10, // control steps below settleSpeed
  stallSteps: 25, // a pivot that gains < 0.05 rad in this many steps gets a full-speed spin
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export type Twist = { vx: number; wz: number };
const HOLD: Twist = { vx: 0, wz: 0 };

export type NavStatus = "moving" | "settling" | "arrived";

/** Pivot-then-walk driver with settling. One instance per goal sequence. */
export class Navigator {
  private walking = false;
  private n = 0;
  private still = 0;
  private settling = false;
  private turnFrom = { n: 0, yaw: 0 };
  private boost = 0;
  status: NavStatus = "moving";

  private pivot(pose: DuckPose, err: number): Twist {
    // A pivot that has stalled (it can, near the dead zone) gets a full-speed spin.
    if (this.n - this.turnFrom.n > NAV.stallSteps) {
      if (Math.abs(wrap(pose.yaw - this.turnFrom.yaw)) < 0.05) this.boost = NAV.stallSteps;
      this.turnFrom = { n: this.n, yaw: pose.yaw };
    }
    if (this.boost > 0) this.boost--;
    const rate = this.boost > 0 || Math.abs(err) > 0.5 ? NAV.spin : NAV.spinNear;
    return { vx: 0, wz: Math.sign(err) * Math.max(NAV.spinMin, rate) };
  }

  /** Hold still until the duck has stopped. Returns true once settled. */
  private settle(speed: number): boolean {
    this.still = speed < NAV.settleSpeed ? this.still + 1 : 0;
    return this.still >= NAV.settleSteps;
  }

  /** Twist toward a point. `speed` is the measured trunk speed (m/s). */
  to(pose: DuckPose, speed: number, goal: Vec2, opts: { radius?: number; fast?: boolean } = {}): Twist {
    this.n++;
    const radius = opts.radius ?? NAV.arrive;
    const dx = goal[0] - pose.x;
    const dy = goal[1] - pose.y;
    const dist = Math.hypot(dx, dy);
    const err = wrap(Math.atan2(dy, dx) - pose.yaw);
    // At walking speed the policy's lag overshoots a close goal; turning back
    // for it would orbit it forever, so a goal just passed counts as reached.
    if (this.settling || dist < radius || (dist < NAV.passed && Math.abs(err) > Math.PI / 2)) {
      this.settling = true;
      this.walking = false;
      this.status = this.settle(speed) ? "arrived" : "settling";
      return HOLD;
    }
    this.status = "moving";
    if (this.walking && Math.abs(err) > NAV.pivotEnter) this.walking = false;
    if (!this.walking && Math.abs(err) < NAV.pivotExit) {
      this.walking = true;
    }
    if (!this.walking) return this.pivot(pose, err);
    this.turnFrom = { n: this.n, yaw: pose.yaw };
    const vx = opts.fast !== false && dist > NAV.slowWithin ? NAV.cruise : NAV.approach;
    return { vx: Math.max(NAV.gaitMin, vx), wz: clamp(NAV.steerGain * err, -NAV.steerMax, NAV.steerMax) };
  }

  /** Twist to face a heading on the spot, then settle. */
  face(pose: DuckPose, speed: number, yaw: number, tol = NAV.faceTol): Twist {
    this.n++;
    const err = wrap(yaw - pose.yaw);
    if (this.settling || Math.abs(err) < tol) {
      this.settling = true;
      this.status = this.settle(speed) ? "arrived" : "settling";
      return HOLD;
    }
    this.status = "moving";
    return this.pivot(pose, err);
  }

  /** Walk straight ahead at a fixed command, steering toward heading `aim`. */
  forward(pose: DuckPose, aim: number, vx: number = NAV.approach): Twist {
    this.n++;
    return { vx: Math.max(NAV.gaitMin, vx), wz: clamp(NAV.steerGain * wrap(aim - pose.yaw), -NAV.steerMax, NAV.steerMax) };
  }

  /** Start a new goal with the same driver (keeps no arrival state). */
  next() {
    this.settling = false;
    this.still = 0;
    this.status = "moving";
  }
}
