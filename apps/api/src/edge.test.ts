import Fastify from "fastify";
import { expect, it } from "vitest";
import { assertEdgeConfigured, registerEdge } from "./edge.js";

const SITE = "https://d111.cloudfront.net";
const aws = { ORIGIN_HEADER: "x-kestrel-origin", ORIGIN_SECRET: "s3cret", SITE_ORIGIN: SITE };

async function appWith(env: NodeJS.ProcessEnv) {
  const app = Fastify();
  registerEdge(app, env);
  app.get("/api/health", async () => ({ ok: true }));
  await app.ready();
  return app;
}

it("on AWS, needs CloudFront's secret header and allows the site's own origin", async () => {
  const app = await appWith(aws);
  try {
    const call = (headers: Record<string, string>) => app.inject({ url: "/api/health", headers }).then((r) => r.statusCode);
    expect(await call({ "x-kestrel-origin": "s3cret", origin: SITE })).toBe(200);
    expect(await call({ "x-kestrel-origin": "s3cret" })).toBe(200);
    // A direct call to the API endpoint, or a wrong or longer secret.
    expect(await call({ origin: SITE })).toBe(403);
    expect(await call({ "x-kestrel-origin": "s3cre", origin: SITE })).toBe(403);
    expect(await call({ "x-kestrel-origin": "s3cret-and-more", origin: SITE })).toBe(403);
    // CloudFront forwards any viewer's request; a foreign page's origin still fails.
    expect(await call({ "x-kestrel-origin": "s3cret", origin: "https://evil.example" })).toBe(403);
  } finally {
    await app.close();
  }
});

it("locally and on Vultr, needs no secret and allows only localhost origins", async () => {
  const app = await appWith({});
  try {
    const call = (origin?: string) => app.inject({ url: "/api/health", headers: origin ? { origin } : {} }).then((r) => r.statusCode);
    expect(await call()).toBe(200);
    expect(await call("http://127.0.0.1:5180")).toBe(200);
    expect(await call(SITE)).toBe(403);
  } finally {
    await app.close();
  }
});

it("refuses to start on Lambda unless the gate is fully configured", () => {
  expect(() => assertEdgeConfigured(aws)).not.toThrow();
  for (const missing of ["ORIGIN_HEADER", "ORIGIN_SECRET", "SITE_ORIGIN"] as const) {
    expect(() => assertEdgeConfigured({ ...aws, [missing]: undefined })).toThrow(/Refusing to start/);
    expect(() => assertEdgeConfigured({ ...aws, [missing]: "" })).toThrow(/Refusing to start/);
  }
});
