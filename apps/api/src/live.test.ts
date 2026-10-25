import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { AgentRequest } from "../../../packages/contracts/src/index.js";

const request: AgentRequest = { botId: "pip", worldVersion: 4, world: { lesson: "free", duck: { x: 0, y: 0, yawDeg: 0, mode: "walk" }, props: [], slots: [] }, messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }], final: false };
afterEach(() => vi.unstubAllEnvs());
it("rejects malformed input and unmatched tool results before calling a provider", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  const agentTurn = vi.fn();
  const app = buildApp({ agentTurn, speak: vi.fn(), transcribe: vi.fn() });
  try {
    for (const payload of [{ ...request, worldVersion: -1 }, { ...request, messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "orphan", content: "done", is_error: false }] }] }]) {
      expect((await app.inject({ method: "POST", url: "/api/agent/turn", payload })).statusCode).toBe(400);
    }
    expect(agentTurn).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
it("forwards measured failures and version, and never leaks provider errors", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  const agentTurn = vi.fn().mockResolvedValue({ worldVersion: 4, content: [{ type: "text", text: "The push failed." }] });
  const app = buildApp({ agentTurn, speak: vi.fn(), transcribe: vi.fn() });
  const payload = { ...request, messages: [...request.messages, { role: "assistant", content: [{ type: "tool_use", id: "push1", name: "duck_task", input: { kind: "push", target: "crate", direction: "right" } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "push1", content: "Moved only 2 cm; failed", is_error: true }] }] };
  try {
    const r = await app.inject({ method: "POST", url: "/api/agent/turn", payload });
    expect(r.statusCode).toBe(200);
    expect(agentTurn.mock.calls[0][0].messages[2].content[0].is_error).toBe(true);
    expect(r.json().worldVersion).toBe(4);
    agentTurn.mockRejectedValue(new Error("SECRET_PROVIDER_DEBUG"));
    const error = await app.inject({ method: "POST", url: "/api/agent/turn", payload });
    expect(error.statusCode).toBe(502);
    expect(error.body).not.toContain("SECRET_PROVIDER_DEBUG");
  } finally { await app.close(); }
});
it("passes binary audio in memory, bounds text, and refuses foreign origins", async () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "test");
  const transcribe = vi.fn().mockResolvedValue({ text: "Move right" });
  const app = buildApp({ agentTurn: vi.fn(), speak: vi.fn().mockResolvedValue(Buffer.from("audio")), transcribe });
  try {
    const r = await app.inject({ method: "POST", url: "/api/voice/transcribe", headers: { "content-type": "audio/webm;codecs=opus" }, payload: Buffer.alloc(200) });
    expect(r.json()).toEqual({ text: "Move right" });
    expect(Buffer.isBuffer(transcribe.mock.calls[0][0])).toBe(true);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "POST", url: "/api/voice/speak", payload: { text: "x".repeat(2401) } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/voice/speak", headers: { origin: "https://unrelated.example" }, payload: { text: "hello" } })).statusCode).toBe(403);
    const audio = await app.inject({ method: "POST", url: "/api/voice/speak", payload: { text: "hello" } });
    expect(audio.headers["content-type"]).toBe("audio/mpeg");
  } finally { await app.close(); }
});
