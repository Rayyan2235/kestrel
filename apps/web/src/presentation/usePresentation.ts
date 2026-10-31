import type { LedgerEvent } from "@kestrel/contracts";
import { useEffect, useRef, useState } from "react";
import { createDirector, makeBeat, type Snapshot } from "./director.js";

type PresentationOptions = {
  paused: boolean;
  /** 0.5 or 1. Scales dwell, gap and capsule only; never model timeouts. */
  speed: number;
  reducedMotion: boolean;
};

const TICK_MS = 50;

/**
 * Feeds ledger events to the director and advances it with wall-clock time
 * (Date.now deltas, so a fake clock works). Pause freezes it; the ledger,
 * coordinator and rail are not affected.
 */
export function usePresentation(
  ledger: readonly LedgerEvent[],
  { paused, speed, reducedMotion }: PresentationOptions,
) {
  const [dir] = useState(createDirector);
  const [snap, setSnap] = useState<Snapshot>(() => dir.snapshot());
  const processed = useRef(0);
  const firstId = useRef<string | null>(null);
  const live = useRef({ paused, speed });
  live.current = { paused, speed };

  const refresh = () => {
    const next = dir.snapshot();
    setSnap((prev) => (prev.key === next.key ? prev : next));
  };

  useEffect(() => {
    // A reset replaces the ledger: its first event id changes.
    if (processed.current > 0 && ledger[0]?.id !== firstId.current) {
      dir.clear();
      processed.current = 0;
    }
    firstId.current = ledger[0]?.id ?? null;
    for (const e of ledger.slice(processed.current)) {
      if (e.kind === "learner") dir.dropPills();
      else if (e.from !== "you") dir.enqueue(makeBeat(e, reducedMotion));
    }
    processed.current = ledger.length;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, reducedMotion]);

  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (live.current.paused) return;
      dir.advance(dt * live.current.speed);
      refresh();
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...snap,
    /** Stop or Reset: nothing waiting survives and the current bubble fades. */
    interrupt: () => {
      dir.interrupt();
      refresh();
    },
  };
}
