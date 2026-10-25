import { MOMENTS, type DuckTask, type Vec2 } from "@kestrel/contracts";
import { VEL_ANG, VEL_FWD } from "./constants";
import type { DuckPose, TaskStep, WorldView } from "./tasks";

// The duck moves a balance weight by walking into its paddle: it routes to
// the lane beside the plank, lines up behind the paddle, frees that weight's
// brake and pushes it along its rail to a centimetre mark, where the brake
// clicks back on. The plank stays locked throughout.

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
type Twist = { vx: number; wz: number };
const HOLD: Twist = { vx: 0, wz: 0 };

/**
 * Tuning for the walking policy, measured from rest in a physics harness:
 * forward commands under 0.25 m/s and pure turns do not start its gait, but
 * a 0.3 s full-speed step does, after which a pure turn of 1.6 turns about
 * 0.9 rad/s with 2–4 cm of drift. Its full-speed turning circle (~0.25 m) is
 * wider than the lanes beside the plank, so it turns on the spot first and
 * then walks straight.
 */
export const DRIVE = {
  spin: 1.6, // rad/s commanded for on-the-spot turns
  arrive: 0.04, // m
  passed: 0.07, // m: this close with the goal behind counts as arrived (no orbiting)
  walkErr: 0.5, // rad: stop walking and turn again beyond this bearing error
  pivotErr: 0.15, // rad: turning stops here; the policy's lag covers the rest
  turnGain: 1.6,
  faceTol: 0.1, // rad
  kickSteps: 15, // 0.3 s full-speed step that starts the gait before a turn
  idleSteps: 10, // the gait counts as stopped after this many idle control steps
  turnCheck: 25, // control steps; a turn that gained under 0.05 rad in this time is re-kicked
  reach: 0.072, // m from the duck's centre to its chest, where it meets a paddle
  setback: 0.16, // m behind a paddle where the duck lines up before pushing
  lead: 0.012, // m: stop pushing this far before the mark; the weight coasts the rest
  pushBudget: 100, // control steps of pushing that must move the weight at least 4 mm
  stuckSteps: 150, // control steps with no movement at all before giving up
  body: 0.075, // m: duck footprint radius for route clearance
};

/** Turn-on-the-spot-then-walk driving for a walker with a wide turning circle and a deadband. */
export class Driver {
  private walking = false;
  private kick = 0;
  private lastActive = -Infinity;
  private n = 0;
  private turnFrom = { n: 0, yaw: 0 };

  private turn(pose: DuckPose, err: number): Twist {
    // A stopped gait needs a short step before it will turn on the spot, and
    // a turn that has stopped making progress gets another one.
    if (this.n - this.lastActive > DRIVE.idleSteps) this.kick = DRIVE.kickSteps;
    else if (this.kick === 0 && this.n - this.turnFrom.n > DRIVE.turnCheck) {
      if (Math.abs(wrap(pose.yaw - this.turnFrom.yaw)) < 0.05)
        this.kick = DRIVE.kickSteps;
      this.turnFrom = { n: this.n, yaw: pose.yaw };
    }
    this.lastActive = this.n;
    if (this.kick > 0) {
      if (--this.kick === 0) this.turnFrom = { n: this.n, yaw: pose.yaw };
      return { vx: VEL_FWD, wz: 0 };
    }
    return { vx: 0, wz: Math.sign(err) * DRIVE.spin };
  }

  /** Twist toward a point; null once within `radius`. */
  to(pose: DuckPose, goal: Vec2, radius = DRIVE.arrive): Twist | null {
    this.n++;
    const dx = goal[0] - pose.x;
    const dy = goal[1] - pose.y;
    const dist = Math.hypot(dx, dy);
    const err = wrap(Math.atan2(dy, dx) - pose.yaw);
    // At full speed the policy's lag overshoots a close goal; turning back
    // for it would orbit it forever, so a goal just passed counts as reached.
    if (dist < radius || (dist < DRIVE.passed && Math.abs(err) > Math.PI / 2)) {
      this.walking = false;
      return null;
    }
    if (this.walking && Math.abs(err) > DRIVE.walkErr) this.walking = false;
    if (!this.walking && Math.abs(err) < DRIVE.pivotErr) this.walking = true;
    if (!this.walking) return this.turn(pose, err);
    this.lastActive = this.n;
    return { vx: VEL_FWD, wz: clamp(err * DRIVE.turnGain, -VEL_ANG, VEL_ANG) };
  }

  /** Twist to face a heading on the spot; null once facing it. */
  face(pose: DuckPose, yaw: number): Twist | null {
    this.n++;
    const err = wrap(yaw - pose.yaw);
    if (Math.abs(err) < DRIVE.faceTol) return null;
    return this.turn(pose, err);
  }

  /** Full speed ahead, steering toward heading `aim`. */
  forward(pose: DuckPose, aim: number): Twist {
    this.n++;
    this.lastActive = this.n;
    return {
      vx: VEL_FWD,
      wz: clamp(wrap(aim - pose.yaw) * DRIVE.turnGain, -VEL_ANG, VEL_ANG),
    };
  }
}

