// TEMPORARY: stub simulation over the analytic balance world.
// Replaced by an adapter over the real simulation when it lands; nothing
// above SimAdapter may depend on this file.
import {
  applyWeight,
  createWorld,
  resetWorld,
  type World,
} from "@kestrel/contracts";
import type {
  ApplyResult,
  ProposeResult,
  SimAdapter,
  SimObject,
  SimTask,
} from "../types.js";

const MIN_CM = 5;
const MAX_CM = 45;

export const createFakeSim = (): SimAdapter => {
  let world: World = createWorld();
  const locks = new Map<SimObject, string>();
  const listeners = new Set<(w: World) => void>();
  const notify = () => listeners.forEach((fn) => fn(world));

  return {
    snapshot: () => world,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    propose(task: SimTask): ProposeResult {
      if (!Number.isFinite(task.cm) || task.cm < MIN_CM || task.cm > MAX_CM)
        return { ok: false, reason: "invalid" };
      const holder = locks.get(task.object);
      if (holder !== undefined && holder !== task.id)
        return { ok: false, reason: "locked" };
      locks.set(task.object, task.id);
      return { ok: true, task, baseVersion: world.version };
    },
    async apply(task: SimTask, version: number): Promise<ApplyResult> {
      // Version first: a reset frees locks, and the caller must still see "stale".
      if (version !== world.version) return { ok: false, reason: "stale" };
      if (locks.get(task.object) !== task.id)
        return { ok: false, reason: "not-proposed" };
      locks.delete(task.object);
      world = applyWeight(
        world,
        task.object === "left-weight" ? "left" : "right",
        task.cm,
        version,
      );
      notify();
      return { ok: true, world };
    },
    release(task: SimTask) {
      if (locks.get(task.object) === task.id) locks.delete(task.object);
    },
    reset() {
      locks.clear();
      world = resetWorld(world);
      notify();
      return world;
    },
  };
};
