import { expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { connectProgress, pgStore } from "./progress.js";
import type { LiveProviders } from "./live.js";

const learnerId = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f";
const attempt = { learnerId, objective: "balance-beam", ok: true, tiltDeg: 0.3, leftCm: 10, rightCm: 20 };
const providers: LiveProviders = { agentTurn: vi.fn(), speak: vi.fn(), transcribe: vi.fn() };

it("returns 503 for valid requests when no database is connected", async () => {
  expect(await connectProgress("")).toBeNull();
  const app = buildApp(providers, null);
  try {
    expect((await app.inject({ method: "POST", url: "/api/progress", payload: attempt })).statusCode).toBe(503);
    expect((await app.inject(`/api/progress/${learnerId}`)).statusCode).toBe(503);
    expect((await app.inject("/api/health")).json().capabilities.progress).toBe(false);
  } finally { await app.close(); }
});

it("validates attempts before they reach the store", async () => {
  const store = { record: vi.fn(), progress: vi.fn() };
  const app = buildApp(providers, store);
  try {
    for (const payload of [{ ...attempt, learnerId: "me" }, { ...attempt, objective: "win-everything" }, { ...attempt, name: "Ada" }, { ...attempt, tiltDeg: -1 }])
      expect((await app.inject({ method: "POST", url: "/api/progress", payload })).statusCode).toBe(400);
    expect((await app.inject("/api/progress/not-a-uuid")).statusCode).toBe(400);
    expect(store.record).not.toHaveBeenCalled();
    expect(store.progress).not.toHaveBeenCalled();
  } finally { await app.close(); }
});

it("inserts the measured attempt and reads earned objectives with attempt counts", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const app = buildApp(providers, pgStore({ query } as never));
  try {
    const r = await app.inject({ method: "POST", url: "/api/progress", payload: attempt });
    expect(r.statusCode).toBe(201);
    expect(query.mock.calls[0]![0]).toMatch(/^INSERT INTO attempts/);
    expect(query.mock.calls[0]![1]).toEqual([learnerId, "balance-beam", true, 0.3, 10, 20]);

    query.mockResolvedValueOnce({ rows: [{ objective: "balance-beam", attempts: 3, earned: true }, { objective: "rescue-pip", attempts: 2, earned: false }] });
    const read = await app.inject(`/api/progress/${learnerId}`);
    expect(read.json()).toEqual({ earned: ["balance-beam"], attempts: { "balance-beam": 3, "rescue-pip": 2 } });
    expect(query.mock.calls[1]![1]).toEqual([learnerId]);
  } finally { await app.close(); }
});

it("hides database errors from the browser", async () => {
  const query = vi.fn().mockRejectedValue(new Error("password authentication failed for user tsdbadmin"));
  const app = buildApp(providers, pgStore({ query } as never));
  try {
    const r = await app.inject({ method: "POST", url: "/api/progress", payload: attempt });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain("tsdbadmin");
    expect((await app.inject(`/api/progress/${learnerId}`)).statusCode).toBe(502);
  } finally { await app.close(); }
});
