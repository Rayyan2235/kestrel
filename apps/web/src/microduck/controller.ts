import { BALANCE_FIXTURE as fixture, type BotId, type Position } from "@kestrel/contracts";
import { distance, referenceController, type Controller, type ControllerFrame } from "../simulation/controller.js";
import { link } from "./link.js";

// The runtime's per-step movement bound (0.8 m/s × 50 ms), less a margin.
const MAX_STEP = (fixture.speedMetersPerSecond * 50) / 1000 - 1e-4;
const DOCK_RADIUS = 0.12; // scene metres from the dock at which the body counts as arrived
const DOCK_HEADING = 1.3; // radians; the body finishes lining up while it docks
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function toward(from: Position, to: Position, max: number): Position {
  const d = distance(from, to);
  if (d <= max) return [to[0], 0, to[2]];
  const t = max / d;
  return [from[0] + (to[0] - from[0]) * t, 0, from[2] + (to[2] - from[2]) * t];
}

/**
 * A runtime Controller whose approach is the Microduck body's real pose: the
 * trained policy walks the fixture lane in MuJoCo, and docking/operation start
 * only once the body has actually arrived. Reported poses respect the
 * runtime's bounds (walkway, step size, exact dock). Without a running physics
 * body it is the authored reference controller.
 */
export function createLinkedController(): Controller {
  const state: Record<BotId, { last: number; reported: Position; dockedAt: number | null; progress: number; from: number }> = {
    pip: { last: Infinity, reported: [0, 0, 0], dockedAt: null, progress: 0, from: 1 },
    nova: { last: Infinity, reported: [0, 0, 0], dockedAt: null, progress: 0, from: 1 },
  };
  return (elapsedMs, start, botId): ControllerFrame => {
    const s = state[botId];
    if (elapsedMs <= s.last) {
      // A new action: the runtime restarts its clock for every request.
      s.reported = [start[0], 0, start[2]];
      s.dockedAt = null;
      s.progress = 0;
      s.from = Math.max(1e-6, distance(start, fixture.bots[botId].waypoint) + distance(fixture.bots[botId].waypoint, fixture.bots[botId].dock));
      link.leg[botId] = 0;
    }
    s.last = elapsedMs;
    const body = link.pose[botId];
    const dock = fixture.bots[botId].dock;
    if (!link.ready || !body) return referenceController(elapsedMs, start, botId);

    if (s.dockedAt === null) {
      const w = fixture.walkway;
      const arrived =
        link.leg[botId] === 1 && Math.hypot(body.x - dock[0], body.z - dock[2]) < DOCK_RADIUS && Math.abs(wrap(body.heading - Math.PI)) < DOCK_HEADING;
      const goal: Position = arrived ? [dock[0], 0, dock[2]] : [clamp(body.x, w.minX, w.maxX), 0, clamp(body.z, w.minZ, w.maxZ)];
      s.reported = toward(s.reported, goal, MAX_STEP);
      const remaining = link.leg[botId] === 0 ? distance(s.reported, fixture.bots[botId].waypoint) + distance(fixture.bots[botId].waypoint, dock) : distance(s.reported, dock);
      s.progress = Math.max(s.progress, 0.7 * clamp(1 - remaining / s.from, 0, 1));
      if (arrived && distance(s.reported, dock) < 1e-9) {
        s.dockedAt = elapsedMs;
        return { position: [dock[0], 0, dock[2]], headingRad: Math.PI, phase: "dock", progress: s.progress };
      }
      return { position: s.reported, headingRad: body.heading, phase: "approach", progress: s.progress };
    }
    const t = elapsedMs - s.dockedAt;
    const span = fixture.dockMilliseconds + fixture.operateMilliseconds;
    s.progress = Math.max(s.progress, 0.7 + 0.3 * clamp(t / span, 0, 1));
    return {
      position: [dock[0], 0, dock[2]],
      headingRad: Math.PI,
      phase: t < fixture.dockMilliseconds ? "dock" : t < span ? "operate" : "done",
      progress: t < span ? Math.min(s.progress, 0.999) : 1,
    };
  };
}
