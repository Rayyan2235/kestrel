import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { kitJson, VERIFIER_KITS } from "../../../scripts/export-kits.js";

it("the verifier's pinned kits match the lab kits (rerun scripts/export-kits.ts)", () => {
  for (const id of VERIFIER_KITS)
    expect(readFileSync(new URL(`../../../verifier/kits/${id}.json`, import.meta.url), "utf8")).toBe(kitJson(id));
});