type Box = { x0: number; x1: number; y0: number; y1: number };

/** Floor rectangles the duck must keep clear of: plank, pivot and paddles (less one). */
function obstacles(rails: Map<string, number>, except?: string): Box[] {
  const [px, py] = MOMENTS.pivot;
  const { plank, paddle, pivotHalf } = MOMENTS;
  const edge = px - plank.width / 2;
  const boxes: Box[] = [
    {
      x0: edge,
      x1: px + plank.width / 2,
      y0: py - plank.length / 2,
      y1: py + plank.length / 2,
    },
    {
      x0: px - pivotHalf[0],
      x1: px + pivotHalf[0],
      y0: py - pivotHalf[1],
      y1: py + pivotHalf[1],
    },
  ];
  for (const [id, at] of rails) {
    if (id === except) continue;
    boxes.push({
      x0: edge - paddle.reach,
      x1: edge,
      y0: py + at - paddle.thick / 2,
      y1: py + at + paddle.thick / 2,
    });
  }
  return boxes;
}

/** Is the straight walk a→b clear of the apparatus? */
function clear(
  rails: Map<string, number>,
  a: Vec2,
  b: Vec2,
  except?: string,
): boolean {
  const boxes = obstacles(rails, except);
  const r = DRIVE.body;
  for (let i = 0; i <= 20; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 20;
    const y = a[1] + ((b[1] - a[1]) * i) / 20;
    for (const k of boxes)
      if (x > k.x0 - r && x < k.x1 + r && y > k.y0 - r && y < k.y1 + r)
        return false;
  }
  return true;
}

const cmText = (at: number) =>
  `${(Math.abs(at) * 100).toFixed(1).replace(/\.0$/, "")} cm`;

type Phase = "lock" | "route" | "align" | "push" | "settle" | "leave" | "done";

export class PlaceWeight {
  private phase: Phase;
  private readonly driver = new Driver();
  private waypoints: Vec2[] = [];
  private readonly from: number;
  private readonly target: number;
  private readonly dir: 1 | -1;
  private readonly label: string;
  private n = 0;
  private pushStart = { n: 0, at: 0 };
  private settle = 0;
  private leaving = 0;
  private still = 0;
  private last: { pose: DuckPose; at: number } | null = null;

  private constructor(
    private readonly id: string,
    world: WorldView,
    target: number,
  ) {
    const rails = world.balance!.rails;
    this.from = rails.get(id)!;
    this.target = target;
    this.dir = target >= this.from ? 1 : -1;
    this.label = world.kit.props.find((p) => p.id === id)?.label ?? id;
    this.phase = world.balance!.pin === "locked" ? "route" : "lock";
  }

