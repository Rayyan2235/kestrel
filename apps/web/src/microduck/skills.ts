import { VEL_ANG, VEL_FWD } from "../vendor/microduck/constants.js";
import { BALANCE, type Side } from "./balance";
import { wrap, type Duck, type MicroduckWorld } from "./physics";

export type Point = { px: number; py: number };
export type Twist = { vx: number; wz: number; head: [number, number, number] };

/**
 * Tuning for the trained walker, measured from rest in the physics harness:
 * forward commands under 0.25 m/s and pure turns do not start its gait, but a
 * 0.3 s full-speed step does, after which a pure turn (0, ±1) turns ~0.45 rad/s
 * with only 2–4 cm of drift. Its full-speed turning circle (~0.25 m) is larger
 * than the lab's lanes, so it turns on the spot first and then walks straight.
 * On-the-spot turn rate scales past upstream's keyboard limit (1.0): a 1.6
 * command turns ~0.9 rad/s without falls in the harness.
 */
export const DRIVE = {
  spin: 1.6, // rad/s commanded for on-the-spot turns
  arrive: 0.04, // m
  passed: 0.07, // m: this close with the goal behind it counts as arrived (no orbiting)
  walkErr: 0.5, // rad: stop walking and turn again beyond this bearing error
  pivotErr: 0.15, // rad: turning stops here; the policy's lag covers the rest
  turnGain: 1.6,
  faceTol: 0.1, // rad
  kickSteps: 15, // 0.3 s full-speed step that starts the gait before a turn
  idleSteps: 10, // the gait counts as stopped after this many idle control steps
  turnCheck: 25, // control steps; a turn that gained under 0.05 rad in this time is re-kicked
  reach: 0.072, // m from the duck's centre to its chest, where it meets a paddle
  setback: 0.16, // m behind a paddle where the duck lines up before pushing
  lead: 0.012, // m: stop pushing this far before the notch; the carriage coasts the rest
  stallSteps: 75,
  pushBudget: 100, // control steps of walking that must move the carriage at least 4 mm
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const HOLD: Twist = { vx: 0, wz: 0, head: [0, 0, 0] };

/** Turn-on-the-spot-then-walk driving for a walker with a wide turning circle and a deadband. */
export class Driver {
  private walking = false;
  private kick = 0;
  private lastActive = -Infinity;
  private step = 0;
  private turnFrom = { step: 0, yaw: 0 };
  constructor(private readonly duck: Duck) {}

  private turn(err: number): Twist {
    const yaw = this.duck.pose().yaw;
    // A stopped gait needs a short step before it will turn on the spot, and a
    // turn that has stopped making progress gets another one.
    if (this.step - this.lastActive > DRIVE.idleSteps) this.kick = DRIVE.kickSteps;
    else if (this.kick === 0 && this.step - this.turnFrom.step > DRIVE.turnCheck) {
      if (Math.abs(wrap(yaw - this.turnFrom.yaw)) < 0.05) this.kick = DRIVE.kickSteps;
      this.turnFrom = { step: this.step, yaw };
    }
    this.lastActive = this.step;
    if (this.kick > 0) {
      if (--this.kick === 0) this.turnFrom = { step: this.step, yaw };
      return { vx: VEL_FWD, wz: 0, head: [0, 0, 0] };
    }
    return { vx: 0, wz: Math.sign(err) * DRIVE.spin, head: [0, 0, 0] };
  }

  /** Twist toward a point; null once within `radius`. */
  to(goal: Point, radius = DRIVE.arrive): Twist | null {
    this.step++;
    const { px, py, yaw } = this.duck.pose();
    const dx = goal.px - px,
      dy = goal.py - py,
      dist = Math.hypot(dx, dy);
    const err = wrap(Math.atan2(dy, dx) - yaw);
    // At full speed the policy's lag overshoots a close goal; turning back for it
    // would orbit it forever, so a goal just passed counts as reached.
    if (dist < radius || (dist < DRIVE.passed && Math.abs(err) > Math.PI / 2)) {
      this.walking = false;
      return null;
    }
    if (this.walking && Math.abs(err) > DRIVE.walkErr) this.walking = false;
    if (!this.walking && Math.abs(err) < DRIVE.pivotErr) this.walking = true;
    if (!this.walking) return this.turn(err);
    this.lastActive = this.step;
    return { vx: VEL_FWD, wz: clamp(err * DRIVE.turnGain, -VEL_ANG, VEL_ANG), head: [0, 0, 0] };
  }

  /** Twist to face a yaw on the spot; null once facing it. */
  face(yaw: number): Twist | null {
    this.step++;
    const err = wrap(yaw - this.duck.pose().yaw);
    if (Math.abs(err) < DRIVE.faceTol) return null;
    return this.turn(err);
  }

  /** Forward with a heading correction toward `aim` (radians). */
  forward(aim: number): Twist {
    this.step++;
    this.lastActive = this.step;
    const err = wrap(aim - this.duck.pose().yaw);
    return { vx: VEL_FWD, wz: clamp(err * DRIVE.turnGain, -VEL_ANG, VEL_ANG), head: [0, 0.35, 0] };
  }
}

/** The apparatus a walking duck must keep clear of (x/y rectangles, metres), less the paddle being pushed. */
function obstacles(world: MicroduckWorld, except?: Side) {
  const b = BALANCE,
    front = b.beamY - b.beam.halfDepth;
  const boxes = [{ x0: -b.beam.halfLength, x1: b.beam.halfLength, y0: front, y1: b.beamY + b.beam.halfDepth }];
  for (const side of ["left", "right"] as const) {
    if (side === except) continue;
    const x = world.balance.slide(side);
    boxes.push({ x0: x - b.paddle.halfThick, x1: x + b.paddle.halfThick, y0: front - 2 * b.paddle.halfReach, y1: front });
  }
  return boxes;
}
const BODY = 0.075; // duck footprint radius, m
/** Is the straight walk a→c clear of the apparatus and of the other ducks? */
function clear(world: MicroduckWorld, self: Duck, a: Point, c: Point, except?: Side) {
  const boxes = obstacles(world, except);
  const others = world.bots.filter((id) => id !== self.id).map((id) => world.ducks[id].pose());
  for (let i = 0; i <= 20; i++) {
    const t = i / 20,
      x = a.px + (c.px - a.px) * t,
      y = a.py + (c.py - a.py) * t;
    for (const k of boxes) if (x > k.x0 - BODY && x < k.x1 + BODY && y > k.y0 - BODY && y < k.y1 + BODY) return false;
    for (const o of others) if (Math.hypot(x - o.px, y - o.py) < 2 * BODY + 0.01) return false;
  }
  return true;
}

export type PushPhase = "route" | "align" | "push" | "release" | "done" | "failed";

/**
 * Walk to the push lane behind a carriage's paddle, face along the beam, and push
 * the carriage to a ruler notch with the body. The carriage's brake is released
 * only for the push; at the notch it clicks into place (a detent rail eases the
 * last few millimetres).
 */
export class PushSkill {
  phase: PushPhase = "route";
  /** Why the push cannot be done, in the bot's own words, when phase is "failed". */
  reason: string | null = null;
  steps = 0;
  readonly waypoints: Point[] = [];
  private readonly driver: Driver;
  private readonly dir: 1 | -1;
  private readonly target: number;
  private releaseSteps = 0;
  private lastSlide = 0;
  private lastPose = { px: 0, py: 0, yaw: 0 };
  private still = 0;

  constructor(
    private readonly world: MicroduckWorld,
    private readonly duck: Duck,
    readonly side: Side,
    readonly targetCm: number,
  ) {
    this.driver = new Driver(duck);
    this.target = BALANCE.slideFor(side, targetCm);
    const now = world.balance.slide(side);
    this.dir = this.target >= now ? 1 : -1;
    if (Math.abs(this.target - now) < 0.0015) {
      this.phase = "done";
      return;
    }
    // Standing room behind the paddle, up to the next paddle or the end of the beam.
    const other = world.balance.slide(side === "left" ? "right" : "left");
    // Pushing a weight inward must leave room for a duck to stand between the two.
    const gapAfter = Math.abs(other - this.target);
    if (gapAfter < BALANCE.minGap && Math.abs(other - this.target) < Math.abs(other - now)) {
      const closest = Math.ceil((BALANCE.minGap - Math.abs(other)) * BALANCE.cmPerMetre);
      this.fail(`If I push it that close, there won't be room for us to stand between the weights. Try ${Math.max(BALANCE.minCm, closest)} cm or more.`);
      return;
    }
    const room = (this.dir > 0 ? now - (side === "left" ? -Infinity : other) : (side === "left" ? other : Infinity) - now) - 2 * BALANCE.paddle.halfThick;
    if (room < DRIVE.reach + 0.03) {
      this.fail("There isn't room between the weights for me to stand and push it that way. Try moving the other weight first.");
      return;
    }
    const setback = Math.min(DRIVE.setback, room - 0.075);
    const corner = { px: now - this.dir * setback, py: BALANCE.pushLaneY };
    const here = duck.pose();
    const T = BALANCE.transitLaneY;
    // Candidate routes to the lane corner; the cheapest clear one wins. Turning is
    // the slow part (~0.45 rad/s), so diagonal approaches that arrive nearly facing
    // the push usually beat a tidy L.
    const routes: Point[][] = [[corner]];
    for (const off of [0.24, 0.16, 0]) routes.push([{ px: corner.px - this.dir * off, py: T }, corner]);
    for (const off of [0.24, 0]) routes.push([{ px: here.px, py: T }, { px: corner.px - this.dir * off, py: T }, corner]);
    const finalYaw = this.dir > 0 ? 0 : Math.PI;
    const cost = (r: Point[]) => {
      let at = { px: here.px, py: here.py },
        yaw = here.yaw,
        turning = 0,
        dist = 0;
      for (const p of r) {
        const heading = Math.atan2(p.py - at.py, p.px - at.px);
        turning += Math.abs(wrap(heading - yaw));
        dist += Math.hypot(p.px - at.px, p.py - at.py);
        yaw = heading;
        at = p;
      }
      turning += Math.abs(wrap(finalYaw - yaw));
      return turning / 0.45 + dist / 0.2;
    };
    // The last step into the corner runs alongside the target paddle, which it may brush.
    const clearRoutes = routes.filter((r) => r.every((p, i) => clear(world, duck, i ? r[i - 1] : here, p, i === r.length - 1 ? side : undefined)));
    if (!clearRoutes.length) {
      this.fail("Something is in my way to that weight. Ask the other robot to move, or try again.");
      return;
    }
    this.waypoints.push(...clearRoutes.sort((a, b) => cost(a) - cost(b))[0]);
  }

  private fail(reason: string) {
    this.phase = "failed";
    this.reason = reason;
  }
  private pushStart = { step: 0, slide: 0 };

  /** 0 until the push starts, then the share of the distance covered; 1 when done. */
  progress() {
    if (this.phase === "done" || this.phase === "release") return 1;
    if (this.phase !== "push") return 0;
    const total = Math.abs(this.target - this.pushStart.slide) || 1;
    return Math.min(1, Math.max(0, ((this.world.balance.slide(this.side) - this.pushStart.slide) * this.dir) / total));
  }

  /** Measured position of the carriage, lab cm. */
  measuredCm() {
    return this.world.balance.carriageCm(this.side);
  }

  update(): Twist {
    this.steps++;
    const balance = this.world.balance;
    switch (this.phase) {
      case "route": {
        const wp = this.waypoints[0];
        const twist = wp ? this.driver.to(wp) : null;
        if (twist) return this.track(twist);
        this.waypoints.shift();
        if (!this.waypoints.length) this.phase = "align";
        return HOLD;
      }
      case "align": {
        const twist = this.driver.face(this.dir > 0 ? 0 : Math.PI);
        if (twist) return this.track(twist);
        balance.setBrake(this.side, null);
        this.phase = "push";
        this.pushStart = { step: this.steps, slide: balance.slide(this.side) };
        return HOLD;
      }
      case "push": {
        const slide = balance.slide(this.side);
        if ((this.target - slide) * this.dir <= DRIVE.lead) {
          balance.setBrake(this.side, this.target);
          this.phase = "release";
          return HOLD;
        }
        // A push that has not moved the carriage after the walk-in is blocked.
        if (this.steps - this.pushStart.step > DRIVE.pushBudget) {
          if ((slide - this.pushStart.slide) * this.dir < 0.004) {
            balance.setBrake(this.side, this.pushStart.slide);
            this.fail("I couldn't move the weight. Something is blocking me.");
            return HOLD;
          }
          this.pushStart = { step: this.steps, slide };
        }
        // Walk along the push lane, steering back onto it if it drifts.
        const { py } = this.duck.pose();
        const aim = Math.atan2(BALANCE.pushLaneY - py, this.dir * 0.12);
        return this.track(this.driver.forward(aim), slide);
      }
      case "release": {
        // Stand still against the braked paddle while the step settles.
        if (++this.releaseSteps > 15) this.phase = "done";
        return HOLD;
      }
      case "done":
      case "failed":
        return HOLD;
    }
  }

  /** Count steps with no progress at all (neither the body nor the carriage moved). */
  private track(twist: Twist, slide = this.world.balance.slide(this.side)) {
    const { px, py, yaw } = this.duck.pose();
    const moved =
      Math.hypot(px - this.lastPose.px, py - this.lastPose.py) > 0.0008 ||
      Math.abs(wrap(yaw - this.lastPose.yaw)) > 0.003 ||
      Math.abs(slide - this.lastSlide) > 0.0002;
    this.still = moved ? 0 : this.still + 1;
    this.lastPose = { px, py, yaw };
    this.lastSlide = slide;
    return twist;
  }

  /** True when nothing has moved for a while (blocked, or lost the paddle). */
  stalled() {
    return this.still > DRIVE.stallSteps;
  }
}

/** Walk back to a home spot clear of the lanes (via the transit lane) and face the balance. */
export class HomeSkill {
  done = false;
  private readonly driver: Driver;
  private readonly waypoints: Point[];
  constructor(
    private readonly duck: Duck,
    private readonly home: { px: number; py: number; yaw: number },
  ) {
    this.driver = new Driver(duck);
    const here = duck.pose();
    const near = Math.hypot(here.px - home.px, here.py - home.py) < DRIVE.arrive;
    this.waypoints = near ? [] : here.py > BALANCE.transitLaneY + 0.03 ? [{ px: here.px, py: BALANCE.transitLaneY }, home] : [home];
  }
  update(): Twist {
    const wp = this.waypoints[0];
    if (wp) {
      const t = this.driver.to(wp);
      if (t) return t;
      this.waypoints.shift();
      return HOLD;
    }
    const t = this.driver.face(this.home.yaw);
    if (t) return t;
    this.done = true;
    return HOLD;
  }
}
