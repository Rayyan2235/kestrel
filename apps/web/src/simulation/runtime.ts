import {
  ActionRequestSchema,
  BALANCE_FIXTURE,
  applyWeight,
  balance,
  createSimulationSnapshot,
  type ActionError,
  type ActionRecord,
  type ActionSubmission,
  type SimulationAdapter,
  type SimulationEvent,
  type SimulationSnapshot,
  type SupportedAction,
} from "@kestrel/contracts";
import {
  distance,
  referenceController,
  type Controller,
  type ControllerFrame,
} from "./controller.js";

export interface Scheduler {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}
const defaultScheduler: Scheduler = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const STEP_MS = 50;
const MAX_REQUESTS = 1000;
const supported: readonly SupportedAction[] = freeze([
  {
    action: "move-weight",
    stationId: "balance",
    objectIds: ["left-weight", "right-weight"],
    botIds: ["pip", "nova"],
    parameters: { positionCm: { unit: "cm", min: 5, max: 45 } },
    controller: "game-controlled",
  },
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createSimulation(
  options: { scheduler?: Scheduler; controller?: Controller } = {},
): SimulationAdapter {
  const scheduler = options.scheduler ?? defaultScheduler;
  const controller = options.controller ?? referenceController;
  let snapshot: SimulationSnapshot = freeze({
    ...createSimulationSnapshot(),
    mode: "game-controlled",
  });
  const records = new Map<
    string,
    { fingerprint: string; action: ActionRecord }
  >();
  const listeners = new Set<(event: SimulationEvent) => void>();
  const pending: SimulationEvent[] = [];
  let sequence = 0,
    fence = 0,
    notifying = false;
  let timer: unknown;

  function publish(type: SimulationEvent["type"], action?: ActionRecord) {
    pending.push(
      freeze({
        sequence: ++sequence,
        type,
        snapshot,
        ...(action ? { action } : {}),
      }),
    );
  }
  function flush() {
    if (notifying) return;
    notifying = true;
    try {
      while (pending.length) {
        const event = pending.shift()!;
        for (const listener of [...listeners]) {
          // A broken renderer must not interrupt authoritative execution or other subscribers.
          try {
            listener(event);
          } catch {
            /* subscriber owns its error reporting */
          }
        }
      }
    } finally {
      notifying = false;
    }
  }
  function update(patch: Partial<SimulationSnapshot>) {
    snapshot = freeze({ ...snapshot, ...patch });
  }
  function setAction(action: ActionRecord) {
    action = freeze(action);
    const record = records.get(action.request.requestId)!;
    record.action = action;
    update({ activeAction: action });
  }
  function cancelTimer() {
    fence++;
    if (timer !== undefined) {
      try {
        scheduler.clearTimeout(timer);
      } catch {
        /* fence remains authoritative */
      }
      timer = undefined;
    }
  }
  function terminal(
    status: "completed" | "failed" | "cancelled",
    error?: ActionError,
  ) {
    const current = snapshot.activeAction;
    if (!current) return;
    cancelTimer();
    const id = current.request.botId;
    const world = snapshot.world;
    const left = world.leftGrams * world.leftCm,
      right = world.rightGrams * world.rightCm;
    const action: ActionRecord = freeze({
      ...current,
      status,
      phase: "done",
      progress: status === "completed" ? 1 : current.progress,
      ...(error ? { error } : {}),
      ...(status === "completed"
        ? {
            result: {
              leftGramCentimeters: left,
              rightGramCentimeters: right,
              leftNewtonMeters: left * 0.0000981,
              rightNewtonMeters: right * 0.0000981,
              balance: balance(world),
            },
          }
        : {}),
    });
    records.get(current.request.requestId)!.action = action;
    update({
      activeAction: null,
      lastAction: action,
      ownership: null,
      bots: {
        ...snapshot.bots,
        [id]: { ...snapshot.bots[id], status: "idle" },
      },
    });
    publish("action", action);
  }
  function reject(
    code: ActionError["code"],
    message: string,
  ): ActionSubmission {
    return freeze({ accepted: false, error: { code, message } });
  }
  function execute() {
    const initial = snapshot.activeAction!;
    const botId = initial.request.botId;
    const start = snapshot.bots[botId].position;
    const runFence = ++fence;
    let step = 0,
      phaseStartedAt = 0;
    function schedule() {
      const expectedStep = step;
      timer = scheduler.setTimeout(() => {
        // Fence cancelled, reset, duplicate, and obsolete callbacks independently.
        if (
          fence !== runFence ||
          step !== expectedStep ||
          !snapshot.activeAction
        )
          return;
        timer = undefined;
        step++;
        try {
          const elapsed = step * STEP_MS;
          if (elapsed > 30000) throw new Error("controller timed out");
          const frame = controller(elapsed, start, botId);
          if (fence !== runFence) return;
          validateFrame(frame);
          const current = snapshot.activeAction;
          if (frame.progress < current.progress)
            throw new Error("controller progress regressed");
          const phases = ["approach", "dock", "operate", "done"];
          const phaseDelta =
            phases.indexOf(frame.phase) - phases.indexOf(current.phase);
          if (phaseDelta < 0 || phaseDelta > 1)
            throw new Error("controller skipped a prerequisite");
          if (
            frame.phase !== "approach" &&
            distance(frame.position, BALANCE_FIXTURE.bots[botId].dock) > 1e-6
          )
            throw new Error("controller is not docked at the station");
          if (phaseDelta === 1) {
            const minimum =
              current.phase === "dock"
                ? BALANCE_FIXTURE.dockMilliseconds
                : current.phase === "operate"
                  ? BALANCE_FIXTURE.operateMilliseconds
                  : 0;
            if (elapsed - phaseStartedAt < minimum)
              throw new Error("controller finished a phase too early");
            phaseStartedAt = elapsed;
          }
          const bot = snapshot.bots[botId];
          if (
            distance(bot.position, frame.position) >
            (BALANCE_FIXTURE.speedMetersPerSecond * STEP_MS) / 1000 + 1e-6
          )
            throw new Error("controller exceeded movement bound");
          if (frame.phase === "done") {
            if (
              current.phase !== "operate" ||
              distance(frame.position, BALANCE_FIXTURE.bots[botId].dock) > 1e-6
            )
              throw new Error("operation did not complete at the station");
            const req = current.request;
            if (
              req.worldRevision !== snapshot.worldRevision ||
              req.resetGeneration !== snapshot.resetGeneration
            )
              throw new Error("world changed during operation");
            const world = applyWeight(
              snapshot.world,
              req.objectId === "left-weight" ? "left" : "right",
              req.parameters.positionCm,
              snapshot.worldRevision,
            );
            update({
              world: { ...world, version: snapshot.worldRevision + 1 },
              worldRevision: snapshot.worldRevision + 1,
              bots: {
                ...snapshot.bots,
                [botId]: {
                  ...bot,
                  position: frame.position,
                  headingRad: frame.headingRad,
                },
              },
            });
            terminal("completed");
          } else {
            setAction({
              ...current,
              phase: frame.phase,
              progress: frame.progress,
            });
            update({
              bots: {
                ...snapshot.bots,
                [botId]: {
                  ...bot,
                  position: [...frame.position],
                  headingRad: frame.headingRad,
                  status:
                    frame.phase === "approach"
                      ? "approaching"
                      : frame.phase === "dock"
                        ? "docking"
                        : "operating",
                },
              },
            });
            publish("snapshot");
            schedule();
          }
        } catch {
          if (fence !== runFence) return;
          terminal("failed", {
            code: "CONTROLLER_FAILED",
            message:
              "The game-controlled station action could not finish. Try again.",
          });
        }
        flush();
      }, STEP_MS);
    }
    try {
      schedule();
    } catch {
      terminal("failed", {
        code: "CONTROLLER_FAILED",
        message: "The action clock could not start.",
      });
    }
  }
  return {
    getSupportedActions: () => supported,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    submit(input) {
      if (notifying)
        return reject("REENTRANT_CALL", "Submit outside an event callback.");
      const parsed = ActionRequestSchema.safeParse(input);
      if (!parsed.success)
        return reject(
          "INVALID_REQUEST",
          "Use a supported bot, station, weight and position from 5 to 45 cm.",
        );
      const request = freeze(parsed.data);
      const fingerprint = JSON.stringify(request);
      const previous = records.get(request.requestId);
      if (previous)
        return previous.fingerprint === fingerprint
          ? freeze({ accepted: true, duplicate: true, action: previous.action })
          : reject(
              "REQUEST_ID_CONFLICT",
              "This request ID already names a different action.",
            );
      if (
        request.worldRevision !== snapshot.worldRevision ||
        request.resetGeneration !== snapshot.resetGeneration
      )
        return reject(
          "STALE_WORLD",
          "The world changed. Read a fresh snapshot before requesting an action.",
        );
      if (snapshot.ownership)
        return reject(
          "BUSY",
          "The balance station is in use. Wait for completion or Stop it.",
        );
      if (records.size >= MAX_REQUESTS)
        return reject(
          "CAPACITY",
          "This local session has reached its action limit. Start a new session.",
        );
      const action: ActionRecord = freeze({
        request,
        status: "received",
        phase: "approach",
        progress: 0,
      });
      records.set(request.requestId, { fingerprint, action });
      update({
        activeAction: action,
        ownership: {
          stationId: request.stationId,
          objectId: request.objectId,
          botId: request.botId,
          requestId: request.requestId,
        },
      });
      publish("action", action);
      setAction({ ...action, status: "validated" });
      publish("action", snapshot.activeAction!);
      setAction({ ...action, status: "started" });
      update({
        bots: {
          ...snapshot.bots,
          [request.botId]: {
            ...snapshot.bots[request.botId],
            status: "approaching",
          },
        },
      });
      publish("action", snapshot.activeAction!);
      execute();
      flush();
      return freeze({
        accepted: true,
        duplicate: false,
        action: records.get(request.requestId)!.action,
      });
    },
    stop() {
      if (snapshot.activeAction)
        terminal("cancelled", {
          code: "STOPPED",
          message: "Stopped by the learner.",
        });
      else cancelTimer();
      flush();
    },
    reset() {
      if (snapshot.activeAction)
        terminal("cancelled", {
          code: "RESET",
          message: "Cancelled by reset.",
        });
      else cancelTimer();
      const initial = createSimulationSnapshot();
      const revision = snapshot.worldRevision + 1;
      update({
        ...initial,
        mode: "game-controlled",
        worldRevision: revision,
        resetGeneration: snapshot.resetGeneration + 1,
        world: { ...initial.world, version: revision },
      });
      publish("snapshot");
      flush();
    },
  };
}

function validateFrame(frame: ControllerFrame) {
  const { minX, maxX, minZ, maxZ } = BALANCE_FIXTURE.walkway;
  const p = frame.position;
  if (
    !Array.isArray(p) ||
    p.length !== 3 ||
    !p.every(Number.isFinite) ||
    p[1] !== 0 ||
    p[0] < minX ||
    p[0] > maxX ||
    p[2] < minZ ||
    p[2] > maxZ ||
    !Number.isFinite(frame.headingRad) ||
    !Number.isFinite(frame.progress) ||
    frame.progress < 0 ||
    frame.progress > 1 ||
    !["approach", "dock", "operate", "done"].includes(frame.phase)
  )
    throw new Error("invalid controller frame");
}