  /** Validate a place_weight task against the live world: a plan, or a refusal. */
  static plan(
    task: Extract<DuckTask, { kind: "place_weight" }>,
    world: WorldView,
  ): PlaceWeight | string {
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
      // Pushing a weight inward must leave room for the duck to stand between the two.
      const gap = Math.abs(other - target);
      if (gap < MOMENTS.minGap && gap < Math.abs(other - now)) {
        const closest = Math.ceil(
          Math.round((MOMENTS.minGap - Math.abs(other)) * 1000) / 10,
        );
        return `If I push it that close, there won't be room for me to stand between the weights. Try ${Math.max(MOMENTS.minCm, closest)} cm or more.`;
      }
    }
    const plan = new PlaceWeight(task.target, world, target);
    if (Math.abs(target - now) >= 0.0015 && plan.phase === "route") {
      const refusal = plan.route(world);
      if (refusal) return refusal;
    }
    return plan;
  }

  /**
   * Waypoints to the corner behind the paddle, or a refusal. Candidate routes
   * are scored by time; turning (~0.9 rad/s) is the slow part, so a diagonal
   * approach that arrives nearly facing the push usually beats a tidy L.
   */
  private route(world: WorldView): string | null {
    const rails = world.balance!.rails;
    const py = MOMENTS.pivot[1];
    const T = MOMENTS.transitX;
    const { dir, from } = this;
    // Standing room behind the paddle, up to the other paddle or the end of the plank.
    const others = [...rails]
      .filter(([id]) => id !== this.id)
      .map(([, at]) => at);
    const behind = others.filter((at) => (from - at) * dir > 0);
    const room = behind.length
      ? Math.min(...behind.map((at) => Math.abs(from - at))) -
        MOMENTS.paddle.thick
      : Infinity;
    if (room < DRIVE.reach + 0.03)
      return "There isn't room between the weights for me to stand and push it that way. Try moving the other weight first.";
    const setback = Math.min(DRIVE.setback, room - DRIVE.body);
    const corner: Vec2 = [MOMENTS.laneX, py + from - dir * setback];
    const here: Vec2 = [world.duck.x, world.duck.y];
    if (here[0] > MOMENTS.pivot[0])
      return "I'm on the other side of the plank. Drive me back round to the side with the paddles first.";
    // From inside the lane, back straight out to the walkway first.
    const start: Vec2 = here[0] > T + 0.03 ? [T, here[1]] : here;
    const routes: Vec2[][] = [[corner]];
    for (const off of [0.24, 0.16, 0])
      routes.push([[T, corner[1] - dir * off], corner]);
    for (const off of [0.24, 0])
      routes.push([[T, start[1]], [T, corner[1] - dir * off], corner]);
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
      return (turning + Math.abs(wrap(finalYaw - yaw))) / 0.9 + dist / VEL_FWD;
    };
    // The last leg may brush the target paddle's back face when the corner is
    // tight, but only a leg that stays behind the paddle; one coming from the
    // far side would walk through it.
    const behindPaddle = (a: Vec2) => (a[1] - (py + from)) * dir < 0;
    const ok = routes.filter((r) =>
      r.every((p, i) => {
        const a = i ? r[i - 1]! : start;
        return clear(
          rails,
          a,
          p,
          i === r.length - 1 && behindPaddle(a) ? this.id : undefined,
        );
      }),
    );
    if (!ok.length)
      return "Something is in my way to that weight. Move me nearer the front of the plank and try again.";
    this.waypoints = [
      ...(start === here ? [] : [start]),
      ...ok.sort((a, b) => cost(a) - cost(b))[0]!,
    ];
    return null;
  }

  private fail(summary: string, brake?: number): TaskStep {
    this.phase = "done";
    return {
      ...HOLD,
      ...(brake === undefined ? {} : { brake: { id: this.id, at: brake } }),
      done: { ok: false, summary },
    };
  }

  /** How far the weight is now, for timeouts and status. */
  where(world: WorldView): string {
    return `The ${this.label} is at ${cmText(world.balance!.rails.get(this.id)!)}.`;
  }

  step(world: WorldView): TaskStep {
    this.n++;
    const pose = world.duck;
    const balance = world.balance!;
    const at = balance.rails.get(this.id)!;
    if (
      this.phase !== "lock" &&
      this.phase !== "leave" &&
      this.phase !== "done"
    ) {
      // Nothing at all moving (body or weight) for a while: stuck, not slow.
      const moved =
        !this.last ||
        Math.hypot(pose.x - this.last.pose.x, pose.y - this.last.pose.y) >
          0.0008 ||
        Math.abs(wrap(pose.yaw - this.last.pose.yaw)) > 0.003 ||
        Math.abs(at - this.last.at) > 0.0002;
      this.still = moved ? 0 : this.still + 1;
      this.last = { pose: { ...pose }, at };
      if (this.still > DRIVE.stuckSteps)
        return this.fail(`I got stuck on the way. ${this.where(world)}`, at);
    }
    switch (this.phase) {
      case "lock":
        // Weights only move on a locked, level plank.
        if (balance.pin !== "locked") return { ...HOLD, pin: "lock" };
        if (Math.abs(this.target - at) >= 0.0015) {
          const refusal = this.route(world);
          if (refusal) return this.fail(refusal);
        }
        this.phase = "route";
        return HOLD;
      case "route": {
        if (Math.abs(this.target - at) < 0.0015) {
          this.phase = "done";
          return {
            ...HOLD,
            done: {
              ok: true,
              summary: `The ${this.label} is already at ${cmText(at)}.`,
            },
          };
        }
        const wp = this.waypoints[0];
        const twist = wp ? this.driver.to(pose, wp) : null;
        if (twist) return twist;
        this.waypoints.shift();
        if (!this.waypoints.length) this.phase = "align";
        return HOLD;
      }
      case "align": {
        const twist = this.driver.face(
          pose,
          this.dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        );
        if (twist) return twist;
        this.phase = "push";
        this.pushStart = { n: this.n, at };
        return { ...HOLD, brake: { id: this.id, at: null } };
      }
      case "push": {
        if ((this.target - at) * this.dir <= DRIVE.lead) {
          this.phase = "settle";
          return { ...HOLD, brake: { id: this.id, at: this.target } };
        }
        // A push that has not moved the weight after the walk-in is blocked.
        if (this.n - this.pushStart.n > DRIVE.pushBudget) {
          if ((at - this.pushStart.at) * this.dir < 0.004)
            return this.fail(
              `I couldn't move the ${this.label}. Something is blocking it.`,
              at,
            );
          this.pushStart = { n: this.n, at };
        }
        // Walk along the lane, steering back onto it if the gait drifts.
        return this.driver.forward(
          pose,
          Math.atan2(this.dir * 0.12, MOMENTS.laneX - pose.x),
        );
      }
      case "settle":
        // Stand still against the braked paddle while the step settles.
        if (++this.settle > 15) this.phase = "leave";
        return HOLD;
      case "leave": {
        // Step back to the walkway, so nothing touches the plank when it is released.
        const twist = this.driver.to(pose, [MOMENTS.transitX, pose.y]);
        if (twist && ++this.leaving < 8 * 50) return twist;
        this.phase = "done";
        return {
          ...HOLD,
          done: {
            ok: true,
            summary: `Moved the ${this.label} from ${cmText(this.from)} to ${cmText(at)}.`,
          },
        };
      }
      case "done":
        return HOLD;
    }
  }
}
