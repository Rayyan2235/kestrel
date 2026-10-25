import { describe, expect, it } from "vitest";
import { MOMENTS, momentsKit, pythagorasKit, roomProps, type Vec2 } from "@kestrel/contracts";
import { SCREEN_DIRS } from "./constants";
import { TaskRunner, routeAround, type BalanceView, type WorldView } from "./tasks";

const kit = (() => {
  const k = pythagorasKit();
  return { ...k, props: [...roomProps(), ...k.props] };
})();

function world(duck = { x: 0, y: 0, yaw: 0 }, moved: Record<string, Vec2> = {}): WorldView {
  const props = new Map<string, Vec2>(kit.props.map((p) => [p.id, [p.pos[0], p.pos[1]]]));
  for (const [id, xy] of Object.entries(moved)) props.set(id, xy);
  return { id: "pip", duck, speed: 0, others: [], props, kit, touching: new Map() };
}

describe("task runner", () => {
  it("pushes right as seen on screen, whatever way the duck faces", () => {
    const r = new TaskRunner();
    const start = world({ x: 0, y: 0, yaw: Math.PI / 2 });
    const p = start.props.get("square-3")!;
    const [rx, ry] = SCREEN_DIRS.right;
    expect(r.start({ kind: "push", target: "square-3", direction: "right", meters: 0.2 }, start)).toBeNull();
    expect(r.step(start, 0.02)?.done).toBeUndefined();
    // Moving along the duck's own right (−x when facing +y) does not count.
    expect(r.step(world({ x: 0, y: 0, yaw: Math.PI / 2 }, { "square-3": [p[0] + 0.19, p[1]] }), 0.02)?.done).toBeUndefined();
    const atTarget = world({ x: -0.8, y: 0.5, yaw: 0 }, { "square-3": [p[0] + rx * 0.19, p[1] + ry * 0.19] });
    expect(r.step(atTarget, 0.02)?.done).toBeUndefined();
    let result;
    for (let i = 0; i < 40 && !result?.done; i++) result = r.step(atTarget, 0.02) ?? undefined;
    expect(result?.done?.ok).toBe(true);
    expect(r.start({ kind: "push", target: "square-3", direction: "right", toward: "slot" }, start)).toMatch(/direction or a destination/);
  });
  it("refuses targets that are missing or fixed before moving", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "go_to", target: "unicorn" }, world())).toMatch(/no unicorn/);
    const moments = momentsKit();
    const balance: WorldView = {
      ...world(),
      kit: moments,
      props: new Map(moments.props.map((p) => [p.id, [p.pos[0], p.pos[1]] as Vec2])),
    };
    expect(r.start({ kind: "push", target: "pivot" }, balance)).toMatch(/fixed/);
    expect(r.active).toBeNull();
  });

  it("finishes a push from the measured prop position, not from its own plan", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "push", target: "square-3", toward: "slot" }, world())).toBeNull();
    const first = r.step(world(), 0.02)!;
    expect(first.done).toBeUndefined();
    const slot = kit.slots.find((s) => s.forProp === "square-3")!;
    const placed = world({ x: -0.8, y: 0.5, yaw: 0 }, { "square-3": slot.pos });
    expect(r.step(placed, 0.02)?.done).toBeUndefined();
    let done;
    for (let i = 0; i < 40 && !done?.done; i++) done = r.step(placed, 0.02) ?? undefined;
    expect(done?.done?.ok).toBe(true);
    expect(r.active).toBeNull();
  });

  it("measures moves along the starting heading and stops near the target", () => {
    const r = new TaskRunner();
    r.start({ kind: "move", meters: 0.3 }, world());
    expect(r.step(world(), 0.02)!.vx).toBeGreaterThan(0);
    const end = r.step(world({ x: 0.29, y: 0.02, yaw: 0.1 }), 0.02)!;
    expect(end.done).toEqual({ ok: true, summary: "Moved 29 cm." });
  });

  it("gives up after its time budget instead of running forever", () => {
    const r = new TaskRunner();
    r.start({ kind: "go_to", target: "square-5" }, world());
    // The duck never moves in this world, so go_to can only time out (30 s).
    let last = r.step(world(), 0.02);
    for (let i = 0; i < 31 * 50 && !last?.done; i++) last = r.step(world(), 0.02);
    expect(last?.done).toEqual({ ok: false, summary: "Gave up after 30 s." });
    expect(r.active).toBeNull();
  });

  it("reports how far a pushed object really moved when it gives up", () => {
    const r = new TaskRunner();
    const start = world();
    const p = start.props.get("square-3")!;
    r.start({ kind: "push", target: "square-3", direction: "right", meters: 0.5 }, start);
    const moved = world({ x: 0, y: 0, yaw: 0 }, { "square-3": [p[0] + 0.23, p[1]] });
    let last = r.step(moved, 0.02);
    for (let i = 0; i < 155 * 50 && !last?.done; i++) last = r.step(moved, 0.02); // push budget is 150 s
    expect(last?.done?.ok).toBe(false);
    expect(last?.done?.summary).toMatch(/moved 23 cm and is still \d+ cm from the target/);
  });
});

