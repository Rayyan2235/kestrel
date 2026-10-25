import { describe, expect, it } from "vitest";
import { createCoordinator } from "./index.js";
import { createFakeSim } from "../simulation/fake/index.js";
import type { Provider } from "../provider/types.js";

describe("crewTurn", () => {
  it("makes one provider call, and a left-weight action assigned to Nova is done by Pip", async () => {
    const sim = createFakeSim();
    let calls = 0;
    const provider: Provider = {
      respond: async () => {
        calls++;
        throw new Error("a crew turn must not use respond()");
      },
      crew: async () => {
        calls++;
        return {
          crew: {
            lead: {
              bot: "nova",
              say: "I'll move it.",
              action: { side: "left", cm: 30 },
            },
            second: { bot: "pip", say: "Watch the tilt." },
          },
          source: "mock",
        };
      },
    };
    const c = createCoordinator({ sim, provider });
    await c.crewTurn("both, move the left weight to 30 cm", "pip").done;
    expect(calls).toBe(1);
    expect(sim.snapshot().leftCm).toBe(30);
    const ledger = c.ledger();
    expect(
      ledger.some(
        (e) =>
          e.from === "pip" &&
          e.kind === "notice" &&
          /Pip works the left rail/.test(e.text),
      ),
    ).toBe(true);
    expect(c.lastTrial()).toBe("pip");
    expect(ledger.filter((e) => e.kind === "say").map((e) => e.from)).toEqual([
      "pip",
      "nova",
    ]);
  });
});
