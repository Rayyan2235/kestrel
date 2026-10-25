import { describe, expect, it } from "vitest";
import { pythagorasKit, roomProps, type Vec2 } from "@kestrel/contracts";
import { SCREEN_DIRS } from "./constants";
import { TaskRunner, type WorldView } from "./tasks";

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
