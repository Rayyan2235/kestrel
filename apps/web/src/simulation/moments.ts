import { MOMENTS, type BotId, type DuckTask, type Vec2 } from "@kestrel/contracts";
import { NAV, Navigator } from "./navigate";
import type { DuckPose, TaskStep, WorldView } from "./tasks";

// The duck moves a balance weight by walking into its paddle. Interaction
// state machine, one weight per robot:
//
//   TRAVEL → ALIGN → APPROACH → CONTACT → PUSH → STOP → WITHDRAW → VERIFY → READY
//
// TRAVEL routes to the lane behind the paddle (clear of the plank, the other
// paddle and the other robot), ALIGN faces along the rail, APPROACH walks in
// until MuJoCo reports real contact with the paddle, CONTACT frees that
// weight's rail clamp, PUSH walks the weight along the rail while measuring
// it, STOP engages the clamp the moment the weight reaches its mark (the
// clamp holds a carriage where the robot left it; it never moves one), and
// WITHDRAW/VERIFY step back to the walkway and confirm the robot is clear and
// still. Bounded retries on loss of contact; every failure is reported.

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const HOLD = { vx: 0, wz: 0 };
export const PUSH = {
  setback: 0.16, // m behind a paddle where the duck lines up
  reach: 0.072, // m from the duck's centre to its chest
  body: 0.075, // m footprint radius for route clearance
  contactN: 0.05, // N of paddle contact that counts as touching
  lostSteps: 15, // control steps without contact during PUSH = contact lost
  retries: 3,
  approachSlack: 0.1, // m walked past the expected contact point = missed the paddle
  approachSteps: 200, // control steps (4 s) to make contact before backing off
  pushBudget: 100, // control steps of pushing that must move the weight ≥ 4 mm
  clearSteps: 15, // control steps clear and still before READY
};
export type PlacePhase = "TRAVEL" | "ALIGN" | "APPROACH" | "CONTACT" | "PUSH" | "STOP" | "WITHDRAW" | "VERIFY" | "READY";

type Box = { x0: number; x1: number; y0: number; y1: number };

/** Floor rectangles a duck must keep clear of: plank, pivot and paddles (less one). */
function obstacles(rails: Map<string, number>, except?: string): Box[] {
  const [px, py] = MOMENTS.pivot;
  const { plank, paddle, pivotHalf } = MOMENTS;
  const edge = px - plank.width / 2;
  const boxes: Box[] = [
    { x0: edge, x1: px + plank.width / 2, y0: py - plank.length / 2, y1: py + plank.length / 2 },
    { x0: px - pivotHalf[0], x1: px + pivotHalf[0], y0: py - pivotHalf[1], y1: py + pivotHalf[1] },
  ];
  for (const [id, at] of rails) {
    if (id === except) continue;
    boxes.push({ x0: edge - paddle.reach, x1: edge, y0: py + at - paddle.thick / 2, y1: py + at + paddle.thick / 2 });
  }
  return boxes;
}

/** Is the straight walk a→b clear of the apparatus and of the other robots? */
function clear(world: WorldView, a: Vec2, b: Vec2, except?: string): boolean {
  const boxes = obstacles(world.balance!.rails, except);
  const r = PUSH.body;
  for (let i = 0; i <= 20; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 20;
    const y = a[1] + ((b[1] - a[1]) * i) / 20;
    for (const k of boxes) if (x > k.x0 - r && x < k.x1 + r && y > k.y0 - r && y < k.y1 + r) return false;
    for (const o of world.others) if (Math.hypot(x - o.pose.x, y - o.pose.y) < 2 * r + 0.01) return false;
  }
  return true;
}

export const cmText = (at: number) => `${(Math.abs(at) * 100).toFixed(1).replace(/\.0$/, "")} cm`;

