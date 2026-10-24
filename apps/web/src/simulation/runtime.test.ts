import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ActionRequest, type SimulationEvent } from "@kestrel/contracts";
import * as runtime from "./runtime.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const request = (changes: Partial<ActionRequest> = {}): ActionRequest => ({
  requestId: "r1",
  botId: "pip",
  worldRevision: 0,
  resetGeneration: 0,
  action: "move-weight",
  stationId: "balance",
  objectId: "right-weight",
  parameters: { positionCm: 40 },
  ...changes,
});
const finish = () => vi.advanceTimersByTime(10000);

it("executes approach, docking and operation before publishing measured completion", () => {
  expect(runtime.createSimulation).toBeTypeOf("function");
  const sim = runtime.createSimulation();
  const events: SimulationEvent[] = [];
  sim.subscribe((e) => events.push(e));
  expect(sim.submit(request()).accepted).toBe(true);
  expect(sim.getSnapshot().world.rightCm).toBe(20);
  vi.advanceTimersByTime(500);
  expect(sim.getSnapshot().bots.pip.position).not.toEqual([-1.2, 0, 1.2]);
  expect(sim.getSnapshot().world.rightCm).toBe(20);
  finish();
  const s = sim.getSnapshot();
  expect(s.world).toMatchObject({ rightCm: 40, version: 1 });
  expect(s.worldRevision).toBe(1);
  expect(s.lastAction).toMatchObject({
    status: "completed",
    request: { botId: "pip" },
    result: {
      leftGramCentimeters: 4000,
      rightGramCentimeters: 4000,
      balance: "balanced",
    },
  });
  expect(s.lastAction!.result!.leftNewtonMeters).toBeCloseTo(0.3924);
  expect(s.ownership).toBeNull();
  expect(s.activeAction).toBeNull();
  expect(s.bots.pip.position).toEqual([-0.65, 0, 0.8]);
  expect(s.bots.nova.position).toEqual([1.25, 0, 1.4]);
  const actions = events
    .filter((e) => e.type === "action")
    .map((e) => e.action!.status);
  expect(actions).toEqual(["received", "validated", "started", "completed"]);
  const phases = [
    ...new Set(
      events.map((e) => e.snapshot.activeAction?.phase).filter(Boolean),
    ),
  ];
  expect(phases).toEqual(["approach", "dock", "operate"]);
  expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1));
});

it("rejects malformed, stale and competing requests without perturbing accepted work", () => {
  const sim = runtime.createSimulation();
  for (const input of [
    null,
    {},
    request({ parameters: { positionCm: NaN } }),
    request({ parameters: { positionCm: 99 } }),
  ])
    expect(sim.submit(input)).toMatchObject({
      accepted: false,
      error: { code: "INVALID_REQUEST" },
    });
  expect(sim.submit(request({ worldRevision: 1 }))).toMatchObject({
    accepted: false,
    error: { code: "STALE_WORLD" },
  });
  sim.submit(request());
  expect(
    sim.submit(
      request({ requestId: "r2", botId: "nova", objectId: "left-weight" }),
    ),
  ).toMatchObject({ accepted: false, error: { code: "BUSY" } });
  finish();
  expect(sim.getSnapshot().world.rightCm).toBe(40);
  expect(sim.submit(request({ requestId: "r3" }))).toMatchObject({
    accepted: false,
    error: { code: "STALE_WORLD" },
  });
  expect(
    sim.submit(request({ requestId: "r4", botId: "nova", worldRevision: 1 }))
      .accepted,
  ).toBe(true);
  finish();
  expect(sim.getSnapshot().worldRevision).toBe(2);
});

