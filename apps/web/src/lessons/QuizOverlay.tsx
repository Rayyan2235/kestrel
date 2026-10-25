import { useState } from "react";
import type { QuizQuestion } from "./lessonContent";
import { makeQuizQuestions } from "./lessonContent";
import styles from "./Lessons.module.css";

export function QuizOverlay({ questions: suppliedQuestions, onComplete, onClose, onFollowUp }: {
  questions?: QuizQuestion[];
  onComplete: (score: number, total: number) => void;
  onClose: () => void;
  onFollowUp: (question: string) => void;
}) {
  const [questions] = useState(() => suppliedQuestions ?? makeQuizQuestions());
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [complete, setComplete] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const question = questions[index];
  const answer = (choice: number) => {
    if (answered || !question) return;
    setSelected(choice);
    setAnswered(true);
    if (choice === question.answer) setScore(s => s + 1);
  };
  const next = () => {
    if (!answered) return;
    if (index + 1 === questions.length) {
      const finalScore = score + (selected === question?.answer ? 1 : 0);
      setComplete(true);
      onComplete(finalScore, questions.length);
      return;
    }
    setIndex(i => i + 1);
    setSelected(null);
    setAnswered(false);
  };
  return (
    <div className={styles.scrim}>
      <section className={styles.quiz} role="dialog" aria-modal="true" aria-labelledby="quiz-title">
        <header className={styles.head}>
          <div><span className={styles.kicker}>CHECK WHAT YOU KNOW · MATHS + PHYSICS</span><h2 id="quiz-title">{complete ? "Quiz complete" : "Two-part lesson quiz"}</h2></div>
          <div className={styles.progress}>{complete ? `${score} / ${questions.length}` : `${index + 1} / ${questions.length}`}</div>
        </header>
        {complete ? (
          <div className={styles.question}>
            <h3>You got {score} of {questions.length} right.</h3>
            <p>Your answers are saved for this session. Ask Pip or Nova about any question you want to revisit.</p>
            <label className={styles.followUp}>Ask Pip or Nova about a question
              <input value={followUp} onChange={e => setFollowUp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && followUp.trim()) onFollowUp(followUp.trim()); }} placeholder="What should I look at again?" />
            </label>
            <div className={styles.footer}>
              <button className={styles.secondary} onClick={() => onFollowUp(followUp.trim() || "Can you explain one of the quiz answers?")}>Ask a follow-up</button>
              <button className={styles.primary} onClick={onClose}>Return to the lab</button>
            </div>
          </div>
        ) : question && (
          <div className={styles.question}>
            <div className={styles.subject}>{question.subject}</div>
            <h3>{question.prompt}</h3>
            <div className={styles.choices}>
              {question.choices.map((choice, i) => <button key={choice} className={selected === i ? (i === question.answer ? styles.correct : styles.incorrect) : styles.choice} onClick={() => answer(i)} disabled={answered}>{choice}</button>)}
            </div>
            {answered && <p className={selected === question.answer ? styles.feedbackGood : styles.feedback}>{selected === question.answer ? "That's right. " : "Not quite. "}{question.explain}</p>}
            <footer className={styles.footer}>
              <span className={styles.progress}>{question.subject} question</span>
              <button className={styles.primary} onClick={next} disabled={!answered}>{index + 1 === questions.length ? "Finish quiz" : "Next question"}</button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
