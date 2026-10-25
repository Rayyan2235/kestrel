import { RESCUE, rescuePoints, routeIsClear } from "@kestrel/contracts";
import type { BotId, DuckTask, LabKit, PropSpec, Vec2 } from "@kestrel/contracts";
import { SCREEN_DIRS } from "./constants";
import { PlaceWeight } from "./moments";
import { NAV, Navigator } from "./navigate";

// Turns one bounded DuckTask into velocity commands and one-shot skill
// triggers, a control step at a time. The world is read from simulation
// snapshots, so results are measured, not assumed. Driving goes through
// Navigator, which never commands inside the walking policy's dead zones.

export type DuckPose = { x: number; y: number; yaw: number };
export type WorldView = {
  /** The duck this view is for. */
  id: BotId;
  duck: DuckPose;
  /** Measured planar trunk speed, m/s. */
  speed: number;
  /** Every other duck in the world. */
  others: { id: BotId; pose: DuckPose }[];
  props: Map<string, Vec2>;
  kit: LabKit;
  /** Normal contact force (N) between this duck and each prop, over the last control step. */
  touching: Map<string, number>;
  /** The Moments balance, when the lesson has one. */
  balance?: BalanceView;
};
export type BalanceView = {
  pin: "locked" | "levelling" | "free";
  /** Plank angle in radians; positive lowers the left side. */
  angle: number;
  /** Each weight's rail position: metres from the pivot, negative on the left. */
  rails: Map<string, number>;
};
export type Skill = "sit" | "stand" | "kickL" | "kickR" | "roll" | "peck";
export type TaskStep = {
  vx: number;
  wz: number;
  trigger?: Skill;
  /** Hold a weight's brake at a rail position (metres), or free it (null) to push it. */
  brake?: { id: string; at: number | null };
  /** Pull the plank's lock pin, or level the plank and lock it. */
  pin?: "release" | "lock";
  /** Where the task is, for the learner and for debugging. */
  phase?: string;
  done?: { ok: boolean; summary: string };
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cm = (m: number) => `${Math.round(m * 100)} cm`;
const HOLD = { vx: 0, wz: 0 };

/**
 * Insert detour points so each straight leg of a route keeps clear of the
 * movable props (other than the one being pushed) and the other robots,
 * so a push never bulldozes something already in place.
 */
export function routeAround(world: WorldView, start: Vec2, waypoints: Vec2[], except: string): Vec2[] {
  const body = 0.075;
  const circles: { c: Vec2; r: number }[] = [];
  for (const p of world.kit.props) {
    if (p.joint !== "free" || p.id === except) continue;
    const at = world.props.get(p.id);
    if (at) circles.push({ c: at, r: footprint(p) * Math.SQRT2 + body + 0.02 });
  }
  for (const o of world.others) circles.push({ c: [o.pose.x, o.pose.y], r: 2 * body + 0.02 });
  const leg = (a: Vec2, b: Vec2, depth: number): Vec2[] => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-9;
    for (const { c, r } of circles) {
      // An obstacle sitting on an endpoint can't be avoided by a detour.
      if (dist(c, a) < r || dist(c, b) < r) continue;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2));
      const near: Vec2 = [a[0] + t * dx, a[1] + t * dy];
      const d = dist(near, c);
      if (d >= r || depth > 2) continue;
      // Step out sideways from the obstacle, on the side the leg already passes.
      const n: Vec2 = d > 1e-6 ? [(near[0] - c[0]) / d, (near[1] - c[1]) / d] : [-dy / Math.sqrt(len2), dx / Math.sqrt(len2)];
      const via: Vec2 = [c[0] + n[0] * (r + 0.03), c[1] + n[1] * (r + 0.03)];
      return [...leg(a, via, depth + 1), via, ...leg(via, b, depth + 1)];
    }
    return [];
  };
  const out: Vec2[] = [];
  let from = start;
  // Starting against something (just after a push): step straight away from it first.
  for (const { c, r } of circles) {
    const d = dist(c, start);
    if (d < r && d > 1e-6) {
      from = [c[0] + ((start[0] - c[0]) / d) * (r + 0.03), c[1] + ((start[1] - c[1]) / d) * (r + 0.03)];
      out.push(from);
      break;
    }
  }
  for (const w of waypoints) {
    out.push(...leg(from, w, 0), w);
    from = w;
  }
  return out;
}

