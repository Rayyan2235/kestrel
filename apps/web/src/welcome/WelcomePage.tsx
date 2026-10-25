import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { balance, createWorld } from "@kestrel/contracts";
import { ArcAccordion, ArcButton } from "./arc/ArcControls";
import styles from "./WelcomePage.module.css";

function Eyes({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 34"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="62" height="32" rx="16" fill="currentColor" />
      <circle cx="20" cy="17" r="10" fill="var(--welcome-black)" />
      <circle cx="44" cy="17" r="10" fill="var(--welcome-black)" />
      <circle cx="22" cy="14" r="3" fill="currentColor" />
      <circle cx="46" cy="14" r="3" fill="currentColor" />
    </svg>
  );
}

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { y: 12 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      style={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.5 }}
    >
      {children}
    </motion.div>
  );
}

function BalanceExample() {
  const [cm, setCm] = useState(20);
  const world = { ...createWorld(), rightCm: cm };
  const result = balance(world);
  const angle = result === "balanced" ? 0 : result === "left" ? -9 : 9;
  return (
    <div className={styles.experiment} data-ui>
      <div className={styles.experimentTop}>
        <span>Try a little experiment</span>
        <span>Moments & balance</span>
      </div>
      <svg
        className={styles.beamDiagram}
        viewBox="0 0 600 270"
        role="img"
        aria-label={`Balance beam: ${result === "balanced" ? "balanced" : `${result} side down`}. Left weight 200 grams at 20 centimeters; right weight 100 grams at ${cm} centimeters.`}
      >
        <path d="M264 231 L300 154 L336 231 Z" fill="var(--welcome-purple)" />
        <rect
          x="248"
          y="231"
          width="104"
          height="9"
          rx="4"
          fill="var(--welcome-black)"
        />
        <g className={styles.beam} style={{ transform: `rotate(${angle}deg)` }}>
          <rect
            x="66"
            y="148"
            width="468"
            height="12"
            rx="6"
            fill="var(--welcome-black)"
          />
          {Array.from({ length: 19 }, (_, i) => (
            <path
              key={i}
              d={`M${84 + i * 24} 149 v${i % 2 === 0 ? 7 : 4}`}
              stroke="var(--welcome-mist)"
              strokeWidth="2"
            />
          ))}
          <rect
            x="180"
            y="97"
            width="48"
            height="50"
            rx="8"
            fill="var(--welcome-purple)"
          />
          <rect
            x={300 + cm * 4.8 - 18}
            y="113"
            width="36"
            height="34"
            rx="7"
            fill="var(--welcome-purple)"
          />
          <text x="204" y="78" textAnchor="middle">
            200 g
          </text>
          <text x={300 + cm * 4.8} y="94" textAnchor="middle">
            100 g
          </text>
        </g>
        <circle cx="300" cy="154" r="7" fill="var(--welcome-white)" />
      </svg>
      <div className={styles.demoControl}>
        <label htmlFor="welcome-distance">
          Move the lighter weight{" "}
          <output htmlFor="welcome-distance">{cm} cm</output>
        </label>
        <input
          id="welcome-distance"
          type="range"
          min="5"
          max="45"
          step="5"
          value={cm}
          onChange={(e) => setCm(Number(e.target.value))}
          aria-valuetext={`${cm} centimeters from the pivot`}
        />
        <div className={styles.rangeEnds}>
          <span>Closer to the pivot</span>
          <span>Farther away</span>
        </div>
      </div>
      <div className={styles.demoResult}>
        <p role="status" aria-live="polite" data-testid="welcome-result">
          {result === "balanced"
            ? "You found the balance."
            : result === "left"
              ? "The heavier side is winning."
              : "Distance makes the difference."}
        </p>
        <ArcButton onClick={() => setCm(cm === 40 ? 20 : 40)}>
          {cm === 40 ? "Try again" : "Try 40 cm"}
          <ArrowRight size={16} aria-hidden="true" />
        </ArcButton>
      </div>
      <p className={styles.demoNote}>
        Ideal beam example. Mass × distance sets the balance; tilt is
        illustrative.
      </p>
    </div>
  );
}

