import { expect, it } from "vitest";
import * as contracts from "./index.js";

it("accepts bounded addressed requests and rejects malformed tool input", () => {
  const schema = contracts.ActionRequestSchema;
  expect(schema).toBeDefined();
  const request = {
    requestId: "voice-1",
    botId: "pip",
    worldRevision: 0,
    resetGeneration: 0,
    action: "move-weight",
    stationId: "balance",
    objectId: "right-weight",
    parameters: { positionCm: 40 },
  };
  expect(schema.safeParse(request).success).toBe(true);
  for (const change of [
    { botId: "unknown" },
    { stationId: "unknown" },
    { worldRevision: -1 },
    { resetGeneration: 0.5 },
    { requestId: "" },
    { parameters: { positionCm: Infinity } },
    { parameters: { positionCm: 46 } },
    { parameters: { positionCm: 4 } },
    { parameters: { positionCm: 40, force: 1 } },
    { arbitraryCode: "run" },
  ]) {
    expect(schema.safeParse({ ...request, ...change }).success).toBe(false);
  }
});