export class PlaceWeight {
  phase: PlacePhase = "TRAVEL";
  private readonly nav = new Navigator();
  private waypoints: Vec2[] = [];
  readonly from: number;
  readonly target: number;
  private readonly dir: 1 | -1;
  private readonly label: string;
  readonly paddle: string;
  private n = 0;
  private locking: boolean;
  private retries = 0;
  private lost = 0;
  private approachFrom: DuckPose | null = null;
  private approachN = 0;
  private pushStart = { n: 0, at: 0 };
  private prevAt = 0;
  private clearFor = 0;
  /** Peak paddle contact force while pushing (N), for the audit. */
  peakForce = 0;

  private constructor(
    readonly id: string,
    world: WorldView,
    target: number,
  ) {
    const rails = world.balance!.rails;
    this.from = rails.get(id)!;
    this.prevAt = this.from;
    this.target = target;
    this.dir = target >= this.from ? 1 : -1;
    this.label = world.kit.props.find((p) => p.id === id)?.label ?? id;
    this.paddle = `${id}-paddle`;
    this.locking = world.balance!.pin !== "locked";
  }

  /** Validate a place_weight task against the live world: a plan, or a refusal. */
  static plan(task: Extract<DuckTask, { kind: "place_weight" }>, world: WorldView): PlaceWeight | string {
    const rails = world.balance?.rails;
    if (!rails) return "There is no balance in this lesson.";
    const now = rails.get(task.target);
    if (now === undefined) {
      const spec = world.kit.props.find((p) => p.id === task.target);
      return `${spec?.label ?? task.target} isn't on the balance. Only the weights on its rails can be placed.`;
    }
    const target = (Math.sign(now) * task.cm) / 100;
    const other = [...rails].find(([id]) => id !== task.target)?.[1];
    if (other !== undefined) {
      // Pushing a weight inward must leave room for a duck to stand between the two.
      const gap = Math.abs(other - target);
      if (gap < MOMENTS.minGap && gap < Math.abs(other - now)) {
        const closest = Math.ceil(Math.round((MOMENTS.minGap - Math.abs(other)) * 1000) / 10);
        return `If I push it that close, there won't be room for us to stand between the weights. Try ${Math.max(MOMENTS.minCm, closest)} cm or more.`;
      }
    }
    const plan = new PlaceWeight(task.target, world, target);
    if (Math.abs(target - now) >= 0.0015 && !plan.locking) {
      const refusal = plan.route(world);
      if (refusal) return refusal;
    }
    return plan;
  }

  /** The stretch of lane (y, metres) this push will occupy, for scheduling two robots. */
  laneSpan(): [number, number] {
    const py = MOMENTS.pivot[1];
    const corner = py + this.from - this.dir * PUSH.setback;
    const end = py + this.target - this.dir * PUSH.reach;
    return [Math.min(corner, end) - PUSH.body, Math.max(corner, end) + PUSH.body];
  }

