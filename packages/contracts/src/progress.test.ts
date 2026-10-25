import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOKS,
  LabEventSchema,
  LedgerKindSchema,
  parseBotLook,
  parseProgress,
  freshProgress,
  ProgressSchema,
} from "./index.js";

const stamp = { seq: 1, epoch: 0, worldVersion: 0 };

describe("G0 gate: progress contracts", () => {
  it("LabEventSchema rejects a missing epoch or worldVersion", () => {
    const base = { type: "challenge_complete", challengeId: "moments-1", ...stamp };
    expect(LabEventSchema.safeParse(base).success).toBe(true);
    const { epoch: _e, ...noEpoch } = base;
    const { worldVersion: _w, ...noVersion } = base;
    expect(LabEventSchema.safeParse(noEpoch).success).toBe(false);
    expect(LabEventSchema.safeParse(noVersion).success).toBe(false);
  });

  it("explanation_submitted rejects a text key", () => {
    const ok = { type: "explanation_submitted", challengeId: "moments-1", ...stamp };
    expect(LabEventSchema.safeParse(ok).success).toBe(true);
    expect(LabEventSchema.safeParse({ ...ok, text: "because" }).success).toBe(false);
  });

  it("move_applied carries the bot, and setup/attempt are optional", () => {
    const m = { type: "move_applied", bot: "pip", outcome: "balanced", ...stamp };
    expect(LabEventSchema.safeParse(m).success).toBe(true);
    expect(LabEventSchema.safeParse({ ...m, attempt: 1, setup: true }).success).toBe(true);
    const { bot: _b, ...noBot } = m;
    expect(LabEventSchema.safeParse(noBot).success).toBe(false);
  });

  it("prediction_locked needs an attempt and a categorical choice", () => {
    const l = { type: "prediction_locked", challengeId: "c", promptId: "p", attempt: 1, choice: "balanced", ...stamp };
    expect(LabEventSchema.safeParse(l).success).toBe(true);
    expect(LabEventSchema.safeParse({ ...l, choice: "42" }).success).toBe(false);
    const { attempt: _a, ...noAttempt } = l;
    expect(LabEventSchema.safeParse(noAttempt).success).toBe(false);
  });

  it("parseBotLook keeps valid fields and defaults only the bad one", () => {
    const look = { ...DEFAULT_LOOKS.pip, shell: "shell-gold", head: 42 };
    const out = parseBotLook(look, DEFAULT_LOOKS.pip);
    expect(out.shell).toBe("shell-gold");
    expect(out.head).toBe(DEFAULT_LOOKS.pip.head);
    expect(out.neck).toBe(DEFAULT_LOOKS.pip.neck);
  });

  it("parseBotLook of garbage returns the fallback", () => {
    expect(parseBotLook(null, DEFAULT_LOOKS.nova)).toEqual(DEFAULT_LOOKS.nova);
    expect(parseBotLook("x", DEFAULT_LOOKS.nova)).toEqual(DEFAULT_LOOKS.nova);
  });

  it("parseBotLook ignores an unknown extra key without throwing", () => {
    const out = parseBotLook({ ...DEFAULT_LOOKS.pip, wings: "big" }, DEFAULT_LOOKS.pip);
    expect(out).toEqual(DEFAULT_LOOKS.pip);
  });

  it.each(["{", null, undefined, 7, [], { schema: 9 }])(
    "parseProgress(%j) gives a fresh profile without throwing",
    (input) => {
      const p = parseProgress(input);
      expect(ProgressSchema.safeParse(p).success).toBe(true);
      expect(p.awards).toEqual([]);
      expect(p.picks).toEqual([]);
    },
  );

  it("freshProgress has no stored total, level or token counter", () => {
    const p = freshProgress() as Record<string, unknown>;
    for (const k of ["xp", "level", "tokens", "rewardTokens", "total"]) {
      expect(k in p).toBe(false);
    }
    expect(p.schema).toBe(1);
  });

  it("an award has no mutable seen/notified flag", () => {
    const p = ProgressSchema.safeParse({
      ...freshProgress(),
      awards: [{ awardId: "a", ruleId: "lock", xp: 10, reason: "r", triggeredBy: 1, notified: true }],
    });
    expect(p.success).toBe(false);
  });

  it("LedgerKindSchema still rejects every progress kind", () => {
    for (const k of [
      "prediction_locked",
      "prediction_voided",
      "move_applied",
      "challenge_complete",
      "explanation_submitted",
      "ask_peer_used",
    ]) {
      expect(LedgerKindSchema.safeParse(k).success).toBe(false);
    }
  });
});
