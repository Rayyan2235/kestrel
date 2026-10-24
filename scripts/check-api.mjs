import assert from "node:assert/strict";
import { buildApp } from "../apps/api/dist/apps/api/src/app.js";
const app = buildApp();
try {
  const response = await app.inject("/api/health");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().mode, "scaffold");
  console.log("Compiled API starts and serves its health contract.");
} finally {
  await app.close();
}
