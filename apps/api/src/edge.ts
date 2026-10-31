import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

// Who may call the API. Locally and on Vultr (Caddy rewrites the site's
// Origin) only localhost origins pass. On AWS the stack sets ORIGIN_HEADER
// and ORIGIN_SECRET, so a request must carry the secret CloudFront adds
// (direct calls to the API endpoint lack it), and SITE_ORIGIN, the site's
// own CloudFront origin, is allowed besides localhost.

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function registerEdge(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env) {
  const { ORIGIN_HEADER: header, ORIGIN_SECRET: secret, SITE_ORIGIN: site } = env;
  // Hash both sides so the constant-time compare never sees unequal lengths.
  const expected = header && secret ? digest(secret) : null;
  app.addHook("onRequest", async (request, reply) => {
    if (expected) {
      const sent = request.headers[header!.toLowerCase()];
      if (typeof sent !== "string" || !timingSafeEqual(digest(sent), expected))
        return reply.code(403).send({ message: "Use the Kestrel site." });
    }
    const origin = request.headers.origin;
    if (origin && origin !== site && !LOCAL.test(origin)) return reply.code(403).send({ message: "Use the local Kestrel page." });
  });
}