const questions = [
  {
    title: "Who is Kestrel for?",
    content: (
      <p>
        Kestrel is being built for learners aged 13–16 who want to explore
        science and maths by trying things. Teachers and parents can use the
        experiments as a starting point for questions and discussion.
      </p>
    ),
  },
  {
    title: "What can I try in the console?",
    content: (
      <p>
        The console includes a simulated Microduck robot, a Pythagoras
        experiment, a Moments setup, and free play. Ask a question by typing or
        holding the talk button, direct the robot, and stop or reset at any
        time.
      </p>
    ),
  },
  {
    title: "Are the robots using live AI?",
    content: (
      <p>
        Yes. With the server configured, the console uses Claude on Bedrock for
        conversation and actions, ElevenLabs for voice, and MuJoCo for robot
        physics. The illustrated companions on this page show our visual
        direction; the current console has one Microduck robot.
      </p>
    ),
  },
  {
    title: "Do I need a physical robot?",
    content: (
      <p>
        No. Kestrel’s console runs in your browser and needs WebGL to display
        the simulated lab. Voice and AI replies also need a configured server
        connection. You do not need a physical robot.
      </p>
    ),
  },
];

export function WelcomePage() {
  const [companion, setCompanion] = useState<"pip" | "nova">("pip");
  const reduced = useReducedMotion();
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced || preference.matches) return;
    const animations = Array.from(
      pageRef.current?.querySelectorAll<HTMLElement>("[data-entrance]") ?? [],
    ).map((element, index) =>
      element.animate(
        [
          { opacity: 0, transform: "translateY(18px)", filter: "blur(6px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        {
          duration: 700,
          delay: index * 100,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "backwards",
        },
      ),
    );
    const cancel = () => animations.forEach((animation) => animation.cancel());
    const onPreferenceChange = () => {
      if (preference.matches) cancel();
    };
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      cancel();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, [reduced]);
  return (
    <div className={styles.page} ref={pageRef}>
      <a className={styles.skip} href="#welcome-main">
        Skip to content
      </a>
      <header className={styles.header} data-entrance>
        <a href="/" className={styles.brand} aria-label="Kestrel home">
          <Eyes />
          kestrel<span className={styles.brandPeriod}>.</span>
        </a>
        <nav aria-label="Welcome navigation">
          <a href="#explore">Experiment</a>
          <a href="#companions">Our crew</a>
          <a href="#questions">Questions</a>
        </nav>
        <a href="/console" className={styles.navEntry}>
          Open console <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </header>
      <main id="welcome-main">
        <section className={styles.hero} aria-labelledby="welcome-title">
          <img
            className={styles.scene}
            src="/welcome/lab-pixel.png"
            alt="Two purple robot companions exploring a science workshop. Pixel-inspired concept illustration."
            width="1456"
            height="816"
            fetchPriority="high"
          />
          <div className={styles.heroCopy}>
            <h1 id="welcome-title">
              <span data-entrance>Big questions.</span>
              <span data-entrance>Little robots.</span>
            </h1>
            <div className={styles.heroSummary}>
              <p className={styles.intro} data-entrance>
                A science & maths lab for ages{" "}
                <span style={{ whiteSpace: "nowrap" }}>13–16</span>, where
                curious minds explore experiments with robot companions.
              </p>
              <div className={styles.heroActions} data-entrance>
                <a href="/console" className={styles.enter}>
                  Open console <ArrowUpRight size={21} aria-hidden="true" />
                </a>
                <a href="#explore" className={styles.secondary}>
                  Try an experiment <ArrowRight size={19} aria-hidden="true" />
                </a>
              </div>
              <p className={styles.previewNote} data-entrance>
                Open the lab. Ask a question. Try an experiment.
              </p>
            </div>
          </div>
          <div className={styles.chapters}>
            <div className={styles.chapterHeading} data-entrance>
              <h2>A little world of why.</h2>
              <a href="#explore">
                Take a look around <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
            <div className={styles.chapterRow}>
              <a
                className={`${styles.chapter} ${styles.balanceCard}`}
                href="#explore"
                data-entrance
              >
                <img
                  src="/welcome/lab-pixel.png"
                  alt=""
                  width="1456"
                  height="816"
                />
                <span>
                  <small>Try it yourself</small>
                  <strong>Find the balance.</strong>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a
                className={`${styles.chapter} ${styles.crewCard}`}
                href="#companions"
                data-entrance
              >
                <img
                  src="/welcome/pip-pixel.png"
                  alt=""
                  width="960"
                  height="1200"
                />
                <span>
                  <small>Meet the companions</small>
                  <strong>Say hello to Pip & Nova.</strong>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a
                className={`${styles.chapter} ${styles.previewCard}`}
                href="#questions"
                data-entrance
              >
                <img
                  src="/welcome/lab-pixel.png"
                  alt=""
                  width="1456"
                  height="816"
                />
                <span>
                  <small>Before you step inside</small>
                  <strong>Explore the console.</strong>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <p className={styles.artNote}>
              Illustrated lab concept · Open the working console inside.
            </p>
          </div>
        </section>

        <section
          id="explore"
          className={styles.explore}
          aria-labelledby="explore-title"
        >
          <Reveal className={styles.sectionCopy}>
            <h2 id="explore-title">
              Small change.
              <br />
              Big discovery.
            </h2>
            <p>
              What if the lighter weight moved farther out? Make a prediction.
              Try it. Let the result give you your next question.
            </p>
            <p className={styles.support}>
              That’s the idea behind Kestrel: a shared space to experiment,
              notice what changes, and work out why.
            </p>
          </Reveal>
          <BalanceExample />
        </section>

        <section
          id="companions"
          className={styles.companions}
          aria-labelledby="companions-title"
        >
          <div className={styles.companionArt}>
            <img
              src={
                companion === "pip"
                  ? "/welcome/pip-pixel.png"
                  : "/welcome/lab-pixel.png"
              }
              loading="lazy"
              width={companion === "pip" ? 960 : 1456}
              height={companion === "pip" ? 1200 : 816}
              alt={
                companion === "pip"
                  ? "Pip, a silver and purple binocular-eyed robot in a pixel-inspired portrait."
                  : "Nova, the upright purple robot in the science-workshop illustration."
              }
              className={companion === "pip" ? styles.pipCrop : styles.novaCrop}
            />
            <span className={styles.portraitCaption}>
              {companion === "pip"
                ? "Pip brings the questions."
                : "Nova checks the details."}
            </span>
          </div>
          <div className={styles.companionCopy}>
            <h2 id="companions-title">
              Two minds.
              <br />
              One experiment.
            </h2>
            <p>
              The vision: companions that explore alongside you, compare
              observations with each other, and keep the experiment at the heart
              of the conversation.
            </p>
            <div
              className={styles.companionChoices}
              role="group"
              aria-label="Meet the companions"
            >
              <button
                type="button"
                aria-pressed={companion === "pip"}
                onClick={() => setCompanion("pip")}
                onFocus={() => setCompanion("pip")}
              >
                <span>Pip</span>
                <span>“What should we try?”</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-pressed={companion === "nova"}
                onClick={() => setCompanion("nova")}
                onFocus={() => setCompanion("nova")}
              >
                <span>Nova</span>
                <span>“Let’s check what changed.”</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </button>
            </div>
            <p className={styles.prototypeNote}>
              Pip and Nova are our companion concept. The current console runs
              one Microduck robot.
            </p>
          </div>
        </section>

        <section
          id="for-you"
          className={styles.audience}
          aria-labelledby="audience-title"
        >
          <Reveal>
            <h2 id="audience-title">
              Made for
              <br />
              the curious.
            </h2>
            <p>
              You bring the “what if”.
              <br />
              Kestrel gives you a place to explore it.
            </p>
          </Reveal>
          <div className={styles.audienceDetails}>
            <div>
              <h3>For learners, ages 13–16</h3>
              <p>
                A place to connect the maths on the page with something you can
                change and observe. Start with a question, even if you don’t
                know the answer.
              </p>
            </div>
            <div>
              <h3>For teachers & parents</h3>
              <p>
                Use a shared experiment to start a conversation. Ask for a
                prediction, compare what happened, and let learners explain it
                in their own words.
              </p>
            </div>
          </div>
        </section>

        <section
          id="questions"
          className={styles.questions}
          aria-labelledby="questions-title"
        >
          <div>
            <h2 id="questions-title">
              Before you
              <br />
              step inside.
            </h2>
            <p>A few things to know before opening the console.</p>
          </div>
          <ArcAccordion items={questions} />
        </section>
        <section
          className={styles.invitation}
          aria-labelledby="invitation-title"
        >
          <Eyes />
          <h2 id="invitation-title">
            Bring your next
            <br />
            “what if”.
          </h2>
          <a href="/console" className={styles.enter}>
            Open console <ArrowUpRight size={21} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer className={styles.footer}>
        <a href="/" className={styles.brand}>
          <Eyes />
          kestrel.
        </a>
        <span>A little world of why.</span>
        <a href="#questions">About Kestrel</a>
      </footer>
    </div>
  );
}
