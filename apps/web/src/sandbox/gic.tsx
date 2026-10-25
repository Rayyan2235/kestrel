import type { ButtonHTMLAttributes, ReactNode } from "react";
import "@fontsource-variable/inter/index.css";
import "./gic.css";

// React port of the General Intelligence Company components the console uses
// (ArrowPill, Button) from the owner's design-system artifact bundle.

/** The pixel-art arrow, exactly as the design system draws it. */
function Arrow() {
  const cells: [number, number, number][] = [
    [3.385, 4.3923, 1.2131],
    [0.971, 1.9745, 1.2131],
    [0.971, 6.8122, 1.2131],
  ];
  return (
    <svg width="6" height="10" viewBox="0 0 6 10" aria-hidden="true">
      {cells.map(([x, y, h]) => (
        <rect key={`${x},${y}`} x={x} y={y} width="1.2131" height={h} fill="currentColor" />
      ))}
      <rect x="2.1696" y="3.179" width="1.2131" height="3.6392" fill="currentColor" />
    </svg>
  );
}

/** Every forward action ends with one. Decorative: the button's label is announced. */
export function ArrowPill({ tone = "light" }: { tone?: "light" | "ink" }) {
  return (
    <span className={tone === "ink" ? "gic-pill gic-pill--ink" : "gic-pill"} aria-hidden="true">
      <Arrow />
    </span>
  );
}

type Variant = "solid" | "glass" | "link" | "quiet";

export function Button({
  variant = "link",
  arrow,
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  arrow?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const onDark = variant === "solid" || variant === "glass";
  const showArrow = arrow ?? variant !== "quiet";
  return (
    <button type="button" {...rest} className={["gic-btn", `gic-btn--${variant}`, className].filter(Boolean).join(" ")}>
      <span className={variant === "quiet" ? "label" : "body"}>{children}</span>
      {showArrow && <ArrowPill tone={onDark ? "light" : "ink"} />}
    </button>
  );
}
