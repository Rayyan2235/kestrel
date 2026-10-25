import type { Award, LabEvent } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

/** Pure award rules. No React, storage or network. XP is the sum of awards, never stored. */
export type Rejection = { ruleId: Award["ruleId"]; reason: string };
export type RuleState = {
  /** Persisted awards: attempt facts come from here, never from a counter. */
  awards: readonly Award[];
  /** Events seen this session, in `seq` order. */
  events: readonly LabEvent[];
  /** Current epoch: an event from an older epoch earns nothing. */
  epoch: number;
  /** Wall time in ms, for the repeatable rate limit. */
  now: number;
};
export type AwardResult = { granted: Award[]; rejected: Rejection[] };

export const PROMPT_CAP_XP = 25;

export const award = (_event: LabEvent, _state: RuleState): AwardResult =>
  notImplemented("rules.award");

export const totalXp = (_awards: readonly Award[]): number =>
  notImplemented("rules.totalXp");