describe("balance tasks", () => {
  const moments = (() => {
    const k = momentsKit();
    return { ...k, props: [...roomProps(), ...k.props] };
  })();
  function scene(
    duck: { x: number; y: number; yaw: number },
    rails: Record<string, number> = { "weight-200": -0.2, "weight-100": 0.2 },
    pin: BalanceView["pin"] = "locked",
    angle = 0,
  ): WorldView {
    const props = new Map<string, Vec2>(moments.props.map((p) => [p.id, [p.pos[0], p.pos[1]]]));
    return { id: "pip", duck, speed: 0, others: [], props, kit: moments, touching: new Map(), balance: { pin, angle, rails: new Map(Object.entries(rails)) } };
  }
  const spawn = { x: -0.6, y: 0, yaw: 0 };

  it("refuses what the balance can't do before moving", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "place_weight", target: "plank", cm: 10 }, scene(spawn))).toMatch(/isn't on the balance/);
    // Both weights near the pivot would leave nowhere to stand between them.
    expect(r.start({ kind: "place_weight", target: "weight-200", cm: 5 }, scene(spawn, { "weight-200": -0.2, "weight-100": 0.05 }))).toMatch(
      /Try 9 cm or more/,
    );
    expect(r.start({ kind: "place_weight", target: "weight-200", cm: 10 }, scene({ x: 0.8, y: 0, yaw: 0 }))).toMatch(/other side of the plank/);
    expect(r.start({ kind: "release_plank" }, world())).toMatch(/no balance/);
    expect(r.active).toBeNull();
  });

  it("walks in until real paddle contact, frees the clamp to push, clamps at the mark, then steps clear", () => {
    const r = new TaskRunner();
    const walkway = { x: MOMENTS.transitX, y: 0.2 - 0.16, yaw: 0 };
    const corner = { x: MOMENTS.laneX, y: 0.2 - 0.16, yaw: Math.PI / 2 };
    const touchPaddle = new Map([["weight-100-paddle", 2]]);
    const at = (rail: number, duck = corner, touching = new Map<string, number>()) => ({
      ...scene(duck, { "weight-200": -0.2, "weight-100": rail }),
      touching,
    });
    const until = (phase: string, w: () => WorldView, max = 60) => {
      let last = r.step(w(), 0.02);
      for (let i = 0; i < max && last?.phase !== phase; i++) last = r.step(w(), 0.02);
      return last;
    };
    expect(r.start({ kind: "place_weight", target: "weight-100", cm: 30 }, scene(walkway))).toBeNull();
    // At the corner and still: it lines up, then walks in. No contact, no clamp change.
    const walkingIn = until("APPROACH", () => at(0.2));
    expect(walkingIn?.phase).toBe("APPROACH");
    const step = r.step(at(0.2), 0.02)!;
    expect(step.vx).toBeGreaterThanOrEqual(0.25); // never inside the gait's dead zone
    expect(step.brake).toBeUndefined();
    // MuJoCo reports contact: the clamp comes off only now.
    r.step(at(0.2, corner, touchPaddle), 0.02);
    expect(r.step(at(0.2, corner, touchPaddle), 0.02)?.brake).toEqual({ id: "weight-100", at: null });
    expect(r.step(at(0.25, corner, touchPaddle), 0.02)?.phase).toBe("PUSH");
    // It reaches the mark: the clamp holds it exactly where it is (no easing onto the mark).
    expect(r.step(at(0.2996, corner, touchPaddle), 0.02)?.brake).toEqual({ id: "weight-100", at: 0.2996 });
    // Stops, walks back to the walkway, and is done only once clear and still.
    const clear = { x: MOMENTS.transitX, y: 0.28, yaw: Math.PI };
    expect(until("WITHDRAW", () => at(0.2996))?.phase).toBe("WITHDRAW");
    let last = r.step(at(0.2996, clear), 0.02);
    for (let i = 0; i < 60 && !last?.done; i++) last = r.step(at(0.2996, clear), 0.02);
    expect(last?.done).toEqual({ ok: true, summary: "Moved the 100 g weight from 20 cm to 30 cm (asked for 30 cm)." });
  });

  it("backs off and tries again when it cannot reach the paddle, then fails visibly", () => {
    const r = new TaskRunner();
    const walkway = { x: MOMENTS.transitX, y: 0.2 - 0.16, yaw: 0 };
    const corner = { x: MOMENTS.laneX, y: 0.2 - 0.16, yaw: Math.PI / 2 };
    expect(r.start({ kind: "place_weight", target: "weight-100", cm: 30 }, scene(walkway))).toBeNull();
    // The duck never reaches the paddle (this test world never moves it): the
    // approach times out, the planner goes back to TRAVEL instead of pushing
    // blindly, and the task ends as a visible failure, never an endless loop.
    const phases = new Set<string>();
    let last = r.step(scene(corner), 0.02);
    for (let i = 0; i < 50 * 92 && !last?.done; i++) {
      last = r.step(scene(corner), 0.02);
      if (last?.phase) phases.add(last.phase);
      expect(last?.brake?.at ?? 0).not.toBeNull(); // the clamp never comes off without contact
    }
    expect(phases.has("APPROACH") && phases.has("TRAVEL")).toBe(true);
    expect(last?.done?.ok).toBe(false);
    expect(last?.done?.summary).toMatch(/Gave up after 90 s\. The 100 g weight is at 20 cm\./);
  });

  it("locks a released plank before moving a weight", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "place_weight", target: "weight-200", cm: 10 }, scene(spawn, undefined, "free", 0.1))).toBeNull();
    expect(r.step(scene(spawn, undefined, "free", 0.1), 0.02)?.pin).toBe("lock");
    expect(r.step(scene(spawn, undefined, "levelling", 0.05), 0.02)?.pin).toBe("lock");
    const next = r.step(scene(spawn), 0.02)!;
    expect(next.pin).toBeUndefined();
    expect(next.done).toBeUndefined();
  });

  it("releases the plank and reports the tilt it measures once it settles", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "release_plank" }, scene(spawn))).toBeNull();
    expect(r.step(scene(spawn), 0.02)?.pin).toBe("release");
    let last = r.step(scene(spawn, undefined, "free", 0.1), 0.02);
    for (let i = 0; i < 100 && !last?.done; i++) last = r.step(scene(spawn, undefined, "free", 0.1), 0.02);
    expect(last?.done).toEqual({ ok: true, summary: "Released the plank. The left side went down 5.7°." });

    r.start({ kind: "release_plank" }, scene(spawn));
    for (let i = 0; i < 100 && !last?.done; i++) last = r.step(scene(spawn, undefined, "free", 0), 0.02);
    last = r.step(scene(spawn, undefined, "free", 0), 0.02);
    for (let i = 0; i < 100 && !last?.done; i++) last = r.step(scene(spawn, undefined, "free", 0), 0.02);
    expect(last?.done?.summary).toBe("Released the plank. It stayed level (0.0°).");
  });

  it("never says 'level' next to a number that rounds to 0.5° or more", () => {
    const release = (deg: number) => {
      const r = new TaskRunner();
      r.start({ kind: "release_plank" }, scene(spawn));
      r.step(scene(spawn), 0.02);
      const tilted = () => scene(spawn, undefined, "free", (deg * Math.PI) / 180);
      let last = r.step(tilted(), 0.02);
      for (let i = 0; i < 400 && !last?.done; i++) last = r.step(tilted(), 0.02);
      return last?.done?.summary;
    };
    expect(release(0.47)).toBe("Released the plank. The left side went down 0.5°.");
    expect(release(0.44)).toBe("Released the plank. It stayed level (0.4°).");
    expect(release(-0.47)).toBe("Released the plank. The right side went down 0.5°.");
  });

  it("levels and locks the plank", () => {
    const r = new TaskRunner();
    r.start({ kind: "lock_plank" }, scene(spawn, undefined, "free", -0.1));
    expect(r.step(scene(spawn, undefined, "free", -0.1), 0.02)?.pin).toBe("lock");
    expect(r.step(scene(spawn), 0.02)?.done).toEqual({ ok: true, summary: "Levelled and locked the plank." });
  });
});

