// Adapted from Arc UI (MIT), © 2026 Elia Kuratli. See ./LICENSE.
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { ChevronDown } from "lucide-react";
import styles from "./ArcControls.module.css";

/** Arc's width-aware press feedback, pared down for this page's fixed labels. */
export function ArcButton({
  children,
  className = "",
  ...props
}: HTMLMotionProps<"button">) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type="button"
      className={`${styles.button} ${className}`}
      whileTap={
        reduced || props.disabled
          ? undefined
          : { scale: (ref.current?.offsetWidth ?? 0) > 220 ? 0.985 : 0.97 }
      }
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Arc's question/chevron/content composition with dependency-free native disclosure. */
export function ArcAccordion({
  items,
}: {
  items: { title: string; content: ReactNode }[];
}) {
  return (
    <div className={styles.accordion}>
      {items.map((item) => (
        <details
          name="welcome-questions"
          key={item.title}
          className={styles.item}
        >
          <summary className={styles.trigger}>
            {item.title}
            <ChevronDown size={20} aria-hidden="true" />
          </summary>
          <div className={styles.answer}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}
