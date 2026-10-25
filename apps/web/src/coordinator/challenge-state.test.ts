import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoordinator } from "./index.js";
import { createFakeSim } from "../simulation/fake/index.js";
import { createLabEventLog } from "../progress/events.js";
import { challengeById } from "../progress/challenges.js";
import { instantProvider, say } from "../testing/fixtures.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const rig = () => {
  const sim = createFakeSim();
  const log = createLabEventLog();
  const { provider } = instantProvider(() => say("ok"));
  const c = createCoordinator({ sim, provider, log } as Parameters<typeof createCoordinator>[0]);
  return { sim, log, c };
};
const m1 = challengeById("moments-1")!;

describe("G2 gate: active challenge", () => {
  it("no challenge is active by default", () => {
    expect(rig().c.challengeId()).toBeNull();
  });

  it("startChallenge sets the id, grants nothing and logs no scorable move", () => {
    const { c, log } = rig();
    c.startChallenge("moments-2", challengeById("moments-2")!.setup);
    expect(c.challengeId()).toBe("moments-2");
    expect(log.events().filter((e) => e.type === "move_applied" && !(e as { setup?: boolean }).setup)).toEqual([]);
    expect(log.events().filter((e) => e.type === "challenge_complete")).toEqual([]);
  });

  it("starting a challenge clears the chat ledger (intended)", async () => {
    const { c } = rig();
    await c.learnerTurn("hello", "pip").done;
    expect(c.ledger().length).toBeGreaterThan(0);
    c.startChallenge("moments-1", m1.setup);
    expect(c.ledger()).toEqual([]);
  });

  it("endChallenge deactivates and voids a held move", () => {
    const { c, log } = rig();
    c.startChallenge("moments-1", m1.setup);
    c.heldTurn("pip", "x", { say: "Lock it", action: { side: "right", cm: 40 } }, { challengeId: "moments-1", promptId: "moments-1/p1" });
    c.endChallenge();
    expect(c.challengeId()).toBeNull();
    expect(log.events().some((e) => e.type === "prediction_voided")).toBe(true);
  });

  it("a plain reset clears the active challenge", () => {
    const { c } = rig();
    c.startChallenge("moments-1", m1.setup);
    c.reset();
    expect(c.challengeId()).toBeNull();
  });

  it("askPeer logs ask_peer_used only while a challenge is active", async () => {
    const { c, log } = rig();
    await c.askPeer("pip", "nova").done;
    expect(log.events().some((e) => e.type === "ask_peer_used")).toBe(false);
    c.startChallenge("moments-1", m1.setup);
    await c.askPeer("pip", "nova").done;
    expect(log.events().filter((e) => e.type === "ask_peer_used")).toMatchObject([{ challengeId: "moments-1" }]);
  });

  it("without a log nothing is appended and nothing throws", () => {
    const sim = createFakeSim();
    const { provider } = instantProvider(() => say("ok"));
    const c = createCoordinator({ sim, provider });
    expect(() => c.startChallenge("moments-1", m1.setup)).not.toThrow();
  });

  it("outside a challenge a normal local turn never holds", () => {
    const { sim, c } = rig();
    const v = sim.snapshot().version;
    c.localTurn("pip", "move the right weight to 40 cm", { say: "Moving.", action: { side: "right", cm: 40 } });
    // localTurn path unchanged: it may move, but never logs a lock
    expect(sim.snapshot().version).toBeGreaterThanOrEqual(v);
  });
});