describe("navigation and coordination", () => {
  it("never commands the walking policy inside its dead zones", async () => {
    const { NAV, Navigator } = await import("./navigate");
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let k = 0; k < 400; k++) {
      const nav = new Navigator();
      const pose = { x: rand(), y: rand(), yaw: rand() * Math.PI };
      const goal: Vec2 = [rand(), rand()];
      for (let i = 0; i < 5; i++) {
        const t = nav.to(pose, Math.abs(rand()) * 0.3, goal);
        // Forward is 0 or at least the gait minimum; a pure pivot is at least the turn minimum.
        expect(t.vx === 0 || t.vx >= NAV.gaitMin).toBe(true);
        if (t.vx === 0 && t.wz !== 0) expect(Math.abs(t.wz)).toBeGreaterThanOrEqual(NAV.spinMin);
      }
    }
  });

  it("routes a push approach around squares already in place", () => {
    const w = world({ x: -0.6, y: 0, yaw: 0 }, { "square-4": [0, 0] });
    const route = routeAround(w, [-0.6, 0], [[0.6, 0]], "square-3");
    expect(route.length).toBeGreaterThan(1);
    // Every leg keeps clear of the 4×4 square's footprint plus the duck's body.
    const pts: Vec2[] = [[-0.6, 0], ...route];
    for (let i = 1; i < pts.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t;
        const y = pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t;
        expect(Math.hypot(x, y)).toBeGreaterThan(0.16);
      }
    }
  });

  it("runs two pushes one after the other when their lanes overlap", async () => {
    const { BalanceExperiment } = await import("./moments");
    const moments = momentsKit();
    const kit = { ...moments, props: [...roomProps(), ...moments.props] };
    const view = (id: "pip" | "nova", rails: [number, number]): WorldView => ({
      id,
      duck: id === "pip" ? { x: 0, y: -0.3, yaw: 0 } : { x: 0, y: 0.3, yaw: 0 },
      speed: 0,
      others: [],
      props: new Map(),
      kit,
      touching: new Map(),
      balance: { pin: "locked", angle: 0, rails: new Map([["weight-200", rails[0]], ["weight-100", rails[1]]]) },
    });
    const run = (rails: [number, number], left: number, right: number) => {
      const started: string[] = [];
      const exp = new BalanceExperiment({ kind: "set_balance", left_cm: left, right_cm: right });
      const ports = { world: (id: "pip" | "nova") => view(id, rails), start: (id: string) => (started.push(id), null), busy: () => false, clearFor: () => 10, stiffness: () => 0.2 };
      expect(exp.plan(ports)).toBeNull();
      exp.step(ports, 0.02, new Map());
      return { phase: exp.step(ports, 0.02, new Map()).phase, started };
    };
    // Both weights pushed outward from 20 cm: both robots stand between them, so one at a time.
    expect(run([-0.2, 0.2], 28, 28)).toEqual({ phase: "PLACE (one at a time: lanes overlap)", started: ["pip"] });
    // Each pushed toward the pivot from its own outer end: separate lanes, together.
    expect(run([-0.2, 0.2], 10, 12)).toEqual({ phase: "PLACE (together)", started: ["pip", "nova"] });
  });

  it("refuses to run if two robots would share an address", async () => {
    const { assertNoCrossTalk } = await import("./duckSim");
    const duck = (id: string, base: number) => ({ id, qposAdr: [base + 7], dofAdr: [base + 6], ctrlAdr: [base / 21], gyroAdr: base, freeQ: base });
    expect(() => assertNoCrossTalk([duck("pip", 0), duck("nova", 21)])).not.toThrow();
    expect(() => assertNoCrossTalk([duck("pip", 0), { ...duck("nova", 21), ctrlAdr: [0] }])).toThrow(/share ctrl 0/);
  });
});

