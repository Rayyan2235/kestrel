import { describe, expect, it } from "vitest";
import { MOMENTS, momentsKit, pythagorasKit, roomProps, type Vec2 } from "@kestrel/contracts";
import { SCREEN_DIRS } from "./constants";
import { TaskRunner, type BalanceView, type WorldView } from "./tasks";

const kit = (() => {
  const k = pythagorasKit();
  return { ...k, props: [...roomProps(), ...k.props] };
})();

function world(duck = { x: 0, y: 0, yaw: 0 }, moved: Record<string, Vec2> = {}): WorldView {
  const props = new Map<string, Vec2>(kit.props.map((p) => [p.id, [p.pos[0], p.pos[1]]]));
  for (const [id, xy] of Object.entries(moved)) props.set(id, xy);
  return { duck, props, kit };
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
    expect(r.step(world({ x: 0, y: 0, yaw: 0 }, { "square-3": [p[0] + rx * 0.19, p[1] + ry * 0.19] }), 0.02)?.done?.ok).toBe(true);
    expect(r.start({ kind: "push", target: "square-3", direction: "right", toward: "slot" }, start)).toMatch(/direction or a destination/);
  });
  it("refuses targets that are missing or fixed before moving", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "go_to", target: "unicorn" }, world())).toMatch(/no unicorn/);
    expect(r.start({ kind: "push", target: "bench" }, world())).toMatch(/fixed/);
    expect(r.active).toBeNull();
  });

  it("finishes a push from the measured prop position, not from its own plan", () => {
    const r = new TaskRunner();
    expect(r.start({ kind: "push", target: "square-3", toward: "slot" }, world())).toBeNull();
    const first = r.step(world(), 0.02)!;
    expect(first.done).toBeUndefined();
    const slot = kit.slots.find((s) => s.forProp === "square-3")!;
    const done = r.step(world({ x: 0, y: 0, yaw: 0 }, { "square-3": slot.pos }), 0.02)!;
    expect(done.done?.ok).toBe(true);
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
    return { duck, props, kit: moments, balance: { pin, angle, rails: new Map(Object.entries(rails)) } };
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

  it("frees the brake only to push, brakes at the mark, then steps clear", () => {
    const r = new TaskRunner();
    // Planned from the walkway; then the duck stands behind the 100 g paddle, facing along the rail.
    const walkway = { x: MOMENTS.transitX, y: 0.2 - 0.16, yaw: 0 };
    const corner = { x: MOMENTS.laneX, y: 0.2 - 0.16, yaw: Math.PI / 2 };
    expect(r.start({ kind: "place_weight", target: "weight-100", cm: 30 }, scene(walkway))).toBeNull();
    expect(r.step(scene(corner), 0.02)).toEqual({ vx: 0, wz: 0 }); // reached the corner
    expect(r.step(scene(corner), 0.02)?.brake).toEqual({ id: "weight-100", at: null }); // faced along the rail
    const pushing = r.step(scene(corner, { "weight-200": -0.2, "weight-100": 0.25 }), 0.02)!;
    expect(pushing.vx).toBeGreaterThan(0);
    expect(pushing.brake).toBeUndefined();
    const near = { "weight-200": -0.2, "weight-100": 0.29 };
    expect(r.step(scene(corner, near), 0.02)?.brake).toEqual({ id: "weight-100", at: 0.3 });
    const placed = { "weight-200": -0.2, "weight-100": 0.3 };
    for (let i = 0; i < 16; i++) expect(r.step(scene(corner, placed), 0.02)?.done).toBeUndefined();
    const clear = { x: MOMENTS.transitX, y: 0.28, yaw: Math.PI };
    expect(r.step(scene(clear, placed), 0.02)?.done).toEqual({ ok: true, summary: "Moved the 100 g weight from 20 cm to 30 cm." });
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

  it("levels and locks the plank", () => {
    const r = new TaskRunner();
    r.start({ kind: "lock_plank" }, scene(spawn, undefined, "free", -0.1));
    expect(r.step(scene(spawn, undefined, "free", -0.1), 0.02)?.pin).toBe("lock");
    expect(r.step(scene(spawn), 0.02)?.done).toEqual({ ok: true, summary: "Levelled and locked the plank." });
  });
});
