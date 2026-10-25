import { LearnerIdSchema, ObjectiveIdSchema, ProgressSchema, type Attempt, type ObjectiveId } from "@kestrel/contracts";
import type { SimStatus } from "../simulation/duckSim";
import { balanceSnapshot } from "./agentSession";

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

/** Objectives earned in this browser and on the server (Tiger Data), merged. */
export async function loadEarned(): Promise<ObjectiveId[]> {
  const local = localEarned();
  try {
    const response = await fetch(`/api/progress/${learnerId()}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return local;
    const merged = [...new Set([...local, ...ProgressSchema.parse(await response.json()).earned])];
    saveEarned(merged);
    return merged;
  } catch {
    return local;
  }
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
