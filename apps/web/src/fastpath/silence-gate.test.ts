import { describe, expect, it } from "vitest";
import { isTooShort } from "./index.js";

describe("L4 gate: phantom ASR text on silence never reaches the router", () => {
  it.each(["thank you", "Thank you.", "Thanks for watching", "bye", "you"])(
    "%j is blocked even after a long press",
    (text) => {
      expect(isTooShort(2500, text)).toBe(true);
    },
  );

  it("a real command with 'you' in it is not blocked", () => {
    expect(isTooShort(2500, "can you move the left weight to 30")).toBe(false);
  });
});