it("copies and freezes requests/snapshots and deduplicates before revision checks", () => {
  const sim = runtime.createSimulation();
  const input = request();
  sim.submit(input);
  input.botId = "nova";
  input.parameters.positionCm = 10;
  expect(sim.submit(request())).toMatchObject({
    accepted: true,
    duplicate: true,
  });
  expect(sim.submit(input)).toMatchObject({
    accepted: false,
    error: { code: "REQUEST_ID_CONFLICT" },
  });
  expect(() => {
    (sim.getSnapshot().world as { rightCm: number }).rightCm = 3;
  }).toThrow();
  finish();
  expect(sim.getSnapshot().lastAction!.request.botId).toBe("pip");
  expect(sim.getSnapshot().world.rightCm).toBe(40);
  expect(sim.submit(request())).toMatchObject({
    accepted: true,
    duplicate: true,
    action: { status: "completed" },
  });
  sim.reset();
  expect(sim.submit(request())).toMatchObject({
    accepted: true,
    duplicate: true,
    action: { status: "completed" },
  });
  finish();
  expect(sim.getSnapshot().world.rightCm).toBe(20);
});

it.each(["stop", "reset"] as const)(
  "%s cancels midway, releases ownership and fences even delivered callbacks",
  (operation) => {
    const callbacks: (() => void)[] = [];
    const sim = runtime.createSimulation({
      scheduler: {
        setTimeout: (cb) => {
          callbacks.push(cb);
          return callbacks.length;
        },
        clearTimeout: () => {},
      },
    });
    sim.submit(request());
    callbacks[0]();
    const late = callbacks[1];
    sim[operation]();
    expect(sim.getSnapshot().ownership).toBeNull();
    expect(sim.getSnapshot().activeAction).toBeNull();
    late();
    late();
    expect(sim.getSnapshot().world.rightCm).toBe(20);
    const s = sim.getSnapshot();
    expect(s.resetGeneration).toBe(operation === "reset" ? 1 : 0);
    expect(
      sim.submit(
        request({
          requestId: "new",
          botId: "nova",
          worldRevision: s.worldRevision,
          resetGeneration: s.resetGeneration,
        }),
      ).accepted,
    ).toBe(true);
    late();
    expect(sim.getSnapshot().activeAction!.request.botId).toBe("nova");
    expect(sim.getSnapshot().world.rightCm).toBe(20);
  },
);

it("releases resources when the replaceable controller fails", () => {
  const sim = runtime.createSimulation({
    controller: () => {
      throw new Error("motor unavailable");
    },
  });
  sim.submit(request());
  finish();
  expect(sim.getSnapshot().lastAction).toMatchObject({
    status: "failed",
    error: { code: "CONTROLLER_FAILED" },
  });
  expect(sim.getSnapshot().ownership).toBeNull();
  expect(sim.getSnapshot().world.rightCm).toBe(20);
  expect(
    sim.submit(request({ requestId: "retry", botId: "nova" })).accepted,
  ).toBe(true);
});

it("isolates observer errors and permits Stop from an observer without reentrant submission", () => {
  const sim = runtime.createSimulation();
  let nested: unknown;
  sim.subscribe(() => {
    throw new Error("broken view");
  });
  sim.subscribe((e) => {
    if (e.action?.status === "started") {
      nested = sim.submit(request({ requestId: "nested" }));
      sim.stop();
    }
  });
  sim.submit(request());
  finish();
  expect(nested).toMatchObject({
    accepted: false,
    error: { code: "REENTRANT_CALL" },
  });
  expect(sim.getSnapshot().lastAction!.status).toBe("cancelled");
  expect(sim.getSnapshot().world.rightCm).toBe(20);
  expect(sim.getSnapshot().ownership).toBeNull();
});

it.each(["stop", "reset"] as const)(
  "%s during operation prevents the final measurement commit",
  (operation) => {
    const sim = runtime.createSimulation();
    sim.submit(request());
    vi.advanceTimersByTime(2000);
    expect(sim.getSnapshot().activeAction?.phase).toBe("operate");
    sim[operation]();
    finish();
    expect(sim.getSnapshot().world.rightCm).toBe(20);
    expect(sim.getSnapshot().ownership).toBeNull();
  },
);

