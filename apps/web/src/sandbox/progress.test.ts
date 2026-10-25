import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SimStatus } from "../simulation/duckSim";
import { beamReading, learnerId, loadEarned, logAttempt } from "./progress";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const beam = { tiltDeg: 0.2, leftCm: 10, rightCm: 20 };

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

it("keeps one anonymous learner ID across reloads", () => {
  const id = learnerId();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect(learnerId()).toBe(id);
});

it("merges server progress with this browser's earned objectives", async () => {
  const fetch = vi.fn().mockResolvedValue(json({ earned: ["build-triangle"], attempts: { "build-triangle": 2 } }));
  vi.stubGlobal("fetch", fetch);
  await logAttempt({ objective: "balance-beam", ok: true, ...beam });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ learnerId: learnerId(), objective: "balance-beam", ok: true, ...beam });
  expect((await loadEarned()).sort()).toEqual(["balance-beam", "build-triangle"]);
  expect(fetch.mock.calls[1]![0]).toBe(`/api/progress/${learnerId()}`);
});

it("falls back to localStorage when the database is off or unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "off" }, 503)));
  await logAttempt({ objective: "rescue-pip", ok: true, tiltDeg: null, leftCm: null, rightCm: null });
  expect(await loadEarned()).toEqual(["rescue-pip"]);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  await expect(logAttempt({ objective: "balance-beam", ok: true, ...beam })).resolves.toBeUndefined();
  expect(await loadEarned()).toEqual(["rescue-pip", "balance-beam"]);
});

it("works without storage at all", async () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  expect(learnerId()).toBe(learnerId());
  await logAttempt({ objective: "balance-beam", ok: true, ...beam });
  expect(await loadEarned()).toEqual([]);
});

it("reads the beam's measured tilt and each side's weight position", () => {
  const status = { balance: { pin: "free", angle: -0.004, rails: new Map([["weight-200", -0.1], ["weight-100", 0.2]]) } } as SimStatus;
  expect(beamReading(status)).toEqual({ tiltDeg: 0.2, leftCm: 10, rightCm: 20 });
  expect(beamReading({ balance: null } as SimStatus)).toEqual({ tiltDeg: null, leftCm: null, rightCm: null });
});
