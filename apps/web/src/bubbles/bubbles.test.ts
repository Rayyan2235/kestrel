import { describe, expect, it } from "vitest";
import { deriveBubbles } from "./model.js";
import { ev } from "../testing/fixtures.js";

describe("L5 gate: bubbles derive from `to` and nothing else", () => {
  it("a bot speaking to the learner is a to-you bubble anchored at the speaker", () => {
    const [b] = deriveBubbles([ev(0, "pip", "you", { text: "Try 40 cm." })]);
    expect(b).toMatchObject({
      anchor: "pip",
      to: "you",
      variant: "to-you",
      chip: "to You",
      gaze: "you",
      text: "Try 40 cm.",
      source: "mock",
    });
    expect(b!.ariaLabel).toContain("Try 40 cm.");
  });

  it("a bot speaking to a bot is a bot-to-bot bubble with the peer's name", () => {
    const [b] = deriveBubbles([ev(0, "pip", "nova", { kind: "handoff" })]);
    expect(b).toMatchObject({
      anchor: "pip",
      to: "nova",
      variant: "bot-to-bot",
      chip: "to Nova",
      gaze: "nova",
    });
  });

  it("metamorphic: flipping only `to` flips variant, chip, gaze and aria together", () => {
    const base = ev(0, "pip", "you", { text: "Look at the left side." });
    const [toYou] = deriveBubbles([base]);
    const [toBot] = deriveBubbles([{ ...base, to: "nova" }]);
    expect(toYou!.variant).not.toBe(toBot!.variant);
    expect(toYou!.chip).not.toBe(toBot!.chip);
    expect(toYou!.gaze).not.toBe(toBot!.gaze);
    expect(toYou!.ariaLabel).not.toBe(toBot!.ariaLabel);
    expect(toYou!.anchor).toBe(toBot!.anchor);
    expect(toYou!.text).toBe(toBot!.text);
  });

  it("kind and source cannot change the addressee-derived fields", () => {
    const kinds = ["say", "handoff", "handback", "notice"] as const;
    const sources = ["built-in", "mock", "scripted"] as const;
    for (const kind of kinds)
      for (const source of sources) {
        const [b] = deriveBubbles([ev(0, "nova", "you", { kind, source })]);
        expect(b).toMatchObject({
          variant: "to-you",
          chip: "to You",
          gaze: "you",
          source,
        });
      }
  });

  it("keeps one bubble per bot: the latest event it spoke", () => {
    const bubbles = deriveBubbles([
      ev(0, "pip", "you", { text: "old" }),
      ev(1, "nova", "you", { text: "nova says" }),
      ev(2, "pip", "nova", { text: "new" }),
    ]);
    expect(bubbles).toHaveLength(2);
    expect(bubbles.find((b) => b.anchor === "pip")).toMatchObject({
      text: "new",
      variant: "bot-to-bot",
    });
    expect(bubbles.find((b) => b.anchor === "nova")!.text).toBe("nova says");
  });

  it("learner events produce no bubble", () => {
    expect(
      deriveBubbles([
        ev(0, "you", "pip", { kind: "learner", source: "built-in" }),
      ]),
    ).toEqual([]);
  });

  it("never truncates text in JS: DOM text equals ledger text", () => {
    const long = "word ".repeat(100).trim();
    const [b] = deriveBubbles([ev(0, "pip", "you", { text: long })]);
    expect(b!.text).toBe(long);
  });

  it("is a pure function of the ledger", () => {
    const led = [ev(0, "pip", "you"), ev(1, "nova", "pip")];
    expect(deriveBubbles(led)).toEqual(deriveBubbles(led));
  });
});
