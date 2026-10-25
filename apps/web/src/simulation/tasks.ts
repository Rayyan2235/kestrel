import type { DuckTask, LabKit, PropSpec, Vec2 } from "@kestrel/contracts";
import { SCREEN_DIRS, VEL_ANG, VEL_BACK, VEL_FWD } from "./constants";

// Turns one bounded DuckTask into velocity commands and one-shot skill
// triggers, a control step at a time. The world is read from simulation
// snapshots, so results are measured, not assumed.

export type DuckPose = { x: number; y: number; yaw: number };
export type WorldView = {
  duck: DuckPose;
  props: Map<string, Vec2>;
  kit: LabKit;
};
export type Skill = "sit" | "stand" | "kickL" | "kickR" | "roll" | "peck";
export type TaskStep = {
  vx: number;
  wz: number;
  trigger?: Skill;
  done?: { ok: boolean; summary: string };
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cm = (m: number) => `${Math.round(m * 100)} cm`;

export function footprint(p: PropSpec): number {
  const s = p.shape;
  if (s.type === "box") return Math.max(s.size[0], s.size[1]) / 2;
  if (s.type === "triangle") return Math.max(...s.legs) / 2;
  return Math.max(s.width, s.length) / 2;
}

/**
 * The walking policy barely turns with vx = 0 (measured: a right turn from
 * standstill stalls near −15°), but turns briskly with a slight forward
 * creep. Every "turn in place" therefore creeps forward at this speed.
 */
const TURN_CREEP = 0.1;

/** Drive toward a point: turn (with creep) when badly misaligned. */
function steerTo(duck: DuckPose, goal: Vec2, maxV = VEL_FWD) {
  const d = dist([duck.x, duck.y], goal);
  const err = wrap(Math.atan2(goal[1] - duck.y, goal[0] - duck.x) - duck.yaw);
  const wz = clamp(2.2 * err, -VEL_ANG, VEL_ANG);
  const vx = Math.abs(err) > 0.6 ? TURN_CREEP : clamp(1.4 * d, 0.06, maxV) * Math.cos(err);
  return { vx, wz, d, err };
}

const TIMEOUT_S: Record<DuckTask["kind"], number> = {
  move: 20,
  turn: 10,
  go_to: 30,
  push: 150,
  kick: 1,
  sit: 1,
  stand: 1,
  peck: 1,
  roll: 1,
  stop: 1,
};

type Run = {
  task: DuckTask;
  t: number;
  start: DuckPose;
  phase: "approach" | "align" | "push";
  goal?: Vec2;
  waypoints?: Vec2[];
  startProp?: Vec2;
  lastProp?: Vec2;
  stillFor?: number;
  anchor?: DuckPose;
  stuck?: number;
  kick?: number;
};

export class TaskRunner {
  private run: Run | null = null;

  get active(): DuckTask | null {
    return this.run?.task ?? null;
  }

  cancel(): void {
    this.run = null;
  }

  /** Validate against the live world. Returns a refusal reason, or null. */
  start(task: DuckTask, world: WorldView): string | null {
    const run: Run = { task, t: 0, start: { ...world.duck }, phase: "approach" };
    if (task.kind === "go_to" && !world.props.has(task.target))
      return `There is no ${task.target} in this lab.`;
    if (task.kind === "push") {
      const prop = world.props.get(task.target);
      if (!prop) return `There is no ${task.target} in this lab.`;
      const spec = world.kit.props.find((p) => p.id === task.target)!;
      if (spec.joint !== "free") return `${spec.label} is fixed in place.`;
      if (task.direction && task.toward) return "Choose a direction or a destination, not both.";
      if (task.toward === task.target) return "An object cannot be its own destination. Use its slot or a direction.";
      if (task.toward === "slot") {
        const slot = world.kit.slots.find((s) => s.forProp === task.target);
        if (!slot) return `${spec.label} has no slot in this lesson.`;
        run.goal = slot.pos;
      } else if (task.direction) {
        // Directions are as the learner sees them on screen.
        const [dx, dy] = SCREEN_DIRS[task.direction];
        const m = task.meters ?? 0.2;
        run.goal = [prop[0] + dx * m, prop[1] + dy * m];
      } else if (task.toward) {
        const other = world.props.get(task.toward);
        if (!other) return `There is no ${task.toward} in this lab.`;
        run.goal = other;
      } else {
        // No destination: push it straight away from the duck.
        const h = Math.atan2(prop[1] - world.duck.y, prop[0] - world.duck.x);
        const m = task.meters ?? 0.3;
        run.goal = [prop[0] + Math.cos(h) * m, prop[1] + Math.sin(h) * m];
      }
      run.startProp = prop;
    }
    this.run = run;
    return null;
  }

  step(world: WorldView, dt: number): TaskStep | null {
    const run = this.run;
    if (!run) return null;
    run.t += dt;
    // Gait kick-start: the policy can stall from a standing pose (seen on
    // right turns from rest). If motion is commanded but the duck hasn't
    // moved or turned for 1.5 s, take a short forward step first.
    if (run.kick && run.kick > 0) {
      run.kick -= dt;
      return { vx: VEL_FWD, wz: 0 };
    }
    const out = this.advance(run, world);
    const d = world.duck;
    const commanded = Math.abs(out.vx) + Math.abs(out.wz) > 0.05;
    const moved =
      !run.anchor ||
      Math.hypot(d.x - run.anchor.x, d.y - run.anchor.y) > 0.02 ||
      Math.abs(wrap(d.yaw - run.anchor.yaw)) > 0.06;
    if (moved || !commanded) {
      run.anchor = { ...d };
      run.stuck = 0;
    } else if ((run.stuck = (run.stuck ?? 0) + dt) > 1.5) {
      run.kick = 0.8;
      run.anchor = { ...d };
      run.stuck = 0;
    }
    if (!out.done && run.t > TIMEOUT_S[run.task.kind]) {
      let summary = `Gave up after ${TIMEOUT_S[run.task.kind]} s.`;
      // Report what actually happened, so nobody concludes "nothing moved".
      const task = run.task;
      if (task.kind === "push" && run.startProp && run.goal) {
        const now = world.props.get(task.target);
        if (now)
          summary += ` It moved ${cm(dist(run.startProp, now))} and is still ${cm(dist(now, run.goal))} from the target.`;
      }
      out.done = { ok: false, summary };
    }
    if (out.done) this.run = null;
    return out;
  }

  private advance(run: Run, world: WorldView): TaskStep {
    const { task } = run;
    const duck = world.duck;
    switch (task.kind) {
      case "stop":
        return { vx: 0, wz: 0, done: { ok: true, summary: "Stopped." } };
      case "sit":
      case "stand":
      case "peck":
      case "roll":
        return { vx: 0, wz: 0, trigger: task.kind, done: { ok: true, summary: `Started ${task.kind}.` } };
      case "kick":
        return {
          vx: 0,
          wz: 0,
          trigger: task.foot === "left" ? "kickL" : "kickR",
          done: { ok: true, summary: `Kicked with the ${task.foot} foot.` },
        };
      case "move": {
        const along =
          (duck.x - run.start.x) * Math.cos(run.start.yaw) +
          (duck.y - run.start.y) * Math.sin(run.start.yaw);
        const remaining = task.meters - along;
        if (Math.abs(remaining) < 0.02)
          return { vx: 0, wz: 0, done: { ok: true, summary: `Moved ${cm(along)}.` } };
        const wz = clamp(2 * wrap(run.start.yaw - duck.yaw), -VEL_ANG, VEL_ANG);
        const vx = clamp(1.5 * remaining, VEL_BACK, VEL_FWD);
        return { vx: Math.sign(vx) * Math.max(Math.abs(vx), 0.05), wz };
      }
      case "turn": {
        const target = run.start.yaw + (task.degrees * Math.PI) / 180;
        const err = wrap(target - duck.yaw);
        if (Math.abs(err) < 0.08) {
          const turned = wrap(duck.yaw - run.start.yaw);
          return { vx: 0, wz: 0, done: { ok: true, summary: `Turned ${Math.round((turned * 180) / Math.PI)}°.` } };
        }
        return { vx: TURN_CREEP, wz: clamp(2.5 * err, -VEL_ANG, VEL_ANG) };
      }
      case "go_to": {
        const target = world.props.get(task.target)!;
        const spec = world.kit.props.find((p) => p.id === task.target)!;
        const stopAt = footprint(spec) + 0.12;
        const s = steerTo(duck, target);
        if (s.d <= stopAt)
          return { vx: 0, wz: 0, done: { ok: true, summary: `Reached the ${spec.label}, ${cm(s.d)} away.` } };
        return { vx: s.vx, wz: s.wz };
      }
      case "push":
        return this.push(run, world);
    }
  }

  private push(run: Run, world: WorldView): TaskStep {
    const task = run.task as Extract<DuckTask, { kind: "push" }>;
    const duck = world.duck;
    const prop = world.props.get(task.target)!;
    const spec = world.kit.props.find((p) => p.id === task.target)!;
    const goal = run.goal!;
    const remaining = dist(prop, goal);
    // Same tolerance as slotFilled(), so "done" and the lit slot agree.
    if (remaining <= 0.04)
      return { vx: 0, wz: 0, done: { ok: true, summary: `${spec.label} moved ${cm(run.startProp ? dist(run.startProp, prop) : 0)} and is ${cm(remaining)} from its target.` } };
    const dir: Vec2 = [(goal[0] - prop[0]) / remaining, (goal[1] - prop[1]) / remaining];
    const back = footprint(spec) + 0.13;
    const behind: Vec2 = [prop[0] - dir[0] * back, prop[1] - dir[1] * back];
    // Where the duck sits relative to the push line through the prop.
    const rel: Vec2 = [duck.x - prop[0], duck.y - prop[1]];
    const ahead = rel[0] * dir[0] + rel[1] * dir[1];
    const lateral = Math.abs(rel[0] * -dir[1] + rel[1] * dir[0]);

    // Fell off the push line (the gait sways, the prop slides): re-plan.
    if (run.phase === "push" && (lateral > 0.08 || ahead > -footprint(spec) * 0.3)) {
      run.phase = "approach";
      run.waypoints = undefined;
    }
    if (run.phase === "approach") {
      if (!run.waypoints) {
        // From in front of or beside the prop, swing out to its side first
        // so the approach doesn't shove it the wrong way.
        run.waypoints = [];
        if (ahead > -back * 0.5) {
          const side = rel[0] * -dir[1] + rel[1] * dir[0] >= 0 ? 1 : -1;
          const reach = back + 0.04;
          run.waypoints.push([
            prop[0] - dir[1] * side * reach - dir[0] * back * 0.4,
            prop[1] + dir[0] * side * reach - dir[1] * back * 0.4,
          ]);
        }
        run.waypoints.push(behind);
      }
      const wp = run.waypoints[0]!;
      const s = steerTo(duck, wp, 0.2);
      if (s.d > 0.06) return { vx: s.vx, wz: s.wz };
      run.waypoints.shift();
      if (run.waypoints.length) return { vx: 0, wz: 0 };
      run.waypoints = undefined;
      run.phase = "align";
    }
    if (run.phase === "align") {
      const err = wrap(Math.atan2(dir[1], dir[0]) - duck.yaw);
      if (Math.abs(err) < 0.12) run.phase = "push";
      else return { vx: TURN_CREEP, wz: clamp(2.5 * err, -VEL_ANG, VEL_ANG) };
    }
    // Stalled (prop hasn't moved for 3 s): back off and come in again.
    if (!run.lastProp || dist(run.lastProp, prop) > 0.01) {
      run.lastProp = prop;
      run.stillFor = 0;
    } else if ((run.stillFor = (run.stillFor ?? 0) + 1 / 50) > 3) {
      run.phase = "approach";
      run.waypoints = [[duck.x - dir[0] * 0.12, duck.y - dir[1] * 0.12], behind];
      run.stillFor = 0;
      return { vx: VEL_BACK, wz: 0 };
    }
    // Push: aim slightly past the prop toward the goal. The walking policy
    // barely tracks commands under ~0.1 m/s, so never go slower than that.
    const aim: Vec2 = [prop[0] + dir[0] * 0.05, prop[1] + dir[1] * 0.05];
    const s = steerTo(duck, aim, clamp(remaining * 1.5, 0.12, 0.2));
    return { vx: Math.max(s.vx, 0.12), wz: s.wz };
  }
}
