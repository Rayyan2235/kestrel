import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

// Who may call the API. Locally and on Vultr (Caddy rewrites the site's
// Origin) only localhost origins pass. On AWS the stack sets ORIGIN_HEADER
// and ORIGIN_SECRET, so a request must carry the secret CloudFront adds
// (direct calls to the API endpoint lack it), and SITE_ORIGIN, the site's
// own CloudFront origin, is allowed besides localhost.

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** Whether a sent header value equals the secret, in constant time. Both sides are hashed, so lengths never differ. */
export function sameSecret(sent: unknown, secret: string): boolean {
  return typeof sent === "string" && timingSafeEqual(digest(sent), digest(secret));
}

/** On Lambda the gate must be configured: fail closed rather than serve without the secret check. */
export function assertEdgeConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (!env.ORIGIN_HEADER || !env.ORIGIN_SECRET || !env.SITE_ORIGIN)
    throw new Error("Refusing to start: ORIGIN_HEADER, ORIGIN_SECRET and SITE_ORIGIN must be set on Lambda.");
}

export function registerEdge(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env) {
  const { ORIGIN_HEADER: header, ORIGIN_SECRET: secret, SITE_ORIGIN: site } = env;
  app.addHook("onRequest", async (request, reply) => {
    if (header && secret && !sameSecret(request.headers[header.toLowerCase()], secret))
      return reply.code(403).send({ message: "Use the Kestrel site." });
    const origin = request.headers.origin;
    if (origin && origin !== site && !LOCAL.test(origin)) return reply.code(403).send({ message: "Use the local Kestrel page." });
  });
}
