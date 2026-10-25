import { useEffect, useRef } from "react";
import { Bird, ChevronRight } from "lucide-react";
import { ArrowPill } from "../sandbox/gic";
import styles from "./WelcomePage.module.css";

/**
 * Swap the art here. The plate is one 9:8 still (2160×1920 fills the frame
 * exactly; anything else is cropped to cover). `video` is optional: a square
 * loop rendered from the plate mirror-padded 120/1920 top and bottom, laid
 * over it at 100% width, 112.5% height, top −6.25%.
 */
export const LANDING = {
  plate: "/landing/hero.jpg",
  video: null as string | null,
  cards: [
    { title: "Balance the beam", subject: "Physics · Moments", art: "/welcome/lab-pixel.png" },
    { title: "Build the right triangle", subject: "Maths · Pythagoras", art: "/welcome/companions.jpg" },
    { title: "Rescue Pip", subject: "Mission · Navigation", art: "/welcome/pip-pixel.png" },
  ],
};

function Play() {
  return (
    <svg className={styles.play} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  );
}

const RISE: Keyframe[] = [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }];
const SPRING_UP: Keyframe[] = [
  { opacity: 0, filter: "blur(12px)", transform: "translateY(40px) scale(.96)" },
  { opacity: 1, filter: "blur(0)", transform: "none" },
];
/** One entrance timeline: [selector, delay ms, keyframes]. */
const ENTRANCE: [string, number, Keyframe[]][] = [
  ["[data-in=nav]", 0, [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }]],
  ["[data-in=kicker]", 200, [{ opacity: 0, filter: "blur(10px)" }, { opacity: 1, filter: "blur(0)" }]],
  ["[data-in=line1]", 320, SPRING_UP],
  ["[data-in=line2]", 480, SPRING_UP],
  ["[data-in=sub]", 700, RISE],
  ["[data-in=cta]", 820, RISE],
  ["[data-in=row]", 960, RISE],
  ["[data-in=card]", 1060, [{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }]],
];

export function WelcomePage() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    document.title = "Kestrel — Learn physics with real robots";
    const el = root.current;
    if (!el) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let running: Animation[] = [];
    const stop = () => {
      running.forEach((a) => a.cancel());
      running = [];
      video.current?.pause();
    };
    const play = () => {
      if (media.matches) return stop();
      void video.current?.play().catch(() => {});
      for (const [selector, delay, frames] of ENTRANCE) {
        const line = selector.includes("line");
        el.querySelectorAll<HTMLElement>(selector).forEach((node, i) => {
          running.push(
            node.animate(frames, {
              duration: line ? 900 : 650,
              delay: delay + i * 120,
              easing: line ? "cubic-bezier(.34,1.4,.64,1)" : "cubic-bezier(.22,1,.36,1)",
              fill: "backwards",
            }),
          );
        });
      }
    };
    play();
    media.addEventListener("change", play);
    return () => {
      media.removeEventListener("change", play);
      stop();
    };
  }, []);

  return (
    <div className={`gic-root ${styles.page}`} ref={root}>
      <section className={styles.hero} aria-label="Kestrel">
        <div className={styles.scene} aria-hidden="true">
          <img className={styles.plate} src={LANDING.plate} alt="" />
          {LANDING.video && <video ref={video} className={styles.video} src={LANDING.video} muted loop playsInline />}
        </div>

        <header className={styles.nav} data-in="nav">
          <a className={styles.logo} href="/" aria-label="Kestrel home">
            <Bird size={26} strokeWidth={2} aria-hidden="true" />
            Kestrel
          </a>
          <nav className={`gic-nav ${styles.links}`} aria-label="Sections">
            <a href="#objectives">Objectives</a>
            <a href="/console">Playground</a>
            <a href="#objectives">Pip &amp; Nova</a>
          </nav>
          <a className={`gic-btn gic-btn--solid ${styles.join}`} href="/console">
            <span className="body">Open console</span>
            <ArrowPill />
          </a>
        </header>

        <div className={styles.copy}>
          <p className={styles.kicker} data-in="kicker">
            KESTREL
          </p>
          <h1 className={styles.headline}>
            <span data-in="line1">Real robots.</span>
            <span data-in="line2">Real physics.</span>
          </h1>
          <p className={styles.sub} data-in="sub">
            Tell Pip and Nova what to do and watch them balance beams, build triangles and find their way home in a
            simulated playground. For ages 13 to 16.
          </p>
          <div className={styles.cta} data-in="cta">
            <a className={`gic-btn gic-btn--solid ${styles.primary}`} href="/console">
              <span className="body">Open the playground</span>
              <ArrowPill />
            </a>
            <a className={`gic-btn gic-btn--glass ${styles.glass}`} href="/console">
              <Play />
              <span className="body">Watch preview</span>
            </a>
          </div>
        </div>

        <div className={styles.row} id="objectives">
          <h2 className={styles.rowTitle} data-in="row">
            OBJECTIVES
          </h2>
          <a className={styles.browse} href="/console" data-in="row">
            open the playground <ChevronRight size={18} aria-hidden="true" />
          </a>
          <ul className={styles.cards}>
            {LANDING.cards.map((c) => (
              <li key={c.title} data-in="card">
                <a className={styles.card} href="/console">
                  <img src={c.art} alt="" />
                  <span className={`gic-toast ${styles.cardLabel}`}>
                    <small>{c.subject}</small>
                    {c.title}
                  </span>
                  <Play />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
