import { BALANCE_FIXTURE as fixture, type BotId, type Position } from "@kestrel/contracts";
import { distance, referenceController, type Controller, type ControllerFrame } from "../simulation/controller.js";
import { link } from "./link.js";

// The runtime's per-step movement bound (0.8 m/s × 50 ms), less a margin.
const MAX_STEP = (fixture.speedMetersPerSecond * 50) / 1000 - 1e-4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function toward(from: Position, to: Position, max: number): Position {
  const d = distance(from, to);
  if (d <= max) return [to[0], 0, to[2]];
  const t = max / d;
  return [from[0] + (to[0] - from[0]) * t, 0, from[2] + (to[2] - from[2]) * t];
}

/**
 * A runtime Controller driven by the Microduck push: the trained policy walks a
 * body to the carriage and pushes it with its body in MuJoCo, and the runtime's
 * phases follow that push. Docking starts when the push starts, the operation
 * ends when the carriage has reached its notch, and a push the body cannot do
 * fails the action with the bot's reason. The runtime's bot pose is its fixture
 * abstraction (it eases to the dock within the runtime's bounds); the rendered
 * body is MuJoCo's. The mode is chosen when an action starts: without a running
 * physics body the whole action uses the authored reference controller.
 */
export function createLinkedController(): Controller {
  type S = { last: number; linked: boolean; reported: Position; dockedAt: number | null; progress: number; from: number };
  const fresh = (): S => ({ last: Infinity, linked: false, reported: [0, 0, 0], dockedAt: null, progress: 0, from: 1 });
  const state: Record<BotId, S> = { pip: fresh(), nova: fresh() };
  return (elapsedMs, start, botId): ControllerFrame => {
    let s = state[botId];
    if (elapsedMs <= s.last) {
      // A new action: the runtime restarts its clock for every request.
      s = state[botId] = { ...fresh(), linked: link.ready, reported: [start[0], 0, start[2]], from: Math.max(1e-6, distance(start, fixture.bots[botId].dock)) };
    }
    s.last = elapsedMs;
    const frame = s.linked ? linked(s, elapsedMs, botId) : referenceController(elapsedMs, start, botId);
    s.reported = [frame.position[0], 0, frame.position[2]];
    return frame;
  };

  function linked(s: { reported: Position; dockedAt: number | null; progress: number; from: number }, elapsedMs: number, botId: BotId): ControllerFrame {
    const dock = fixture.bots[botId].dock;
    const push = link.push[botId];
    if (push?.phase === "failed") throw new Error(push.reason ?? "The push could not be done.");
    const pushing = push && (push.phase === "push" || push.phase === "release" || push.phase === "done");
    if (s.dockedAt === null) {
      const position = toward(s.reported, [dock[0], 0, dock[2]], MAX_STEP);
      s.progress = Math.max(s.progress, 0.3 * clamp(1 - distance(position, dock) / s.from, 0, 1));
      if (pushing && distance(position, dock) < 1e-9) {
        s.dockedAt = elapsedMs;
        return { position, headingRad: Math.PI, phase: "dock", progress: s.progress };
      }
      return { position, headingRad: Math.PI, phase: "approach", progress: s.progress };
    }
    const t = elapsedMs - s.dockedAt;
    const position: Position = [dock[0], 0, dock[2]];
    if (t < fixture.dockMilliseconds) return { position, headingRad: Math.PI, phase: "dock", progress: s.progress };
    const done = push?.phase === "done" && t >= fixture.dockMilliseconds + fixture.operateMilliseconds;
    if (!done) {
      s.progress = Math.max(s.progress, 0.3 + 0.69 * clamp(push?.progress ?? 0, 0, 1));
      return { position, headingRad: Math.PI, phase: "operate", progress: s.progress };
    }
    return { position, headingRad: Math.PI, phase: "done", progress: 1 };
  }
}