  /**
   * Waypoints to the corner behind the paddle, or a refusal. Candidate routes
   * are scored by time; pivoting (~1.75 rad/s) is quick, walking ~0.24 m/s.
   */
  private route(world: WorldView): string | null {
    const rails = world.balance!.rails;
    const py = MOMENTS.pivot[1];
    const T = MOMENTS.transitX;
    const { dir, from } = this;
    // Standing room behind the paddle, up to the other paddle or the end of the plank.
    const behind = [...rails].filter(([id, at]) => id !== this.id && (from - at) * dir > 0).map(([, at]) => at);
    const room = behind.length ? Math.min(...behind.map((at) => Math.abs(from - at))) - MOMENTS.paddle.thick : Infinity;
    if (room < PUSH.reach + 0.03)
      return "There isn't room between the weights for me to stand and push it that way. Try moving the other weight first.";
    const setback = Math.min(PUSH.setback, room - PUSH.body);
    const corner: Vec2 = [MOMENTS.laneX, py + from - dir * setback];
    const here: Vec2 = [world.duck.x, world.duck.y];
    if (here[0] > MOMENTS.pivot[0])
      return "I'm on the other side of the plank. Drive me back round to the side with the paddles first.";
    // From inside the lane, back straight out to the walkway first.
    const start: Vec2 = here[0] > T + 0.03 ? [T, here[1]] : here;
    const routes: Vec2[][] = [[corner]];
    for (const off of [0.24, 0.16, 0]) routes.push([[T, corner[1] - dir * off], corner]);
    for (const off of [0.24, 0]) routes.push([[T, start[1]], [T, corner[1] - dir * off], corner]);
    const finalYaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const cost = (r: Vec2[]) => {
      let at = start;
      let yaw = world.duck.yaw;
      let turning = 0;
      let dist = 0;
      for (const p of r) {
        const heading = Math.atan2(p[1] - at[1], p[0] - at[0]);
        turning += Math.abs(wrap(heading - yaw));
        dist += Math.hypot(p[0] - at[0], p[1] - at[1]);
        yaw = heading;
        at = p;
      }
      return (turning + Math.abs(wrap(finalYaw - yaw))) / 1.75 + dist / 0.24 + r.length * 0.6;
    };
    // The last leg may brush the target paddle's back face when the corner is
    // tight, but only a leg that stays behind the paddle; one coming from the
    // far side would walk through it.
    const behindPaddle = (a: Vec2) => (a[1] - (py + from)) * dir < 0;
    const ok = routes.filter((r) =>
      r.every((p, i) => {
        const a = i ? r[i - 1]! : start;
        return clear(world, a, p, i === r.length - 1 && behindPaddle(a) ? this.id : undefined);
      }),
    );
    if (!ok.length) return "Something is in my way to that weight. Move me nearer the front of the plank and try again.";
    this.waypoints = [...(start === here ? [] : [start]), ...ok.sort((a, b) => cost(a) - cost(b))[0]!];
    return null;
  }

  private fail(summary: string, at?: number): TaskStep {
    this.phase = "READY";
    return { ...HOLD, ...(at === undefined ? {} : { brake: { id: this.id, at } }), phase: "FAILED", done: { ok: false, summary } };
  }

  /** Where the weight is now, for timeouts and status. */
  where(world: WorldView): string {
    return `The ${this.label} is at ${cmText(world.balance!.rails.get(this.id)!)}.`;
  }

