import { afterEach, describe, expect, it } from "vitest";
import { BALANCE_FIXTURE as fixture, type Position } from "@kestrel/contracts";
import { distance, referenceController } from "../simulation/controller.js";
import { createLinkedController } from "./controller.js";
import { link, type PushState } from "./link.js";

const spawn = fixture.bots.pip.spawn as Position;
const dock = fixture.bots.pip.dock as Position;
const push = (phase: PushState["phase"], progress = 0, reason: string | null = null): PushState => ({ requestId: "r1", phase, progress, reason });
afterEach(() => {
  link.ready = false;
  link.push.pip = link.push.nova = null;
});

describe("linked Microduck controller", () => {
  it("is the authored reference controller for an action started without a physics body", () => {
    const linked = createLinkedController();
    for (const t of [50, 1000, 2500]) expect(linked(t, spawn, "pip")).toEqual(referenceController(t, spawn, "pip"));
  });

  it("keeps approaching within the runtime's step bound while the body walks to the carriage", () => {
    const linked = createLinkedController();
    link.ready = true;
    link.push.pip = push("route");
    let last: Position = spawn;
    for (let step = 1; step <= 120; step++) {
      const frame = linked(step * 50, spawn, "pip");
      expect(frame.phase).toBe("approach");
      expect(distance(last, frame.position)).toBeLessThanOrEqual(0.04);
      last = frame.position;
    }
    expect(distance(last, dock)).toBeLessThan(1e-9);
  });

  it("docks when the push starts and finishes only when the carriage reaches its notch", () => {
    const linked = createLinkedController();
    link.ready = true;
    link.push.pip = push("push", 0.2);
    let t = 50,
      frame = linked(t, spawn, "pip");
    while (frame.phase === "approach" && t < 10000) frame = linked((t += 50), spawn, "pip");
    expect(frame.phase).toBe("dock");
    expect(frame.position).toEqual([dock[0], 0, dock[2]]);
    for (let i = 0; i < 40; i++) frame = linked((t += 50), spawn, "pip");
    expect(frame.phase).toBe("operate"); // still pushing
    link.push.pip = push("done", 1);
    frame = linked((t += 50), spawn, "pip");
    expect(frame.phase).toBe("done");
    expect(frame.progress).toBe(1);
  });

  it("fails the action with the bot's reason when the push cannot be done", () => {
    const linked = createLinkedController();
    link.ready = true;
    link.push.pip = push("route");
    linked(50, spawn, "pip");
    link.push.pip = push("failed", 0, "There isn't room between the weights.");
    expect(() => linked(100, spawn, "pip")).toThrow("There isn't room between the weights.");
  });
});
