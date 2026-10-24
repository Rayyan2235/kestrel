import { beforeEach, describe, expect, it } from "vitest";
import { applyWeight, createWorld } from "@kestrel/contracts";
import { useLab } from "./lab";

beforeEach(() => {
  useLab.setState({ world: createWorld(), messages: [], busy: false, epoch: 0, queued: [], nextTurn: 0 });
});

describe("L0 gate: every store mutation bumps world.version", () => {
  it("moveWeight bumps", () => {
    const v = useLab.getState().world.version;
    useLab.getState().moveWeight("left", 10);
    expect(useLab.getState().world.version).toBeGreaterThan(v);
  });
  it("send with an action bumps", () => {
    const v = useLab.getState().world.version;
    useLab.getState().send("move the left weight to 10 cm");
    expect(useLab.getState().world.version).toBeGreaterThan(v);
  });
  it("send with no action (question only) still bumps", () => {
    const v = useLab.getState().world.version;
    useLab.getState().send("why does it tilt?");
    expect(useLab.getState().world.version).toBeGreaterThan(v);
  });
  it("reset bumps, never returns to an earlier version", () => {
    useLab.getState().moveWeight("left", 10);
    const v = useLab.getState().world.version;
    useLab.getState().reset();
    expect(useLab.getState().world.version).toBeGreaterThan(v);
  });
  it("a result captured before any mutation is rejected as stale", () => {
    const stale = useLab.getState().world;
    useLab.getState().send("why does it tilt?");
    expect(() => applyWeight(stale, "left", 10, useLab.getState().world.version)).toThrow(/stale/);
  });
});