  step(world: WorldView): TaskStep {
    this.n++;
    const pose = world.duck;
    const balance = world.balance!;
    const at = balance.rails.get(this.id)!;
    const touch = world.touching.get(this.paddle) ?? 0;
    const out = (t: { vx: number; wz: number }, extra: Partial<TaskStep> = {}): TaskStep => ({ ...t, phase: this.phase, ...extra });
    if (this.locking) {
      // Weights only move on a locked, level plank.
      if (balance.pin !== "locked") return out(HOLD, { pin: "lock" });
      this.locking = false;
      if (Math.abs(this.target - at) >= 0.0015) {
        const refusal = this.route(world);
        if (refusal) return this.fail(refusal);
      }
    }
    switch (this.phase) {
      case "TRAVEL": {
        if (Math.abs(this.target - at) < 0.0015) {
          this.phase = "READY";
          return out(HOLD, { done: { ok: true, summary: `The ${this.label} is already at ${cmText(at)}.` } });
        }
        const wp = this.waypoints[0];
        if (wp) {
          const twist = this.nav.to(pose, world.speed, wp, { fast: this.waypoints.length > 1 });
          if (this.nav.status !== "arrived") return out(twist);
          this.waypoints.shift();
          this.nav.next();
          return out(HOLD);
        }
        this.phase = "ALIGN";
        return out(HOLD);
      }
      case "ALIGN": {
        const twist = this.nav.face(pose, world.speed, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (this.nav.status !== "arrived") return out(twist);
        this.nav.next();
        this.phase = "APPROACH";
        this.approachFrom = { ...pose };
        this.approachN = this.n;
        return out(HOLD);
      }
      case "APPROACH": {
        if (touch > PUSH.contactN) {
          this.phase = "CONTACT";
          return out(HOLD);
        }
        // Walked well past where the paddle should be without touching it: missed.
        const walked = Math.hypot(pose.x - this.approachFrom!.x, pose.y - this.approachFrom!.y);
        if (walked > PUSH.setback + PUSH.approachSlack) return this.retry(world, "I missed the paddle.");
        if (this.n - this.approachN > PUSH.approachSteps) return this.retry(world, "I couldn't reach the paddle.");
        return out(this.nav.forward(pose, this.laneAim(pose)));
      }
      case "CONTACT":
        // Real contact: free this weight's rail clamp and start pushing.
        this.phase = "PUSH";
        this.pushStart = { n: this.n, at };
        this.lost = 0;
        this.prevAt = at;
        return out(this.nav.forward(pose, this.laneAim(pose)), { brake: { id: this.id, at: null } });
      case "PUSH": {
        this.peakForce = Math.max(this.peakForce, touch);
        const remaining = (this.target - at) * this.dir;
        const perStep = Math.max(0, (at - this.prevAt) * this.dir);
        this.prevAt = at;
        // Clamp it the step it reaches the mark (within half a step's travel).
        if (remaining <= perStep / 2 + 0.0005) {
          this.phase = "STOP";
          return out(HOLD, { brake: { id: this.id, at } });
        }
        this.lost = touch > PUSH.contactN ? 0 : this.lost + 1;
        if (this.lost > PUSH.lostSteps) {
          this.nav.next();
          return this.retry(world, "I lost contact with the paddle.", at);
        }
        // A push that has not moved the weight after the walk-in is blocked.
        if (this.n - this.pushStart.n > PUSH.pushBudget) {
          if ((at - this.pushStart.at) * this.dir < 0.004) return this.fail(`I couldn't move the ${this.label}. Something is blocking it.`, at);
          this.pushStart = { n: this.n, at };
        }
        return out(this.nav.forward(pose, this.laneAim(pose)));
      }
      case "STOP": {
        if (world.speed > NAV.settleSpeed) return out(HOLD);
        this.phase = "WITHDRAW";
        this.nav.next();
        return out(HOLD);
      }
      case "WITHDRAW": {
        // Back to the walkway, so nothing touches the plank when it is released.
        const twist = this.nav.to(pose, world.speed, [MOMENTS.transitX, pose.y], { fast: false });
        if (this.nav.status !== "arrived") return out(twist);
        this.phase = "VERIFY";
        return out(HOLD);
      }
      case "VERIFY": {
        const touchingAny = [...world.touching.values()].some((f) => f > 0);
        this.clearFor = !touchingAny && world.speed < NAV.settleSpeed ? this.clearFor + 1 : 0;
        if (this.clearFor < PUSH.clearSteps) return out(HOLD);
        this.phase = "READY";
        return out(HOLD, {
          done: { ok: true, summary: `Moved the ${this.label} from ${cmText(this.from)} to ${cmText(at)} (asked for ${cmText(this.target)}).` },
        });
      }
      case "READY":
        return out(HOLD);
    }
  }

  /** Heading along the lane, steering back onto it if the gait drifts. */
  private laneAim(pose: DuckPose) {
    return Math.atan2(this.dir * 0.12, MOMENTS.laneX - pose.x);
  }

  /** Back off and line up again, a bounded number of times. */
  private retry(world: WorldView, why: string, at?: number): TaskStep {
    if (++this.retries > PUSH.retries) return this.fail(`${why} I tried ${PUSH.retries} times. ${this.where(world)}`, at);
    this.phase = "TRAVEL";
    this.nav.next();
    const refusal = this.route(world);
    if (refusal) return this.fail(`${why} ${refusal}`, at);
    return { ...HOLD, phase: "TRAVEL", ...(at === undefined ? {} : { brake: { id: this.id, at } }) };
  }
}

// ── The cooperative experiment ─────────────────────────────────────────
// lock → both robots place their weights (in parallel when their lanes
// don't overlap, otherwise one after the other) → both withdraw → verify
// nobody touches the apparatus → release → measure → compare with the
// moments computed from the measured rail positions.

export type ExperimentPorts = {
  world(id: BotId): WorldView;
  /** Start a robot task; returns a refusal, or null. */
  start(id: BotId, task: DuckTask): string | null;
  busy(id: BotId): boolean;
  /** Seconds of physics time since the last duck↔apparatus contact. */
  clearFor(): number;
  /** The balance's restoring stiffness about its pin, N·m per radian, read from the MuJoCo model. */
  stiffness(): number;
};

export type BalanceResult = {
  ok: boolean;
  summary: string;
  left: { grams: number; cm: number; moment: number };
  right: { grams: number; cm: number; moment: number };
  /** Predicted from the measured moments and the balance's stiffness: which side goes down. */
  predicted: "left" | "right" | "level";
  /** Predicted tilt, degrees; positive lowers the left side. */
  predictedTiltDeg: number;
  /** Measured; angleDeg is signed like predictedTiltDeg. */
  measured: { lowSide: "left" | "right" | "level"; tiltDeg: number; angleDeg: number };
};

export const G = 9.81;
/** Below this tilt the plank counts as level, for the prediction and the measurement alike. */
export const LEVEL_DEG = 0.5;

/**
 * Moments from measured rail positions, and the tilt they predict. The pivot
 * pin sits above the loaded plank's centre of mass, so the plank is a stiff
 * pendulum: it settles where the restoring torque k·θ balances the net moment
 * (up to its stop). Prediction and measurement use the same LEVEL_DEG, so a
 * small but real imbalance is predicted as a small tilt, not as "level".
 */
export function momentsFor(rails: Map<string, number>, stiffness: number) {
  const side = (s: "left" | "right") => {
    const w = MOMENTS.weights.find((x) => x.side === s)!;
    const cm = Math.abs(rails.get(w.id) ?? 0) * 100;
    // N·cm = kg × m/s² × cm.
    return { grams: w.grams, cm: Math.round(cm * 10) / 10, moment: Math.round((w.grams / 1000) * G * cm * 100) / 100 };
  };
  const left = side("left");
  const right = side("right");
  const net = left.moment - right.moment; // N·cm, positive lowers the left
  const rad = Math.max(-MOMENTS.tilt, Math.min(MOMENTS.tilt, net / 100 / stiffness));
  const predictedTiltDeg = Math.round(((rad * 180) / Math.PI) * 10) / 10;
  const predicted: BalanceResult["predicted"] = Math.abs(predictedTiltDeg) < LEVEL_DEG ? "level" : net > 0 ? "left" : "right";
  return { left, right, net: Math.round(net * 100) / 100, predicted, predictedTiltDeg };
}

export class BalanceExperiment {
  phase: "LOCK" | "PLACE" | "WAIT" | "VERIFY" | "RELEASE" | "SETTLE" | "DONE" = "LOCK";
  private queue: { id: BotId; task: DuckTask }[] = [];
  private failures: string[] = [];
  private t = 0;
  private stillFor = 0;
  private lastAngle = 0;
  private verifyFor = 0;
  result: BalanceResult | null = null;

