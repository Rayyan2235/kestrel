import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { registerRequestLog } from "./log.js";

function appWith(env: NodeJS.ProcessEnv) {
  const out = { log: vi.fn(), error: vi.fn() };
  const app = Fastify({ logger: false });
  registerRequestLog(app, env, out);
  app.get("/api/learners/:id", async () => ({ ok: true }));
  app.get("/api/boom", async () => {
    throw new Error("x".repeat(500));
  });
  return { app, out };
}

it("on Lambda, logs each request as one object with the route pattern, never the raw URL", async () => {
  const { app, out } = appWith({ AWS_LAMBDA_FUNCTION_NAME: "kestrel-api" });
  try {
    await app.inject("/api/learners/7a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f?token=secret");
    await app.inject("/api/nowhere");
    expect(out.log).toHaveBeenNthCalledWith(1, { method: "GET", route: "/api/learners/:id", status: 200, ms: expect.any(Number) });
    expect(out.log).toHaveBeenNthCalledWith(2, expect.objectContaining({ route: "unmatched", status: 404 }));
    expect(JSON.stringify(out.log.mock.calls)).not.toMatch(/7a1c8f3e|secret/);
    expect(out.error).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("logs a 5xx at error level with the error's name and a bounded message", async () => {
  const { app, out } = appWith({ AWS_LAMBDA_FUNCTION_NAME: "kestrel-api" });
  try {
    expect((await app.inject("/api/boom")).statusCode).toBe(500);
    const [[line]] = out.error.mock.calls;
    expect(line).toMatchObject({ route: "/api/boom", status: 500 });
    expect(line.error).toMatch(/^Error: x+$/);
    expect(line.error.length).toBeLessThan(220);
  } finally {
    await app.close();
  }
});

it("logs nothing off Lambda", async () => {
  const { app, out } = appWith({});
  try {
    await app.inject("/api/boom");
    expect(out.log).not.toHaveBeenCalled();
    expect(out.error).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