export function footprint(p: PropSpec): number {
  const s = p.shape;
  if (s.type === "box") return Math.max(s.size[0], s.size[1]) / 2;
  if (s.type === "triangle") return Math.max(...s.legs) / 2;
  return Math.max(s.width, s.length) / 2;
}

const TIMEOUT_S: Record<DuckTask["kind"], number> = {
  rescue_route: 150,
  move: 20,
  turn: 10,
  go_to: 30,
  push: 120,
  place_weight: 90,
  set_balance: 240,
  build_squares: 300,
  release_plank: 8,
  lock_plank: 6,
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
  nav: Navigator;
  phase: "approach" | "align" | "push" | "withdraw" | "settle";
  goal?: Vec2;
  waypoints?: Vec2[];
  startProp?: Vec2;
  lastProp?: Vec2;
  stillFor?: number;
  replans?: number;
  place?: PlaceWeight;
  /** Release: the pin has been pulled; the plank's last angle and how long it has been still. */
  pulled?: boolean;
  lastAngle?: number;
  traveled?: number;
  lastPose?: Vec2;
};

export class TaskRunner {
  private run: Run | null = null;
  /** The running task's state-machine phase, from its last step. */
  phase: string | null = null;

  get rescueProgress(): { meters: number; battery: number } | null {
    if (this.run?.task.kind !== "rescue_route") return null;
    const meters = this.run.traveled ?? 0;
    return { meters, battery: Math.max(0, 1 - meters / RESCUE.batteryMeters) };
  }

  get active(): DuckTask | null {
    return this.run?.task ?? null;
  }

  cancel(): void {
    this.run = null;
    this.phase = null;
  }

  /** Validate against the live world. Returns a refusal reason, or null. */
  start(task: DuckTask, world: WorldView): string | null {
    const run: Run = { task, t: 0, start: { ...world.duck }, nav: new Navigator(), phase: "approach" };
    if (task.kind === "set_balance" || task.kind === "build_squares") return "Both robots do this together; the lab coordinates it.";
    if (task.kind === "rescue_route") {
      if (world.kit.id !== "rescue" || world.id !== "pip") return "Open Robot rescue and send Pip.";
      if (dist([world.duck.x, world.duck.y], RESCUE.start) > 0.1) return "Reset the rescue before trying a route.";
      const points = rescuePoints(task.route);
      if (points.length < 2 || !routeIsClear(points)) return "Follow connected arrows from A to H.";
      run.waypoints = points.slice(1);
      run.traveled = 0;
      run.lastPose = [world.duck.x, world.duck.y];
    }
    if (task.kind === "go_to" && !world.props.has(task.target))
      return `There is no ${task.target} in this lab.`;
    if ((task.kind === "release_plank" || task.kind === "lock_plank") && !world.balance)
      return "There is no balance in this lesson.";
    if (task.kind === "place_weight") {
      const plan = PlaceWeight.plan(task, world);
      if (typeof plan === "string") return plan;
      run.place = plan;
    }
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
    const out = this.advance(run, world);
    if (!out.done && run.t > TIMEOUT_S[run.task.kind]) {
      let summary = `Gave up after ${TIMEOUT_S[run.task.kind]} s.`;
      // Report what actually happened, so nobody concludes "nothing moved".
      const task = run.task;
      if (task.kind === "push" && run.startProp && run.goal) {
        const now = world.props.get(task.target);
        if (now)
          summary += ` It moved ${cm(dist(run.startProp, now))} and is still ${cm(dist(now, run.goal))} from the target.`;
      }
      if (run.place) summary += ` ${run.place.where(world)}`;
      out.done = { ok: false, summary };
    }
    this.phase = out.done ? null : out.phase ?? null;
    if (out.done) this.run = null;
    return out;
  }

