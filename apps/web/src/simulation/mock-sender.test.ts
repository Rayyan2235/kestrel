import { expect, it } from "vitest";
import { createSimulation } from "./runtime.js";
import * as sender from "./mock-sender.js";

it("captures identity and revision before asynchronous delivery, rejecting a stale prepared request", () => {
  expect(sender.createMockSender).toBeTypeOf("function");
  const sim = createSimulation();
  const pip = sender.createMockSender(sim, "pip", "voice-test");
  const prepared = pip.prepareMove("right", 40);
  expect(prepared).toMatchObject({
    botId: "pip",
    worldRevision: 0,
    resetGeneration: 0,
  });
  sim.reset();
  expect(pip.send(prepared)).toMatchObject({
    accepted: false,
    error: { code: "STALE_WORLD" },
  });
  const fresh = pip.prepareMove("left", 10);
  expect(fresh.requestId).not.toBe(prepared.requestId);
  expect(pip.send(fresh).accepted).toBe(true);
  sim.stop();
});
