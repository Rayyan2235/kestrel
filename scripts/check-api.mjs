import assert from "node:assert/strict";
import { buildApp } from "../apps/api/dist/apps/api/src/app.js";
const app = buildApp();
try {
  const response = await app.inject("/api/health");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().mode, "sandbox");
  console.log("Compiled API starts and serves its health contract.");
} finally {
  await app.close();
}

// The Lambda bundle answers an HTTP API (payload v2) event, behind the origin secret.
process.env.ORIGIN_HEADER = "x-kestrel-origin";
process.env.ORIGIN_SECRET = "check";
process.env.SITE_ORIGIN = "https://check.cloudfront.net";
const { handler } = await import("../apps/api/dist-lambda/lambda.mjs");
const event = (headers) => ({
  version: "2.0",
  routeKey: "$default",
  rawPath: "/api/health",
  rawQueryString: "",
  headers,
  requestContext: { http: { method: "GET", path: "/api/health", sourceIp: "127.0.0.1" } },
  isBase64Encoded: false,
});
const viaCloudFront = await handler(event({ "x-kestrel-origin": "check" }), {});
assert.equal(viaCloudFront.statusCode, 200);
assert.equal(JSON.parse(viaCloudFront.body).mode, "sandbox");
assert.equal((await handler(event({}), {})).statusCode, 403);
console.log("Lambda bundle serves health and refuses requests without the origin secret.");
