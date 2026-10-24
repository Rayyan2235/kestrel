import { describe, expect, it } from "vitest";
import {
  MAX_CM,
  MIN_CM,
  STEP_CM,
  isTooShort,
  normalize,
  parseFast,
  type FastContext,
} from "./index.js";

const ctx = (over: Partial<FastContext> = {}): FastContext => ({
  focus: "left",
  leftCm: 20,
  rightCm: 20,
  undo: [],
  ...over,
});

describe("L4 gate: normalize", () => {
  it("lowercases, converts number words, drops units and politeness", () => {
    const n = normalize("Please Move the Left Weight to Thirty Five CM!");
    expect(n).toContain("35");
    expect(n).not.toMatch(/please|centimet|\bcm\b/);
    expect(n).toBe(n.toLowerCase());
  });
});

describe("L4 gate: exact commands, including ASR-style variants", () => {
  it.each([
    ["move the left weight to 30 cm", "left", 30],
    ["Move the left weight to thirty centimeters please", "left", 30],
    ["uh move left weight to forty five", "left", 45],
    ["put the right weight at twenty five cm", "right", 25],
    ["right weight thirty five centimetres", "right", 35],
    ["left to 10", "left", 10],
    ["could you move the right one to fifteen", "right", 15],
    ["set left weight to 5 centimeters", "left", 5],
    ["move left weight to twenty", "left", 20],
    ["right weight to forty", "right", 40],
  ])("%s", (text, side, cm) => {
    expect(parseFast(text, ctx())).toEqual({ kind: "move", side, cm });
  });

  it("clamps to the 5 to 45 range instead of failing", () => {
    expect(parseFast("move left weight to 70 cm", ctx())).toEqual({
      kind: "move",
      side: "left",
      cm: MAX_CM,
    });
    expect(parseFast("move right weight to 2 cm", ctx())).toEqual({
      kind: "move",
      side: "right",
      cm: MIN_CM,
    });
  });
});

describe("L4 gate: follow-ups against the ledger focus", () => {
  it("more and less step the focused side", () => {
    expect(parseFast("more", ctx({ focus: "left", leftCm: 20 }))).toEqual({
      kind: "move",
      side: "left",
      cm: 20 + STEP_CM,
    });
    expect(parseFast("less", ctx({ focus: "right", rightCm: 30 }))).toEqual({
      kind: "move",
      side: "right",
      cm: 30 - STEP_CM,
    });
  });

  it("more and less clamp at the limits", () => {
    expect(
      parseFast("more", ctx({ focus: "left", leftCm: MAX_CM })),
    ).toMatchObject({ kind: "move", cm: MAX_CM });
    expect(
      parseFast("less", ctx({ focus: "left", leftCm: MIN_CM })),
    ).toMatchObject({ kind: "move", cm: MIN_CM });
  });

  it("other side acts on the side that is not in focus", () => {
    expect(parseFast("other side", ctx({ focus: "left" }))).toMatchObject({
      kind: "move",
      side: "right",
    });
    expect(parseFast("other side", ctx({ focus: "right" }))).toMatchObject({
      kind: "move",
      side: "left",
    });
  });

  it("again repeats on the focused side", () => {
    expect(
      parseFast(
        "again",
        ctx({ focus: "right", undo: [{ side: "right", cm: 15 }] }),
      ),
    ).toMatchObject({ kind: "move", side: "right" });
  });

  it("undo works only when there is something to undo", () => {
    expect(
      parseFast("undo", ctx({ undo: [{ side: "left", cm: 15 }] })),
    ).toEqual({ kind: "undo" });
    expect(parseFast("undo", ctx({ undo: [] })).kind).toBe("miss");
  });

  it("follow-ups with no focus do not guess a side", () => {
    expect(parseFast("more", ctx({ focus: null })).kind).toBe("miss");
    expect(parseFast("other side", ctx({ focus: null })).kind).toBe("miss");
  });
});

describe("L4 gate: no guessing on misses", () => {
  it.each([
    "make it spicy",
    "move the weight",
    "move left",
    "left weight to",
    "what is torque",
    "move the left weight to banana",
    "",
  ])("%j is an explicit miss with a try-hint", (text) => {
    const r = parseFast(text, ctx());
    expect(r.kind).toBe("miss");
    if (r.kind === "miss") expect(r.hint.toLowerCase()).toContain("try");
  });
});

describe("L4 gate: minimum duration gate", () => {
  it("blocks accidental taps and empty transcripts", () => {
    expect(isTooShort(120, "")).toBe(true);
    expect(isTooShort(150, "uh")).toBe(true);
    expect(isTooShort(3000, "")).toBe(true);
  });
  it("lets a real utterance through", () => {
    expect(isTooShort(1800, "move left weight to 30")).toBe(false);
  });
});
