import { BOT_NAMES, type SimulationSnapshot } from "@kestrel/contracts";
import { formatInt, formatNm, turning, verdictText } from "./measure";
import styles from "../App.module.css";

/** Readable 2D view of the same experiment when WebGL cannot start. */
export function FlatLab({
  simulation,
  onOpenWeight,
  weightButtons,
}: {
  simulation: SimulationSnapshot;
  onOpenWeight: (side: "left" | "right") => void;
  weightButtons: React.MutableRefObject<Record<"left" | "right", HTMLButtonElement | null>>;
}) {
  const world = simulation.world;
  const t = turning(world);
  const tilt = t.state === "balanced" ? 0 : Math.max(-6, Math.min(6, ((t.left - t.right) / Math.max(t.left, t.right)) * 11));
  const x = (cm: number) => 300 + cm * 5.4;
  return (
    <div className={styles.flat} role="region" aria-label="Flat view of the lab">
      <p className={styles.flatNote}>
        The 3D lab could not start on this device, so this is a flat view of the same experiment. Every control still works.
      </p>
      <svg viewBox="0 0 600 230" className={styles.flatSvg} aria-hidden="true">
        <rect x="40" y="170" width="520" height="16" rx="8" fill="var(--porcelain)" stroke="var(--cobalt)" strokeWidth="3" />
        <path d="M282 170 L318 170 L303 118 L297 118 Z" fill="var(--cobalt)" />
        <g transform={`rotate(${tilt} 300 112)`}>
          <rect x="40" y="104" width="520" height="16" rx="4" fill="var(--maple)" />
          {Array.from({ length: 19 }, (_, i) => (i - 9) * 5).map((cm) => (
            <rect key={cm} x={x(cm) - 1} y={104} width={2} height={cm % 10 === 0 ? 9 : 5} fill="#3b2a14" />
          ))}
          <rect x={x(-world.leftCm) - 17} y={70} width={34} height={34} rx="6" fill="var(--brass)" />
          <rect x={x(world.rightCm) - 13} y={78} width={26} height={26} rx="5" fill="var(--brass)" />
        </g>
      </svg>
      <div className={styles.flatGrid}>
        {(["left", "right"] as const).map((side) => {
          const grams = side === "left" ? world.leftGrams : world.rightGrams;
          const cm = side === "left" ? world.leftCm : world.rightCm;
          return (
            <div key={side} className={styles.flatWeight}>
              <span>
                {side === "left" ? "Left" : "Right"} weight · <span className="num">{grams}</span> g
              </span>
              <button
                type="button"
                ref={(el) => {
                  weightButtons.current[side] = el;
                }}
                className={styles.position}
                aria-label={`${side === "left" ? "Left" : "Right"} weight, ${cm} cm from the pivot. Change position`}
                onClick={() => onOpenWeight(side)}
              >
                <span className="num">{cm}</span> cm
              </button>
              <span className="num">
                {formatInt(side === "left" ? t.left : t.right)} g·cm · {formatNm(side === "left" ? t.leftNm : t.rightNm)} N·m
              </span>
            </div>
          );
        })}
        <p className={styles.verdict} data-state={t.state}>
          {verdictText(t.state)}
        </p>
        <ul className={styles.flatBots}>
          {(["pip", "nova"] as const).map((id) => (
            <li key={id} data-bot={id}>
              <span className={styles.dot} aria-hidden="true" /> {BOT_NAMES[id]} · {simulation.bots[id].status}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
