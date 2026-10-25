import { useState } from "react";
import type { LessonId } from "./lessonContent";
import { LESSON_BOOK } from "./lessonContent";
import styles from "./Lessons.module.css";

export type LessonMeasurements = {
  filledSlots: string[];
  totalSlots: number;
  leftMoment: number;
  rightMoment: number;
  tiltDeg: number;
};

export function LessonBookOverlay({ lesson, measurements, onClose, onDemonstrate }: {
  lesson: LessonId;
  measurements: LessonMeasurements;
  onClose: () => void;
  onDemonstrate: () => void;
}) {
  const book = LESSON_BOOK[lesson];
  const [page, setPage] = useState(0);
  const current = book.pages[page]!;
  const last = page === book.pages.length - 1;
  return (
    <div className={styles.scrim} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={styles.book} role="dialog" aria-modal="true" aria-labelledby="lesson-book-title">
        <header className={styles.head}>
          <div><span className={styles.kicker}>LESSON BOOK · {lesson === "pythagoras" ? "MATHS" : "PHYSICS"}</span><h2 id="lesson-book-title">{book.title}</h2></div>
          <button className={styles.close} aria-label="Close lesson book" onClick={onClose}>×</button>
        </header>
        <div className={styles.page} key={page}>
          <div className={styles.pageNumber}>PAGE {page + 1} / {book.pages.length}</div>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
          {current.formula && <div className={styles.formula}>{current.formula}</div>}
          {lesson === "pythagoras" ? (
            <figure className={styles.graph} aria-label={`Square placement: ${measurements.filledSlots.length} of ${measurements.totalSlots} slots filled`}>
              <svg viewBox="0 0 360 148" role="img" aria-label="Areas of the 3 by 3, 4 by 4 and 5 by 5 squares">
                <line x1="28" y1="119" x2="344" y2="119" className={styles.axis} />
                {[{ x: 72, h: 36, label: "9", side: "3×3", filled: measurements.filledSlots.includes("slot-b") }, { x: 174, h: 64, label: "16", side: "4×4", filled: measurements.filledSlots.includes("slot-a") }, { x: 276, h: 100, label: "25", side: "5×5", filled: measurements.filledSlots.includes("slot-c") }].map(bar => (
                  <g key={bar.side}>
                    <rect x={bar.x} y={119 - bar.h} width="52" height={bar.h} rx="7" className={bar.filled ? styles.barOn : styles.bar} />
                    <text x={bar.x + 26} y={112 - bar.h} textAnchor="middle">{bar.label}</text>
                    <text x={bar.x + 26} y="140" textAnchor="middle">{bar.side}</text>
                  </g>
                ))}
              </svg>
              <figcaption>Live placement: {measurements.filledSlots.length} / {measurements.totalSlots} squares in their slots · areas 9 + 16 = 25</figcaption>
            </figure>
          ) : (
            <figure className={styles.graph} aria-label="Measured moments and plank tilt">
              <div className={styles.momentRow}><span>Left moment · Pip</span><meter min="0" max="6000" value={measurements.leftMoment}>{measurements.leftMoment}</meter><b>{Math.round(measurements.leftMoment)} g·cm</b></div>
              <div className={styles.momentRow}><span>Right moment · Nova</span><meter min="0" max="6000" value={measurements.rightMoment}>{measurements.rightMoment}</meter><b>{Math.round(measurements.rightMoment)} g·cm</b></div>
              <div className={styles.tilt}>Measured plank tilt <strong>{measurements.tiltDeg.toFixed(1)}°</strong></div>
              <figcaption>Moment = mass × measured distance from the pivot. Values update with the experiment.</figcaption>
            </figure>
          )}
        </div>
        <footer className={styles.footer}>
          <button className={styles.secondary} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
          {last ? <button className={styles.primary} onClick={onDemonstrate}>Show the two-bot demonstration</button> : <button className={styles.primary} onClick={() => setPage(p => Math.min(book.pages.length - 1, p + 1))}>Next page</button>}
        </footer>
      </section>
    </div>
  );
}
