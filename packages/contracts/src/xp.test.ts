import { expect, it } from "vitest";
import { MOMENTS_PROMPTS, XP_PER_PROMPT_CAP, XpEventSchema, levelOf, need } from "./index.js";

it("puts level 2 at 100 XP, level 3 at 250 and level 4 at 450", () => {
  expect([need(1), need(2), need(3), need(4)]).toEqual([0, 100, 250, 450]);
  expect([0, 99, 100, 249, 250, 449, 450].map((xp) => levelOf(xp))).toEqual([1, 1, 2, 2, 3, 3, 4]);
});

it("caps a prompt at 35 XP", () => {
  expect(XP_PER_PROMPT_CAP).toBe(35);
});

it("gives each Moments prompt the answer its moments predict", () => {
  for (const p of MOMENTS_PROMPTS) {
    const net = 200 * p.left - 100 * p.right;
    expect(p.answer, p.id).toBe(net === 0 ? "level" : net > 0 ? "left" : "right");
  }
});

it("lets the client name a rule but never its amount, and refuses unknown prompts", () => {
  const learnerId = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f";
  const ok = { learnerId, ruleId: "matched", challengeId: "moments", promptId: "m-10-20" };
  expect(XpEventSchema.safeParse(ok).success).toBe(true);
  expect(XpEventSchema.safeParse({ ...ok, xp: 1000 }).success).toBe(false);
  expect(XpEventSchema.safeParse({ ...ok, promptId: "m-11-20" }).success).toBe(false);
  expect(XpEventSchema.safeParse({ learnerId, ruleId: "objective", challengeId: "balance-beam", promptId: "" }).success).toBe(true);
  expect(XpEventSchema.safeParse({ learnerId, ruleId: "objective", challengeId: "balance-beam", promptId: "m-10-20" }).success).toBe(false);
});