  constructor(readonly task: Extract<DuckTask, { kind: "set_balance" }>) {}

  /** Plan the two placements. Returns a refusal, or null. */
  plan(ports: ExperimentPorts): string | null {
    const world = ports.world("pip");
    if (!world.balance) return "There is no balance in this lesson.";
    const wanted = { left: this.task.left_cm, right: this.task.right_cm };
    if (wanted.left + wanted.right < MOMENTS.minGap * 100)
      return `The weights need at least ${Math.round(MOMENTS.minGap * 100)} cm between them so a robot can stand there.`;
    this.queue = MOMENTS.weights
      .filter((w) => Math.abs(Math.abs(world.balance!.rails.get(w.id) ?? 0) * 100 - wanted[w.side]) >= 0.15)
      .map((w) => ({ id: w.owner, task: { kind: "place_weight", target: w.id, cm: wanted[w.side] } }));
    return null;
  }

  /** One control step. Returns pin instructions for the lab, and the result when done. */
  step(ports: ExperimentPorts, dt: number, results: Map<BotId, { ok: boolean; summary: string }>): { pin?: "release" | "lock"; done?: BalanceResult; phase: string } {
    this.t += dt;
    const b = ports.world("pip").balance!;
    switch (this.phase) {
      case "LOCK":
        if (b.pin !== "locked") return { pin: "lock", phase: this.phase };
        this.phase = "PLACE";
        return { phase: this.phase };
      case "PLACE": {
        // Two robots in the same stretch of lane would collide: run those one at a time.
        const spans = this.queue.map((j) => {
          const plan = PlaceWeight.plan(j.task as Extract<DuckTask, { kind: "place_weight" }>, ports.world(j.id));
          return typeof plan === "string" ? null : plan.laneSpan();
        });
        const [a, c] = spans;
        const overlap = spans.length === 2 && !!a && !!c && a[0] < c[1] && c[0] < a[1];
        const now = overlap ? this.queue.splice(0, 1) : this.queue.splice(0);
        for (const j of now) {
          const refusal = ports.start(j.id, j.task);
          if (refusal) this.failures.push(`${j.id === "pip" ? "Pip" : "Nova"}: ${refusal}`);
        }
        this.phase = "WAIT";
        return { phase: overlap ? "PLACE (one at a time: lanes overlap)" : "PLACE (together)" };
      }
      case "WAIT": {
        if ((["pip", "nova"] as BotId[]).some((id) => ports.busy(id))) return { phase: this.phase };
        for (const [id, r] of results) if (!r.ok) this.failures.push(`${id === "pip" ? "Pip" : "Nova"}: ${r.summary}`);
        results.clear();
        if (this.failures.length) return this.finish(ports, `The weights weren't placed. ${this.failures.join(" ")}`);
        if (this.queue.length) {
          this.phase = "PLACE";
          return { phase: this.phase };
        }
        this.phase = "VERIFY";
        this.t = 0;
        return { phase: this.phase };
      }
      case "VERIFY": {
        // Both robots clear of the apparatus and still before anything is measured.
        const still = (["pip", "nova"] as BotId[]).every((id) => ports.world(id).speed < NAV.settleSpeed);
        this.verifyFor = still && ports.clearFor() >= 0.5 ? this.verifyFor + dt : 0;
        if (this.verifyFor < 0.3) {
          if (this.t > 10) return this.finish(ports, "A robot stayed in contact with the apparatus, so I didn't release it.");
          return { phase: this.phase };
        }
        this.phase = "RELEASE";
        return { phase: this.phase };
      }
      case "RELEASE":
        this.phase = "SETTLE";
        this.lastAngle = b.angle;
        this.stillFor = 0;
        this.t = 0;
        return { pin: "release", phase: this.phase };
      case "SETTLE": {
        // Settled means creeping under ~0.001 rad/s for half a second: a slightly
        // unbalanced plank creeps toward its tilt for a second or two, and an
        // early reading would understate it.
        this.stillFor = Math.abs(b.angle - this.lastAngle) < 0.00002 ? this.stillFor + dt : 0;
        this.lastAngle = b.angle;
        if ((this.stillFor < 0.5 || this.t < 0.6) && this.t < 6) return { phase: this.phase };
        return this.finish(ports);
      }
      case "DONE":
        return { phase: this.phase };
    }
  }

