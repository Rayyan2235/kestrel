import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { learnerId, submitForVerdict } from "./progress";

// Where the server runs its verifier: the browser submits its decision and waits for the XP.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const attemptId = "11111111-2222-4333-8444-555555555555";
const noWait = () => Promise.resolve();

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

it("submits only the decision, then polls until the verifier's XP lands", async () => {
  const totals = [{ xp: 90, level: 1 }, { xp: 90, level: 1 }, { xp: 115, level: 2 }];
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    url === "/api/attempts/submit" ? json({ attemptId }, 202) : json(totals.shift()),
  );
  vi.stubGlobal("fetch", fetch);
  const r = await submitForVerdict({ attemptId, leftCm: 10, rightCm: 20 }, noWait);
  expect(r).toEqual({ before: { xp: 90, level: 1 }, after: { xp: 115, level: 2 } });
  const submit = fetch.mock.calls.find(([url]) => url === "/api/attempts/submit")!;
  expect(JSON.parse(submit[1]!.body as string)).toEqual({ learnerId: learnerId(), attemptId, leftCm: 10, rightCm: 20 });
});

it("gives up waiting after 20 s when the verdict earns nothing", async () => {
  const fetch = vi.fn(async (url: string) => (url === "/api/attempts/submit" ? json({ attemptId }, 202) : json({ xp: 90, level: 1 })));
  vi.stubGlobal("fetch", fetch);
  const sleep = vi.fn((_ms: number) => Promise.resolve());
  const r = await submitForVerdict({ objective: "balance-beam", leftCm: 10.1, rightCm: 20 }, sleep);
  expect(r).toEqual({ before: { xp: 90, level: 1 }, after: { xp: 90, level: 1 } });
  expect(sleep.mock.calls.reduce((t, [ms]) => t + ms, 0)).toBeGreaterThanOrEqual(20000);
});

it("is null when the server refuses the submission or is offline", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/attempts/submit" ? json({ message: "no" }, 409) : json({ xp: 0, level: 1 }))));
  expect(await submitForVerdict({ attemptId, leftCm: 10, rightCm: 20 }, noWait)).toBeNull();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  expect(await submitForVerdict({ attemptId, leftCm: 10, rightCm: 20 }, noWait)).toBeNull();
});