  private advance(run: Run, world: WorldView): TaskStep {
    const { task } = run;
    const duck = world.duck;
    switch (task.kind) {
      case "rescue_route": {
        const here: Vec2 = [duck.x, duck.y];
        run.traveled! += dist(run.lastPose!, here);
        run.lastPose = here;
        if (run.traveled! >= RESCUE.batteryMeters)
          return { ...HOLD, done: { ok: false, summary: "Battery died! That route was too long. Back to the start—try a shorter way." } };
        if ([...world.touching].some(([id, force]) => id.startsWith("rescue-barrier-") && force > 0.05) || world.others.some(r => dist(here, [r.pose.x, r.pose.y]) < 0.19))
          return { ...HOLD, done: { ok: false, summary: "Pip met an obstacle. Reset and try again." } };
        const goal = run.waypoints![0]!;
        const twist = run.nav.to(duck, world.speed, goal);
        if (run.nav.status !== "arrived") return { ...twist, phase: "Following your route" };
        // Recheck physical position: settling alone must not claim a rescue.
        if (dist(here, goal) > 0.1) return { ...HOLD, done: { ok: false, summary: "Pip drifted away from the route point. Try again." } };
        run.waypoints!.shift();
        run.nav.next();
        if (run.waypoints!.length) return HOLD;
        return { ...HOLD, done: { ok: true, summary: `Made it! Pip reached the charger with ${Math.max(0, Math.ceil((1-run.traveled!/RESCUE.batteryMeters)*100))}% battery left. Your shorter route saved Pip.` } };
      }
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
        // Stop early by the measured coast (~1 cm), then wait until the duck is still.
        if (run.phase !== "settle" && Math.abs(remaining) > 0.015 && Math.sign(remaining) === Math.sign(task.meters)) {
          if (task.meters < 0) return { vx: NAV.back, wz: 0 };
          return run.nav.forward(duck, run.start.yaw, remaining > NAV.slowWithin ? NAV.cruise : NAV.approach);
        }
        run.phase = "settle";
        if (world.speed > NAV.settleSpeed) return HOLD;
        return { ...HOLD, done: { ok: true, summary: `Moved ${cm(along)}.` } };
      }
      case "turn": {
        const target = run.start.yaw + (task.degrees * Math.PI) / 180;
        const twist = run.nav.face(duck, world.speed, target, 0.08);
        if (run.nav.status !== "arrived") return twist;
        const turned = wrap(duck.yaw - run.start.yaw);
        return { ...HOLD, done: { ok: true, summary: `Turned ${Math.round((turned * 180) / Math.PI)}°.` } };
      }
      case "go_to": {
        const target = world.props.get(task.target)!;
        const spec = world.kit.props.find((p) => p.id === task.target)!;
        const stopAt = footprint(spec) + 0.12;
        const d = dist([duck.x, duck.y], target);
        // Head for the point on the line to the target, stopAt short of it.
        const k = d > 1e-6 ? (d - stopAt) / d : 0;
        const goal: Vec2 = [duck.x + (target[0] - duck.x) * k, duck.y + (target[1] - duck.y) * k];
        const twist = run.nav.to(duck, world.speed, goal);
        if (run.nav.status !== "arrived") return twist;
        return { ...HOLD, done: { ok: true, summary: `Reached the ${spec.label}, ${cm(dist([duck.x, duck.y], target))} away.` } };
      }
      case "push":
        return this.push(run, world);
      case "place_weight":
        return run.place!.step(world);
      case "release_plank":
        return this.release(run, world);
      case "set_balance":
      case "build_squares":
        return { ...HOLD, done: { ok: false, summary: "The lab runs this with both robots, not a single one." } };
      case "lock_plank":
        if (world.balance!.pin === "locked")
          return { vx: 0, wz: 0, done: { ok: true, summary: run.t <= 0.02 ? "The plank is already locked." : "Levelled and locked the plank." } };
        return { vx: 0, wz: 0, pin: "lock" };
    }
  }

  /** Pull the pin, wait for the plank to come to rest, and report the measured tilt. */
  private release(run: Run, world: WorldView): TaskStep {
    const angle = world.balance!.angle;
    if (!run.pulled) {
      run.pulled = true;
      run.lastAngle = angle;
      run.stillFor = 0;
      return { vx: 0, wz: 0, pin: "release" };
    }
    // Settled: creeping under ~0.001 rad/s for half a second (see BalanceExperiment).
    run.stillFor = Math.abs(angle - run.lastAngle!) < 0.00002 ? (run.stillFor ?? 0) + 0.02 : 0;
    run.lastAngle = angle;
    if ((run.stillFor < 0.5 || run.t < 0.6) && run.t < 6) return { vx: 0, wz: 0 };
    // Round first, then classify, so "stayed level (0.5°)" can never be printed.
    const deg = Math.round(Math.abs((angle * 180) / Math.PI) * 10) / 10;
    const summary =
      deg < 0.5
        ? `Released the plank. It stayed level (${deg.toFixed(1)}°).`
        : `Released the plank. The ${angle > 0 ? "left" : "right"} side went down ${deg.toFixed(1)}°.`;
    return { vx: 0, wz: 0, done: { ok: true, summary } };
  }

  private push(run: Run, world: WorldView): TaskStep {
    const task = run.task as Extract<DuckTask, { kind: "push" }>;
    const duck = world.duck;
    const prop = world.props.get(task.target)!;
    const spec = world.kit.props.find((p) => p.id === task.target)!;
    const goal = run.goal!;
    const remaining = dist(prop, goal);
    // Same tolerance as slotFilled(), so "done" and the lit slot agree. Then
    // back off the square (forward would shove it), so the next move starts clear.
    if (run.phase === "withdraw" || run.phase === "settle" || remaining <= 0.04) {
      if (run.phase !== "withdraw" && run.phase !== "settle") run.phase = "withdraw";
      const gap = dist([duck.x, duck.y], prop) - footprint(spec);
      if (run.phase === "withdraw" && gap < 0.16 && run.t < TIMEOUT_S.push - 5) return { vx: NAV.back, wz: 0, phase: "withdraw" };
      run.phase = "settle";
      if (world.speed > NAV.settleSpeed) return { ...HOLD, phase: "settle" };
      return { ...HOLD, done: { ok: true, summary: `${spec.label} moved ${cm(run.startProp ? dist(run.startProp, prop) : 0)} and is ${cm(remaining)} from its target.` } };
    }
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
        run.nav.next();
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
        run.waypoints = routeAround(world, [duck.x, duck.y], run.waypoints, task.target);
      }
      const wp = run.waypoints[0]!;
      const twist = run.nav.to(duck, world.speed, wp, { radius: 0.05 });
      if (run.nav.status !== "arrived") return { ...twist, phase: "approach" };
      run.waypoints.shift();
      run.nav.next();
      if (run.waypoints.length) return HOLD;
      run.waypoints = undefined;
      run.phase = "align";
    }
    if (run.phase === "align") {
      const twist = run.nav.face(duck, world.speed, Math.atan2(dir[1], dir[0]), 0.12);
      if (run.nav.status !== "arrived") return { ...twist, phase: "align" };
      run.nav.next();
      run.phase = "push";
      run.lastProp = prop;
      run.stillFor = 0;
    }
    // Stalled (prop hasn't moved 1 cm in 3 s): walk out behind it and come in again.
    if (dist(run.lastProp ?? prop, prop) > 0.01) {
      run.lastProp = prop;
      run.stillFor = 0;
    } else if ((run.stillFor = (run.stillFor ?? 0) + 1 / 50) > 3) {
      if ((run.replans = (run.replans ?? 0) + 1) > 4)
        return { ...HOLD, done: { ok: false, summary: `${spec.label} stopped moving and I couldn't get it going again. It moved ${cm(run.startProp ? dist(run.startProp, prop) : 0)} and is ${cm(remaining)} from its target.` } };
      run.phase = "approach";
      run.waypoints = routeAround(world, [duck.x, duck.y], [[prop[0] - dir[0] * (back + 0.08), prop[1] - dir[1] * (back + 0.08)], behind], task.target);
      run.stillFor = 0;
      return HOLD;
    }
    // Push: steer for a point just past the prop on the push line, at the
    // approach command (0.3, above the gait's dead zone).
    const aim: Vec2 = [prop[0] + dir[0] * 0.05, prop[1] + dir[1] * 0.05];
    return { ...run.nav.forward(duck, Math.atan2(aim[1] - duck.y, aim[0] - duck.x), NAV.approach), phase: "push" };
  }
}