  private finish(ports: ExperimentPorts, failure?: string) {
    const b = ports.world("pip").balance!;
    const m = momentsFor(b.rails, ports.stiffness());
    const angleDeg = (b.angle * 180) / Math.PI;
    const deg = Math.abs(angleDeg);
    const measured = {
      lowSide: (deg < LEVEL_DEG ? "level" : b.angle > 0 ? "left" : "right") as BalanceResult["measured"]["lowSide"],
      tiltDeg: Math.round(deg * 10) / 10,
      angleDeg: Math.round(angleDeg * 10) / 10,
    };
    const tilt = Math.abs(m.predictedTiltDeg);
    // Any robot contact after the pin was pulled spoils the reading.
    const contactDuring = !failure && ports.clearFor() < this.t - 0.05;
    const describe = (s: typeof m.left, side: string) => `${side}: ${s.grams} g × ${s.cm} cm = ${s.moment} N·cm`;
    const summary = failure
      ? failure
      : `${describe(m.left, "Left")}; ${describe(m.right, "right")}. ` +
        (m.predicted === "level"
          ? `They differ by ${Math.abs(m.net)} N·cm, so it should stay level (about ${tilt}°). `
          : `The ${m.predicted} moment is bigger by ${Math.abs(m.net)} N·cm, so the ${m.predicted} side should go down ${tilt >= ((MOMENTS.tilt * 180) / Math.PI) - 0.05 ? "to its stop" : `about ${tilt}°`}. `) +
        (measured.lowSide === "level" ? `Measured: it stayed level (${measured.tiltDeg}°).` : `Measured: the ${measured.lowSide} side went down ${measured.tiltDeg}°.`) +
        (contactDuring ? " Warning: a robot touched the apparatus while it settled, so this reading isn't clean." : "");
    this.phase = "DONE";
    this.result = { ok: !failure && !contactDuring, summary, left: m.left, right: m.right, predicted: m.predicted, predictedTiltDeg: m.predictedTiltDeg, measured };
    return { done: this.result, phase: this.phase };
  }
}

// ── Crew plans ─────────────────────────────────────────────────────────
// Stages of robot tasks: tasks in one stage run together (their regions are
// chosen not to overlap), stages run one after another. Used for building
// the Pythagoras squares as a pair.

export type CrewStage = { id: BotId; task: DuckTask }[];

export class CrewPlan {
  private stage = -1;
  private readonly lines: string[] = [];
  private failed = false;
  constructor(
    readonly task: DuckTask,
    private readonly stages: CrewStage[],
    private readonly describe: () => { ok: boolean; summary: string },
  ) {}

  phase() {
    return this.stage < 0 ? "starting" : `stage ${this.stage + 1} of ${this.stages.length}`;
  }

  step(ports: ExperimentPorts, results: Map<BotId, { ok: boolean; summary: string }>): { done?: { ok: boolean; summary: string }; phase: string } {
    if ((["pip", "nova"] as BotId[]).some((id) => ports.busy(id))) return { phase: this.phase() };
    for (const [id, r] of results) {
      this.lines.push(`${id === "pip" ? "Pip" : "Nova"}: ${r.summary}`);
      if (!r.ok) this.failed = true;
    }
    results.clear();
    if (this.failed || this.stage + 1 >= this.stages.length) {
      const end = this.describe();
      return { done: { ok: !this.failed && end.ok, summary: `${this.lines.join(" ")} ${end.summary}`.trim() }, phase: "done" };
    }
    this.stage++;
    for (const j of this.stages[this.stage]!) {
      const refusal = ports.start(j.id, j.task);
      if (refusal) {
        this.lines.push(`${j.id === "pip" ? "Pip" : "Nova"}: ${refusal}`);
        this.failed = true;
      }
    }
    return { phase: this.phase() };
  }
}
