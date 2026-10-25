import type { LedgerEvent } from "@kestrel/contracts";
import { ArrowDownToLine, ClipboardCheck } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import type { Anchors, Point } from "../bubbles/BubbleLayer.js";
import type { Beat, CapsuleState } from "../presentation/director.js";
import styles from "./CapsuleOverlay.module.css";

/** Where a handback lands: the command dock under the stage. */
export const DOCK_POINT: Point = { x: 50, y: 108 };

const pointOf = (who: LedgerEvent["to"], anchors: Anchors): Point =>
  who === "you" ? DOCK_POINT : anchors[who];

/**
 * Draws the capsule of the beat the presentation director is showing. State
 * (idle, flying, landed) comes from the director, so pause, speed and a fake
 * clock all apply. Reduced motion: a still glyph beside the speaker, no flight.
 */
export function CapsuleOverlay({
  beat,
  state,
  anchors,
  reducedMotion,
  paused,
  speed,
}: {
  beat: Beat | null;
  state: CapsuleState;
  anchors: Anchors;
  reducedMotion: boolean;
  paused: boolean;
  speed: number;
}) {
  const token = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const plan = beat?.capsule ?? null;
  const event = beat?.event ?? null;
  const live = useRef({ paused, speed });
  live.current = { paused, speed };

  // One flight per beat; the director decides when it is over.
  const beatId = event?.id ?? null;
  useEffect(() => {
    anim.current = null;
    const el = token.current;
    if (!el || !plan || !event || reducedMotion) return;
    if (typeof el.animate !== "function") return;
    const travel = plan.phases.find((p) => p.name === "travel");
    if (!travel) return;
    const from = pointOf(event.from, anchors);
    const to = pointOf(event.to, anchors);
    const a = el.animate(
      [
        { left: `${from.x}%`, top: `${from.y - 10}%` },
        {
          left: `${(from.x + to.x) / 2}%`,
          top: `${Math.min(from.y, to.y) - 14}%`,
        },
        { left: `${to.x}%`, top: `${to.y - 10}%` },
      ],
      {
        delay: travel.startMs,
        duration: travel.endMs - travel.startMs,
        easing: "ease-in-out",
        fill: "both",
      },
    );
    a.playbackRate = live.current.speed;
    if (live.current.paused) a.pause();
    anim.current = a;
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, reducedMotion]);

  useEffect(() => {
    const a = anim.current;
    if (!a) return;
    a.playbackRate = speed;
    if (paused) a.pause();
    else a.play();
  }, [paused, speed]);

  if (reducedMotion) {
    if (!plan || !event || state === "idle" || event.from === "you")
      return null;
    const at = anchors[event.from];
    return (
      <div className={styles.overlay}>
        <div
          className={`${styles.token} ${styles.still}`}
          data-testid="capsule-glyph"
          data-kind={plan.kind}
          data-glyph-only="true"
          style={{ left: `${at.x}%`, top: `${at.y - 10}%` } as CSSProperties}
        >
          <Body kind={plan.kind} evidence={event.evidence} />
        </div>
      </div>
    );
  }
  if (!plan || !event || state === "idle")
    return (
      <div className={styles.overlay} data-testid="capsule" data-state="idle" />
    );
  const start = pointOf(event.from, anchors);
  return (
    <div
      className={styles.overlay}
      data-testid="capsule"
      data-state={state}
      data-kind={plan.kind}
      data-from={event.from}
      data-to={event.to}
      data-duration-ms={plan.durationMs}
    >
      <div
        ref={token}
        className={`${styles.token} ${state === "landed" ? styles.landed : ""}`}
        style={
          { left: `${start.x}%`, top: `${start.y - 10}%` } as CSSProperties
        }
      >
        <Body kind={plan.kind} evidence={event.evidence} />
      </div>
    </div>
  );
}

function Body({
  kind,
  evidence,
}: {
  kind: "handoff" | "handback";
  evidence?: string;
}) {
  const Icon = kind === "handoff" ? ClipboardCheck : ArrowDownToLine;
  return (
    <>
      <Icon size={16} aria-hidden="true" />
      <span className={styles.label}>
        {kind === "handoff" ? "Check my reading" : "Back to you"}
      </span>
      {evidence && <span className={styles.evidence}>{evidence}</span>}
    </>
  );
}
