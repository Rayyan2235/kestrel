import { describe, expect, it } from "vitest";
import { rescueKit, rescuePoints, RESCUE, type RescueRoute } from "@kestrel/contracts";
import { TaskRunner, type WorldView } from "./tasks";
const world = (): WorldView => ({
  id: "pip",
  duck: { x: RESCUE.start[0], y: RESCUE.start[1], yaw: 0 },
  speed: 0,
  others: [],
  props: new Map(),
  kit: rescueKit(),
  touching: new Map(),
});
describe("rescue battery and physical execution", () => {
  it("requires Pip in the rescue lesson at the start", () => {
    const r = new TaskRunner(),
      w = world(),
      task: import("@kestrel/contracts").DuckTask = {
        kind: "rescue_route",
        route: ["A", "B", "E", "H"],
      };
    expect(r.start(task, { ...w, id: "nova" })).toMatch(/Pip/);
    expect(r.start(task, { ...w, kit: { ...w.kit, id: "free" } })).toMatch(
      /rescue/,
    );
    expect(r.start(task, { ...w, duck: { x: 0, y: 0, yaw: 0 } })).toMatch(
      /Reset/,
    );
  });
  it("physically settles at the shortest path checkpoints with battery remaining", () => {
    const r = new TaskRunner(),
      w = world();
    r.start({ kind: "rescue_route", route: ["A", "B", "E", "H"] }, w);
    const points = rescuePoints(["A", "B", "E", "H"]).slice(1);
    let done;
    for (const [x, y] of points) {
      w.duck = { x, y, yaw: 0 };
      for (let i = 0; i < 10; i++) done = r.step(w, 0.02)?.done;
    }
    expect(done).toMatchObject({
      ok: true,
      summary: expect.stringContaining("battery left"),
    });
  });
  it.each([
    { route: ["A", "C", "D", "E", "H"] as RescueRoute },
    { route: ["A", "B", "D", "E", "H"] as RescueRoute },
    { route: ["A", "C", "F", "D", "E", "H"] as RescueRoute },
  ])("fails non-shortest route $route from actual travel", ({ route }) => {
    const r = new TaskRunner(),
      w = world();
    r.start({ kind: "rescue_route", route }, w);
    let done;
    for (const [x, y] of rescuePoints(route).slice(1)) {
      w.duck = { x, y, yaw: 0 };
      for (let i = 0; i < 10; i++) {
        const out = r.step(w, 0.02);
        if (out?.done) {
          done = out.done;
          break;
        }
      }
      if (done) break;
    }
    expect(done).toMatchObject({
      ok: false,
      summary: expect.stringContaining("Battery died!"),
    });
  });
  it("cancels and stops on barrier contact or timeout", () => {
    const r = new TaskRunner(),
      w = world(),
      task: import("@kestrel/contracts").DuckTask = {
        kind: "rescue_route",
        route: ["A", "B", "E", "H"],
      };
    r.start(task, w);
    w.touching.set("rescue-barrier-1", 1);
    expect(r.step(w, 0.02)?.done?.ok).toBe(false);
    w.touching.clear();
    r.start(task, w);
    r.cancel();
    expect(r.rescueProgress).toBeNull();
    expect(r.step(w, 0.02)).toBeNull();
    r.start(task, w);
    expect(r.step(w, 151)?.done?.ok).toBe(false);
  });
});