describe("balance prediction", () => {
  it("predicts a tilt from the net moment and the balance's stiffness, with the same level threshold as the measurement", async () => {
    const { momentsFor, LEVEL_DEG } = await import("./moments");
    const rails = (l: number, r: number) => new Map([["weight-200", -l], ["weight-100", r]]);
    // Exactly equal moments: level.
    expect(momentsFor(rails(0.15, 0.3), 0.2)).toMatchObject({ predicted: "level", predictedTiltDeg: 0 });
    // 2 mm long on the 200 g side: 0.39 N·cm net. With k = 0.2 N·m/rad that is about 1.1° left,
    // not "level" (the old 2% rule called this level, then measured a real tilt).
    const off = momentsFor(rails(0.152, 0.3), 0.2);
    expect(off.predicted).toBe("left");
    expect(off.predictedTiltDeg).toBeGreaterThan(LEVEL_DEG);
    expect(off.predictedTiltDeg).toBeCloseTo(1.1, 1);
    // A big imbalance stops at the plank's 5.7° limit.
    expect(momentsFor(rails(0.2, 0.2), 0.2).predictedTiltDeg).toBeCloseTo(5.7, 1);
    expect(momentsFor(rails(0.1, 0.3), 0.2)).toMatchObject({ predicted: "right", predictedTiltDeg: -5.7 });
  });
});
