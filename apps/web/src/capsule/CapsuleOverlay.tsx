import type { LedgerEvent } from "@kestrel/contracts";
import { ArrowDownToLine, ClipboardCheck } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Anchors, Point } from "../bubbles/BubbleLayer.js";
import { planCapsule, type CapsulePlan } from "./model.js";
import styles from "./CapsuleOverlay.module.css";

/** Where a handback lands: the command dock under the stage. */
export const DOCK_POINT: Point = { x: 50, y: 108 };
/** How long a landed capsule stays visible before the overlay returns to idle. */
const LINGER_MS = 900;

type Active = { plan: CapsulePlan; event: LedgerEvent; landed: boolean };

const pointOf = (who: LedgerEvent["to"], anchors: Anchors): Point =>
  who === "you" ? DOCK_POINT : anchors[who];

/**
 * One capsule per handoff/handback ledger event. Timing comes from
 * planCapsule(), so a fake clock drives it deterministically.
 * Reduced motion: no flight element, a still glyph beside the speaker.
 */
export function CapsuleOverlay({
  ledger,
  anchors,
  reducedMotion,
}: {
  ledger: readonly LedgerEvent[];
  anchors: Anchors;
  reducedMotion: boolean;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const seen = useRef<string | null>(null);
  const token = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = ledger.at(-1);
    if (!last) {
      seen.current = null;
      setActive(null);
      return;
    }
    if (last.id === seen.current) return;
    seen.current = last.id;
    const plan = planCapsule(last, { reducedMotion });
    if (!plan) return;
    setActive({ plan, event: last, landed: false });
    const land = window.setTimeout(
      () => setActive((a) => (a ? { ...a, landed: true } : a)),
      plan.durationMs,
    );
    const clear = window.setTimeout(
      () => setActive(null),
      plan.durationMs + LINGER_MS,
    );
    return () => {
      window.clearTimeout(land);
      window.clearTimeout(clear);
    };
  }, [ledger, reducedMotion]);

  useEffect(() => {
    if (!active || reducedMotion || active.landed) return;
    const el = token.current;
    if (!el || typeof el.animate !== "function") return;
    const from = pointOf(active.event.from, anchors);
    const to = pointOf(active.event.to, anchors);
    const travel = active.plan.phases.find((p) => p.name === "travel");
    if (!travel) return;
    const arcY = Math.min(from.y, to.y) - 14;
    const anim = el.animate(
      [
        { left: `${from.x}%`, top: `${from.y - 10}%` },
        { left: `${(from.x + to.x) / 2}%`, top: `${arcY}%` },
        { left: `${to.x}%`, top: `${to.y - 10}%` },
      ],
      {
        delay: travel.startMs,
        duration: travel.endMs - travel.startMs,
        easing: "ease-in-out",
        fill: "both",
      },
    );
    return () => anim.cancel();
  }, [active, anchors, reducedMotion]);

  if (!active) {
    return reducedMotion ? null : (
      <div className={styles.overlay} data-testid="capsule" data-state="idle" />
    );
  }
  const { plan, event } = active;
  const Icon = plan.kind === "handoff" ? ClipboardCheck : ArrowDownToLine;
  const label = plan.kind === "handoff" ? "Check my reading" : "Back to you";
  const body = (
    <>
      <Icon size={16} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      {event.evidence && (
        <span className={styles.evidence}>{event.evidence}</span>
      )}
    </>
  );

  if (reducedMotion) {
    const at = anchors[event.from as keyof Anchors];
    return (
      <div className={styles.overlay}>
        <div
          className={`${styles.token} ${styles.still}`}
          data-testid="capsule-glyph"
          data-kind={plan.kind}
          data-glyph-only="true"
          style={{ left: `${at.x}%`, top: `${at.y - 10}%` } as CSSProperties}
        >
          {body}
        </div>
      </div>
    );
  }
  const start = pointOf(event.from, anchors);
  return (
    <div
      className={styles.overlay}
      data-testid="capsule"
      data-state={active.landed ? "landed" : "flying"}
      data-kind={plan.kind}
      data-from={event.from}
      data-to={event.to}
      data-duration-ms={plan.durationMs}
    >
      <div
        ref={token}
        className={`${styles.token} ${active.landed ? styles.landed : ""}`}
        style={
          { left: `${start.x}%`, top: `${start.y - 10}%` } as CSSProperties
        }
      >
        {body}
      </div>
    </div>
  );
}
