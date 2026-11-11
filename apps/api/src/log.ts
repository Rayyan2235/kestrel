import type { FastifyInstance } from "fastify";

// One structured log line per request on Lambda (P7). The function's log
// format is JSON, so Lambda keeps each object as an object, and CloudWatch
// Logs Insights can filter on route, status and ms. Lines carry the route
// pattern, never the raw URL, a body or a header: no learner text, no secret.
// A 5xx is logged at ERROR with the error's name and the start of its message.
// Locally (no AWS_LAMBDA_FUNCTION_NAME) nothing is logged.

export type RequestLogLine = { method: string; route: string; status: number; ms: number; error?: string };
type Out = Pick<Console, "log" | "error">;

const MESSAGE_CHARS = 200;

export function registerRequestLog(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env, out: Out = console) {
  if (!env.AWS_LAMBDA_FUNCTION_NAME) return;
  const failures = new WeakMap<object, string>();
  app.addHook("onError", async (request, _reply, error) => {
    failures.set(request, `${error.name}: ${error.message.slice(0, MESSAGE_CHARS)}`);
  });
  app.addHook("onResponse", async (request, reply) => {
    const line: RequestLogLine = {
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    };
    const error = failures.get(request);
    if (error) line.error = error;
    if (reply.statusCode >= 500) out.error(line);
    else out.log(line);
  });
}
