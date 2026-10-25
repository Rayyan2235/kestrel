import { afterEach, expect, it, vi } from "vitest";
import { pythagorasKit, type DuckTask } from "@kestrel/contracts";
import type { DuckSim } from "../simulation/duckSim";
import { AgentSession } from "./agentSession";

function harness() {
  const kit = pythagorasKit();
  const sim = { kit, tasks: { cancel: vi.fn() }, manual: { vx: 0, wz: 0 }, propPositions: () => new Map(kit.props.map(p => [p.id, [p.pos[0], p.pos[1]]])), status: () => ({ pose: { x: 0, y: 0, yawDeg: 0 }, mode: "walk" }), runTask: vi.fn().mockReturnValue(null) };
  const add = vi.fn();
  const session = new AgentSession(sim as unknown as DuckSim, add, vi.fn());
  session.setVoice(false);
  return { session, sim, add };
}
const reply = (version: number, task?: DuckTask) => new Response(JSON.stringify({ worldVersion: version, content: [{ type: "text", text: task ? "I'll try moving." : "I saw the measured result." }, ...(task ? [{ type: "tool_use", id: "one", name: "duck_task", input: task }] : [])] }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("waits for physical completion and gives the model the actual failed result", async () => {
  const { session, sim } = harness();
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => { const b = JSON.parse(options.body); requests.push(b); return reply(b.worldVersion, requests.length === 1 ? { kind: "move", meters: 0.2 } : undefined); }));
  const running = session.submit("Move please");
  await vi.waitFor(() => expect(sim.runTask).toHaveBeenCalledTimes(1));
  expect(requests).toHaveLength(1);
  session.event({ type: "task-done", duck: "pip", task: sim.runTask.mock.calls[0][0], ok: false, summary: "Measured 2 cm before falling." });
  await running;
  expect(requests).toHaveLength(2);
  expect(requests[1].messages.at(-1).content[0]).toMatchObject({ type: "tool_result", is_error: true });
  expect(requests[1].messages.at(-1).content[0].content).toContain("Measured 2 cm before falling");
  session.cancel();
});
it("drops a late model action after Stop/reset even if fetch ignores abort", async () => {
  const { session, sim, add } = harness();
  let release!: (response: Response) => void;
  let version = 0;
  vi.stubGlobal("fetch", vi.fn((_url, options) => { version = JSON.parse(options.body).worldVersion; return new Promise(r => { release = r; }); }));
  const running = session.submit("Move please");
  session.event({ type: "reset", reason: "Reset" });
  release(reply(version, { kind: "move", meters: 1 }));
  await running;
  expect(sim.runTask).not.toHaveBeenCalled();
  expect(add.mock.calls).toHaveLength(1);
  expect(session.phase).toBe("Ready");
});
it("a replacement utterance interrupts an action and prevents its follow-up request", async () => {
  const { session, sim } = harness();
  const fetcher = vi.fn(async (_url, options) => { const b = JSON.parse(options.body); return reply(b.worldVersion, fetcher.mock.calls.length === 1 ? { kind: "move", meters: 1 } : undefined); });
  vi.stubGlobal("fetch", fetcher);
  const old = session.submit("Walk");
  await vi.waitFor(() => expect(sim.runTask).toHaveBeenCalled());
  await session.submit("Hello instead");
  await old;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(session.phase).toBe("Ready");
  session.cancel();
});
it("stops after six actions and asks for a text-only conclusion", async () => {
  const { session, sim } = harness();
  const requests: any[] = [];
  sim.runTask.mockImplementation((task: DuckTask) => { queueMicrotask(() => session.event({ type: "task-done", duck: "pip", task, ok: true, summary: "Moved 18 cm." })); return null; });
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => { const b = JSON.parse(options.body); requests.push(b); return reply(b.worldVersion, b.final ? undefined : { kind: "move", meters: 0.2 }); }));
  await session.submit("Keep going");
  expect(sim.runTask).toHaveBeenCalledTimes(6);
  expect(requests).toHaveLength(7);
  expect(requests.at(-1).final).toBe(true);
  session.cancel();
});
