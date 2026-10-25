// SimAdapter over the real two-robot DuckSim (MuJoCo Microducks on the
// Moments balance). A task is a physical push by the robot that owns the
// weight, so apply settles when DuckSim reports the push done, failed or
// stopped. Snapshots are measured rail positions, never commanded targets.
import {
  BOT_NAMES,
  MOMENTS,
  type BotId,
  type DuckTask,
  type MomentsWeight,
  type World,
} from "@kestrel/contracts";
import type { BalanceView } from "../tasks";
import type { SimEvent } from "../duckSim";
import type {
  ApplyResult,
  ProposeResult,
  SimAdapter,
  SimObject,
  SimTask,
} from "../types.js";

/** The part of DuckSim this adapter drives. A DuckSim instance fits it as is. */
export type DuckLab = {
  status(): { balance: BalanceView | null };
  runTask(task: DuckTask, id?: BotId): string | null;
  reset(reason?: string): void;
  robot(id: BotId): { tasks: { cancel(): void } };
};
export type LabEvents = (listener: (e: SimEvent) => void) => () => void;
type Outcome = { ok: boolean; summary: string };

/** How often measured rail positions are read while nothing reports in. */
const POLL_MS = 100;
const WEIGHTS: Record<SimObject, MomentsWeight> = {
  "left-weight": MOMENTS.weights.find((w) => w.side === "left")!,
  "right-weight": MOMENTS.weights.find((w) => w.side === "right")!,
};

export const createDuckSimAdapter = (
  lab: DuckLab,
  events: LabEvents,
): SimAdapter & { dispose(): void } => {
  const locks = new Map<SimObject, string>();
  /** Pushes in flight, by the DuckSim task each one started. */
  const pushes = new Map<
    DuckTask,
    { id: string; settle: (r: Outcome) => void; stop: () => void }
  >();
  const listeners = new Set<(w: World) => void>();
  const notify = () => listeners.forEach((fn) => fn(world));

  /** Measured cm from the pivot, to the millimetre. */
  const measuredCm = (w: MomentsWeight): number => {
    const at = lab.status().balance?.rails.get(w.id);
    if (at === undefined) throw new Error(`${w.label} is not on the balance.`);
    return Math.round(Math.abs(at) * 1000) / 10;
  };
  const measure = (version: number): World => ({
    version,
    leftCm: measuredCm(WEIGHTS["left-weight"]),
    rightCm: measuredCm(WEIGHTS["right-weight"]),
    leftGrams: WEIGHTS["left-weight"].grams,
    rightGrams: WEIGHTS["right-weight"].grams,
  });
  let world = measure(0);

  /** Publishes a new version when the measured world moved (or always, if `bump`). */
  const refresh = (bump = false) => {
    const now = measure(world.version + 1);
    if (!bump && now.leftCm === world.leftCm && now.rightCm === world.rightCm)
      return;
    world = now;
    notify();
  };
  const poll = setInterval(refresh, POLL_MS);
  const off = events((e) => {
    if (e.type === "task-done") pushes.get(e.task)?.settle(e);
    // A lab reset has already cancelled every robot's task.
    if (e.type === "reset")
      for (const p of [...pushes.values()])
        p.settle({ ok: false, summary: `${e.reason}.` });
    if (e.type === "task-done" || e.type === "reset") refresh();
  });

  return {
    snapshot: () => world,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    propose(task: SimTask): ProposeResult {
      if (
        !Number.isFinite(task.cm) ||
        task.cm < MOMENTS.minCm ||
        task.cm > MOMENTS.maxCm
      )
        return {
          ok: false,
          reason: "invalid",
          summary: `The rails run from ${MOMENTS.minCm} to ${MOMENTS.maxCm} cm from the pivot.`,
        };
      const holder = locks.get(task.object);
      if (holder !== undefined && holder !== task.id)
        return { ok: false, reason: "locked" };
      locks.set(task.object, task.id);
      return { ok: true, task, baseVersion: world.version };
    },
    async apply(
      task: SimTask,
      version: number,
      signal?: AbortSignal,
    ): Promise<ApplyResult> {
      // Version first: a reset frees locks, and the caller must still see "stale".
      if (version !== world.version) return { ok: false, reason: "stale" };
      if (locks.get(task.object) !== task.id)
        return { ok: false, reason: "not-proposed" };
      const weight = WEIGHTS[task.object];
      const where = () => `The ${weight.label} is at ${measuredCm(weight)} cm.`;
      const fail = (summary: string): ApplyResult => {
        locks.delete(task.object);
        return { ok: false, reason: "failed", summary };
      };
      if (signal?.aborted) return fail(`Stopped. ${where()}`);
      const push: DuckTask = {
        kind: "place_weight",
        target: weight.id,
        cm: task.cm,
      };
      const refusal = lab.runTask(push, weight.owner);
      if (refusal) return fail(refusal);
      // Each weight has one robot that moves it; say so when another bot asked.
      const mover =
        weight.owner === task.owner
          ? ""
          : `${BOT_NAMES[weight.owner]} works the ${weight.side} rail. `;
      return new Promise<ApplyResult>((resolve) => {
        const settle = ({ ok, summary }: Outcome) => {
          pushes.delete(push);
          signal?.removeEventListener("abort", stop);
          locks.delete(task.object);
          // A landed push is a new world even if the weight was already there.
          refresh(ok);
          summary = mover + summary;
          resolve(
            ok ? { ok, world, summary } : { ok, reason: "failed", summary },
          );
        };
        // The clamp holds the weight wherever the robot left it; nothing moves it back.
        const stop = () => {
          lab.robot(weight.owner).tasks.cancel();
          settle({ ok: false, summary: `Stopped. ${where()}` });
        };
        pushes.set(push, { id: task.id, settle, stop });
        signal?.addEventListener("abort", stop, { once: true });
      });
    },
    release(task: SimTask) {
      const inFlight = [...pushes.values()].find((p) => p.id === task.id);
      if (inFlight) inFlight.stop();
      else if (locks.get(task.object) === task.id) locks.delete(task.object);
    },
    reset() {
      locks.clear();
      lab.reset("Lab reset");
      refresh(true);
      return world;
    },
    dispose() {
      clearInterval(poll);
      off();
    },
  };
};
