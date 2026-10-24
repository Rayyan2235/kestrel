import { expect, it } from "vitest";
import { buildApp } from "./app.js";
it("rejects malformed commands and reports the actual provider capability", async () => {
  const app = buildApp();
  try {
    const bad = await app.inject({
      method: "POST",
      url: "/api/commands",
      payload: { botId: "unknown" },
    });
    expect(bad.statusCode).toBe(400);
    const good = await app.inject({
      method: "POST",
      url: "/api/commands",
      payload: { botId: "pip", text: "hello", worldVersion: 0 },
    });
    expect(good.statusCode).toBe(501);
    expect(good.json().code).toBe("PROVIDER_NOT_CONNECTED");
    const health = await app.inject("/api/health");
    expect(health.json().capabilities).toEqual({
      liveAi: false,
      speech: false,
      mujoco: false,
    });
  } finally {
    await app.close();
  }
});
