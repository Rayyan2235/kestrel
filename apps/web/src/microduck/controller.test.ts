import { afterEach, describe, expect, it } from "vitest";
import { BALANCE_FIXTURE as fixture, type Position } from "@kestrel/contracts";
import { distance, referenceController } from "../simulation/controller.js";
import { createLinkedController } from "./controller.js";
import { link } from "./link.js";

const spawn = fixture.bots.pip.spawn as Position;
const dock = fixture.bots.pip.dock as Position;
afterEach(() => {
  link.ready = false;
  link.pose.pip = link.pose.nova = null;
  link.leg.pip = link.leg.nova = 0;
});

describe("linked Microduck controller", () => {
  it("is the authored reference controller while no physics body runs", () => {
    const linked = createLinkedController();
    for (const t of [50, 1000, 2500]) expect(linked(t, spawn, "pip")).toEqual(referenceController(t, spawn, "pip"));
  });

  it("reports the body's real pose within the runtime's step bound and never docks early", () => {
    const linked = createLinkedController();
    link.ready = true;
    link.pose.pip = { x: 1.5, z: 1.7, heading: 0 }; // far from the lane
    let last: Position = spawn;
    for (let step = 1; step <= 40; step++) {
      const frame = linked(step * 50, spawn, "pip");
      expect(frame.phase).toBe("approach");
      expect(distance(last, frame.position)).toBeLessThanOrEqual(0.04);
      last = frame.position;
    }
  });

  it("docks exactly once the body has arrived on its second leg, then operates for the fixture's durations", () => {
    const linked = createLinkedController();
    link.ready = true;
    link.pose.pip = { x: dock[0] + 0.05, z: dock[2] + 0.03, heading: Math.PI - 0.2 };
    link.leg.pip = 0;
    expect(linked(50, spawn, "pip").phase).toBe("approach"); // first leg: not arrived yet
    link.leg.pip = 1;
    let t = 100, // the runtime's clock only moves forward within an action
      frame = linked(t, spawn, "pip");
    while (frame.phase === "approach" && t < 5000) frame = linked((t += 50), spawn, "pip");
    expect(frame.phase).toBe("dock");
    expect(frame.position).toEqual([dock[0], 0, dock[2]]);
    const docked = t;
    expect(linked(docked + fixture.dockMilliseconds, spawn, "pip").phase).toBe("operate");
    const done = linked(docked + fixture.dockMilliseconds + fixture.operateMilliseconds, spawn, "pip");
    expect(done.phase).toBe("done");
    expect(done.progress).toBe(1);
  });
});