it("does not advance twice when a scheduled callback is delivered twice", () => {
  const callbacks: (() => void)[] = [];
  const sim = runtime.createSimulation({
    scheduler: {
      setTimeout: (cb) => callbacks.push(cb),
      clearTimeout: () => {},
    },
  });
  sim.submit(request());
  callbacks[0]();
  const before = sim.getSnapshot();
  callbacks[0]();
  expect(sim.getSnapshot()).toBe(before);
  sim.stop();
});

it("refuses controller teleportation without mutating science", () => {
  const sim = runtime.createSimulation({
    controller: () => ({
      position: [-0.65, 0, 0.8],
      headingRad: Math.PI,
      phase: "done",
      progress: 1,
    }),
  });
  sim.submit(request());
  finish();
  expect(sim.getSnapshot().lastAction?.status).toBe("failed");
  expect(sim.getSnapshot().world.rightCm).toBe(20);
  expect(sim.getSnapshot().ownership).toBeNull();
});

it("rejects skipping the docking prerequisite even when a controller reports valid coordinates", () => {
  const sim = runtime.createSimulation({
    controller: (_elapsed, start) => ({
      position: start,
      headingRad: 0,
      phase: "operate",
      progress: 0.5,
    }),
  });
  sim.submit(request());
  vi.advanceTimersByTime(50);
  expect(sim.getSnapshot().lastAction?.status).toBe("failed");
  expect(sim.getSnapshot().ownership).toBeNull();
  expect(sim.getSnapshot().worldRevision).toBe(0);
});

it("bounds stalled controller work and releases the station", () => {
  const sim = runtime.createSimulation({
    controller: (_elapsed, start) => ({
      position: start,
      headingRad: 0,
      phase: "approach",
      progress: 0,
    }),
  });
  sim.submit(request());
  vi.advanceTimersByTime(30100);
  expect(sim.getSnapshot().lastAction).toMatchObject({
    status: "failed",
    error: { code: "CONTROLLER_FAILED" },
  });
  expect(sim.getSnapshot().ownership).toBeNull();
});

it("reports scheduler startup failure as a failed accepted action", () => {
  const sim = runtime.createSimulation({
    scheduler: {
      setTimeout: () => {
        throw new Error("unavailable");
      },
      clearTimeout: () => {},
    },
  });
  expect(sim.submit(request())).toMatchObject({
    accepted: true,
    action: { status: "failed" },
  });
  expect(sim.getSnapshot().ownership).toBeNull();
  expect(sim.getSnapshot().world.rightCm).toBe(20);
});

it.each(["return", "throw"])(
  "fences a controller %s if reset occurs while that controller is being sampled",
  (outcome) => {
    let once = true;
    const sim = runtime.createSimulation({
      controller: (_elapsed, start) => {
        if (once) {
          once = false;
          sim.reset();
          sim.submit(
            request({
              requestId: "after-reset",
              botId: "nova",
              worldRevision: 1,
              resetGeneration: 1,
            }),
          );
          if (outcome === "throw")
            throw new Error("obsolete controller failure");
        }
        return {
          position: start,
          headingRad: 0,
          phase: "approach",
          progress: 0,
        };
      },
    });
    sim.submit(request());
    vi.advanceTimersByTime(50);
    expect(sim.getSnapshot().activeAction?.request.requestId).toBe(
      "after-reset",
    );
    expect(sim.getSnapshot().bots.pip.status).toBe("idle");
    expect(sim.getSnapshot().worldRevision).toBe(1);
    sim.stop();
  },
);

it("produces identical events and state for the same commands and controlled clock", () => {
  function run() {
    const sim = runtime.createSimulation();
    const events: SimulationEvent[] = [];
    sim.subscribe((e) => events.push(e));
    sim.submit(request());
    finish();
    sim.reset();
    return events;
  }
  expect(run()).toEqual(run());
});
