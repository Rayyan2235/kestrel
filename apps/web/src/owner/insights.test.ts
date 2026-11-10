import { describe, expect, it, vi } from "vitest";
import { loadInsights, percent } from "./insights";

const body = { learners: 3, demo: true, updatedAt: null, concepts: [], prompts: [] };
const reply = (status: number, json: unknown = {}) => vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }));

describe("loadInsights", () => {
  it("sends the token as a Bearer header and parses the report", async () => {
    const fetcher = reply(200, body);
    expect(await loadInsights("tok", fetcher)).toEqual({ ok: true, insights: body });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/owner/insights");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("says what went wrong", async () => {
    expect(await loadInsights("x", reply(401))).toEqual({ ok: false, message: "That token is not right." });
    expect(await loadInsights("x", reply(503))).toMatchObject({ ok: false, message: expect.stringContaining("off") });
    expect(await loadInsights("x", reply(200, { learners: "many" }))).toMatchObject({ ok: false });
    expect(await loadInsights("x", vi.fn().mockRejectedValue(new TypeError("offline")))).toMatchObject({ ok: false });
  });
});

it("formats rates as whole percents", () => {
  expect(percent(0.255)).toBe("26%");
});
