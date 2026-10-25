import type { Outcome, PredictionChoice } from "@kestrel/contracts";
import type { SetupMove } from "../coordinator/types.js";

export type Prompt = {
  promptId: string;
  answer: { side: "left" | "right"; cm: number };
};
export type Challenge = {
  challengeId: string;
  title: string;
  goal: Outcome;
  setup: SetupMove[];
  prompts: Prompt[];
};

/** Masses are fixed at 200 g left, 100 g right; only positions change. DuckSim rails run 5-30 cm, so every value fits both sims. */
export const CHALLENGES: readonly Challenge[] = [
  {
    challengeId: "moments-1",
    title: "Balance the beam",
    goal: "balanced",
    setup: [
      { side: "left", cm: 15 },
      { side: "right", cm: 20 },
    ],
    prompts: [{ promptId: "moments-1/p1", answer: { side: "right", cm: 30 } }],
  },
  {
    challengeId: "moments-2",
    title: "A fresh case",
    goal: "balanced",
    setup: [
      { side: "left", cm: 10 },
      { side: "right", cm: 30 },
    ],
    prompts: [{ promptId: "moments-2/p1", answer: { side: "right", cm: 20 } }],
  },
];

export const challengeById = (id: string): Challenge | undefined =>
  CHALLENGES.find((c) => c.challengeId === id);

/** The categorical choice that matches an outcome. */
export const choiceFor = (outcome: Outcome): PredictionChoice =>
  outcome === "left"
    ? "left-down"
    : outcome === "right"
      ? "right-down"
      : "balanced";
