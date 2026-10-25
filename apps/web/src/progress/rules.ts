import type {
  Award,
  LabEvent,
  Outcome,
  PredictionChoice,
} from "@kestrel/contracts";
import { challengeById } from "./challenges.js";

/** Pure award rules. No React, storage or network. XP is the sum of awards, never stored. */
export type Rejection = { ruleId: Award["ruleId"]; reason: string };
export type RuleState = {
  /** Persisted awards: attempt facts come from here, never from a counter. */
  awards: readonly Award[];
  /** Events seen this session before the current one, in `seq` order. */
  events: readonly LabEvent[];
  /** Current epoch: an event from an older epoch earns nothing. */
  epoch: number;
  /** Wall time in ms, reserved for a repeatable rate limit. */
  now: number;
};
export type AwardResult = { granted: Award[]; rejected: Rejection[] };

export const PROMPT_CAP_XP = 25;

const XP = {
  lock: 10,
  match: 15,
  comeback: 10,
  complete: 50,
  explain: 20,
  askPeer: 5,
} as const;

const outcomeOf: Record<PredictionChoice, Outcome> = {
  "left-down": "left",
  balanced: "balanced",
  "right-down": "right",
};

const COUNTED = "already counted";

export const totalXp = (awards: readonly Award[]): number =>
  awards.reduce((sum, a) => sum + a.xp, 0);

const none = (): AwardResult => ({ granted: [], rejected: [] });

export const award = (event: LabEvent, state: RuleState): AwardResult => {
  if (event.epoch < state.epoch) return none();
  const have = new Set(state.awards.map((a) => a.awardId));
  const result = none();

  const grant = (
    ruleId: Award["ruleId"],
    key: string,
    reason: string,
    gate?: { ok: boolean; why: string },
  ): boolean => {
    const awardId = `${ruleId}|${key}`;
    if (gate && !gate.ok) {
      result.rejected.push({ ruleId, reason: gate.why });
      return false;
    }
    if (have.has(awardId)) {
      result.rejected.push({ ruleId, reason: COUNTED });
      return false;
    }
    have.add(awardId);
    result.granted.push({
      awardId,
      ruleId,
      xp: XP[ruleId],
      reason,
      triggeredBy: event.seq,
    });
    return true;
  };

  switch (event.type) {
    case "move_applied": {
      const { challengeId, promptId, attempt } = event;
      if (event.setup || !challengeId || !promptId || attempt === undefined)
        return result;
      let lockAt = -1;
      state.events.forEach((e, n) => {
        if (
          e.type === "prediction_locked" &&
          e.challengeId === challengeId &&
          e.promptId === promptId &&
          e.attempt === attempt
        )
          lockAt = n;
      });
      const locked = state.events[lockAt];
      if (locked?.type !== "prediction_locked") return result;
      const voided = state.events
        .slice(lockAt + 1)
        .some(
          (e) =>
            e.type === "prediction_voided" &&
            e.challengeId === challengeId &&
            e.promptId === promptId &&
            e.attempt === attempt,
        );
      if (voided) return result;
      const key = `${challengeId}|${promptId}`;
      if (!have.has(`lock|${key}`)) {
        grant("lock", key, "prediction locked");
        if (outcomeOf[locked.choice] === event.outcome)
          grant("match", key, "prediction matched");
      } else if (
        !have.has(`match|${key}`) &&
        !have.has(`comeback|${key}`) &&
        event.outcome === (challengeById(challengeId)?.goal ?? "balanced")
      ) {
        grant("comeback", key, "comeback: you corrected your prediction");
      }
      return result;
    }
    case "challenge_complete":
      grant("complete", event.challengeId, "challenge complete");
      return result;
    case "explanation_submitted": {
      const done = have.has(`complete|${event.challengeId}`);
      grant("explain", event.challengeId, "explained why", {
        ok: done || have.has(`explain|${event.challengeId}`),
        why: "complete the challenge first",
      });
      return result;
    }
    case "ask_peer_used":
      grant("askPeer", event.challengeId, "asked a peer");
      return result;
    default:
      return result;
  }
};
