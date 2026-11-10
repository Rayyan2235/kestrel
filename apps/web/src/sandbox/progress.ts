import {
  LearnerIdSchema,
  ObjectiveIdSchema,
  ProgressSchema,
  XpAwardSchema,
  XpTotalsSchema,
  type Attempt,
  type ObjectiveId,
  type Prediction,
  type SubmitAttempt,
  type XpAward,
  type XpEvent,
  type XpTotals,
} from "@kestrel/contracts";
import type { SimStatus } from "../simulation/duckSim";
import { balanceSnapshot } from "./agentSession";
import { serverHealth } from "./health";

const LEARNER_KEY = "kestrel.learner";
const EARNED_KEY = "kestrel.progress.earned";
const EarnedSchema = ObjectiveIdSchema.array();

// Progress is a nice-to-have: storage or network failures never reach the lab.
let tabLearner: string | null = null;
/** An anonymous ID kept in this browser. Without storage it lasts for the tab. */
export function learnerId(): string {
  try {
    const saved = localStorage.getItem(LEARNER_KEY);
    if (saved && LearnerIdSchema.safeParse(saved).success) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(LEARNER_KEY, id);
    return id;
  } catch {
    return (tabLearner ??= crypto.randomUUID());
  }
}

function localEarned(): ObjectiveId[] {
  try {
    const parsed = EarnedSchema.safeParse(JSON.parse(localStorage.getItem(EARNED_KEY) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
function saveEarned(ids: Iterable<ObjectiveId>) {
  try {
    localStorage.setItem(EARNED_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* Kept on the server only, if at all. */
  }
}

/**
 * Objectives earned in this browser and on the server, merged, plus XP and level from the
 * server's ledger. `totals` is null when the server has no ledger: the board then counts
 * XP locally and says "offline".
 */
export async function loadProgress(): Promise<{ earned: ObjectiveId[]; totals: XpTotals | null }> {
  const local = localEarned();
  try {
    const response = await fetch(`/api/progress/${learnerId()}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { earned: local, totals: null };
    const server = ProgressSchema.parse(await response.json());
    const merged = [...new Set([...local, ...server.earned])];
    saveEarned(merged);
    return { earned: merged, totals: server.xp === undefined || server.level === undefined ? null : { xp: server.xp, level: server.level } };
  } catch {
    return { earned: local, totals: null };
  }
}

/** Objectives earned in this browser and on the server, merged. */
export async function loadEarned(): Promise<ObjectiveId[]> {
  return (await loadProgress()).earned;
}

async function post(url: string, body: object): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerId: learnerId(), ...body }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/*
 * The XP ledger. Where the server runs its verifier (AWS), the browser submits
 * its decision for Moments prompts and verified objectives, and the verifier
 * decides and awards (submitForVerdict). Elsewhere, and for objectives without
 * a verifier yet, the browser reports what the simulator measured, and the
 * server stamps the times, sets the XP and refuses repeats (awardXp).
 * Every call resolves to null when the ledger is offline or refuses.
 */

/** Whether the server's verifier awards prompts and verified objectives. */
export async function verifiedXp(): Promise<boolean> {
  return (await serverHealth()).verifiedXp === true;
}

/** This learner's XP and level from the server, or null offline. */
export async function xpTotals(): Promise<XpTotals | null> {
  try {
    const response = await fetch(`/api/xp/${learnerId()}`, { signal: AbortSignal.timeout(5000) });
    const parsed = XpTotalsSchema.safeParse(response.ok ? await response.json() : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const VERDICT_POLL_MS = 1500;
const VERDICT_WAIT_MS = 20000;

/**
 * Submit a decision to the verifier, then wait for its XP to land: totals are
 * polled until they change, or for up to 20 s (a wrong prediction may earn
 * nothing). Null when the server would not take the submission.
 */
export async function submitForVerdict(
  submission: SubmitAttempt extends infer T ? (T extends unknown ? Omit<T, "learnerId"> : never) : never,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ before: XpTotals; after: XpTotals } | null> {
  const before = await xpTotals();
  const r = (await post("/api/attempts/submit", submission)) as { attemptId?: string } | null;
  if (!before || !r?.attemptId) return null;
  let after = before;
  for (let waited = 0; waited < VERDICT_WAIT_MS && after.xp === before.xp; waited += VERDICT_POLL_MS) {
    await sleep(VERDICT_POLL_MS);
    after = (await xpTotals()) ?? after;
  }
  return { before, after };
}

/** Lock a prediction before the trial; the server stamps the time. */
export async function lockPrediction(promptId: string, value: Prediction): Promise<string | null> {
  const r = (await post("/api/locks", { challengeId: "moments", promptId, value })) as { lockId?: string } | null;
  return r?.lockId ?? null;
}

/** Start a trial under a lock; the server stamps the time. */
export async function startTrial(lockId: string): Promise<string | null> {
  const r = (await post("/api/attempts/start", { lockId })) as { attemptId?: string } | null;
  return r?.attemptId ?? null;
}

/** Ask for an award. Repeats come back with awarded: false. */
export async function awardXp(event: Omit<XpEvent, "learnerId">): Promise<XpAward | null> {
  const parsed = XpAwardSchema.safeParse(await post("/api/xp-events", event));
  return parsed.success ? parsed.data : null;
}

/** Record an attempt locally and on the server, without waiting or failing. */
export async function logAttempt(attempt: Omit<Attempt, "learnerId">): Promise<void> {
  if (attempt.ok) saveEarned([...localEarned(), attempt.objective]);
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerId: learnerId(), ...attempt }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* The localStorage copy stands. */
  }
}

/** The beam as measured: its tilt and how far each side's weight sits from the pivot. Null without a beam. */
export function beamReading(status: SimStatus): Pick<Attempt, "tiltDeg" | "leftCm" | "rightCm"> {
  if (!status.balance) return { tiltDeg: null, leftCm: null, rightCm: null };
  const b = balanceSnapshot(status.balance);
  const at = (side: "left" | "right") => b.weights.find((w) => w.side === side)?.cm ?? null;
  return { tiltDeg: b.tiltDeg, leftCm: at("left"), rightCm: at("right") };
}
