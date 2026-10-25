import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

describe("G1 gate: progress/ has no network", () => {
  it("no fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon in progress/ sources", () => {
    const files = readdirSync(dir).filter(
      (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
    }
  });

  it("rules.ts imports no react and touches no storage", () => {
    const src = readFileSync(join(dir, "rules.ts"), "utf8");
    expect(src).not.toMatch(/from "react"|localStorage|sessionStorage/);
  });
});
