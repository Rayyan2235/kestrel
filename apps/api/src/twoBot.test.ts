import { afterEach, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/bedrock-sdk", () => ({
  AnthropicBedrock: class {
    messages = { create };
  },
}));
const { buildApp } = await import("./app.js");

const world = { leftCm: 20, rightCm: 20, leftGrams: 200, rightGrams: 100 };
const body = { bot: "pip", input: "Ask Nova to move the right weight to 25 cm", peer: null, world };
const tool = (input: Record<string, unknown>) => ({ content: [{ type: "tool_use", id: "r1", name: "respond", input }] });

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
});

const post = async (payload: unknown) => {
  const app = buildApp();
  try {
    return await app.inject({ method: "POST", url: "/api/two-bot/respond", payload: payload as object });
  } finally {
    await app.close();
  }
};

it("returns Pip's ask to Nova as the Respond contract, with Pip's persona and the measured world", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  create.mockResolvedValue(tool({ say: "Let me ask Nova.", ask_to: "nova", question: "Can you move the right weight to 25 cm?", evidence: "Right weight at 20 cm" }));
  const r = await post(body);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({
    say: "Let me ask Nova.",
    action: null,
    ask_peer: { to: "nova", question: "Can you move the right weight to 25 cm?", evidence: "Right weight at 20 cm" },
  });
  const sent = create.mock.calls[0]![0];
  expect(sent.system).toContain("You are Pip");
  expect(sent.system).toContain('"rightCm":20');
  expect(sent.tool_choice).toEqual({ type: "tool", name: "respond" });
});

it("Nova's peer turn carries the move and can never ask again", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  create.mockResolvedValue(tool({ say: "Moving my weight to 25 cm.", move_side: "right", move_cm: 25, ask_to: "pip", question: "Again?" }));
  const r = await post({ ...body, bot: "nova", peer: { from: "pip", question: "Can you move the right weight to 25 cm?", evidence: "Right weight at 20 cm" } });
  expect(r.json()).toEqual({ say: "Moving my weight to 25 cm.", action: { side: "right", cm: 25 }, ask_peer: null });
  expect(create.mock.calls[0]![0].system).toContain("You are Nova");
});

it("a reply outside the contract is a 502 with no provider detail; bad input and missing keys never call Bedrock", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  create.mockResolvedValue(tool({ say: "Off the rail.", move_side: "right", move_cm: 80 }));
  const bad = await post(body);
  expect(bad.statusCode).toBe(502);
  expect(bad.body).not.toContain("80");
  create.mockClear();
  expect((await post({ ...body, bot: "rex" })).statusCode).toBe(400);
  vi.unstubAllEnvs();
  vi.stubEnv("AWS_ACCESS_KEY_ID", "");
  vi.stubEnv("AWS_PROFILE", "");
  expect((await post(body)).statusCode).toBe(503);
  expect(create).not.toHaveBeenCalled();
});
