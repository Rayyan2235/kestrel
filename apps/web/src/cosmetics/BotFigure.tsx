import { BOT_NAMES, type BotId, type BotLook } from "@kestrel/contracts";
import type { CSSProperties, ReactNode } from "react";
import demo from "../demo/TwoBotDemo.module.css";
import { lookStyle } from "./dom.js";
import own from "./BotFigure.module.css";

/**
 * The stage bot, also used (larger, static) by the Workshop. Keeps
 * data-testid="bot-{id}", data-shape (identity glyph) and the name tag.
 * With no `look` the figure renders exactly as before.
 */
export function BotFigure({
  id,
  look,
  size,
  attrs,
  style,
  children,
}: {
  id: BotId;
  look?: BotLook;
  /** Workshop preview: a static, scaled figure instead of a stage-positioned one. */
  size?: number;
  attrs?: Record<string, string>;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const dom = look ? lookStyle(look) : null;
  const sized = size
    ? ({ "--figure-size": `${size}px` } as CSSProperties)
    : undefined;
  return (
    <div
      className={`${demo.bot} ${size ? own.static : ""}`}
      data-testid={`bot-${id}`}
      data-bot={id}
      data-shape={id}
      {...attrs}
      {...dom?.data}
      style={{ ...style, ...dom?.style, ...sized }}
    >
      <span className={demo.eyes} aria-hidden="true">
        <i />
        <i />
      </span>
      <span className={demo.tag}>{BOT_NAMES[id]}</span>
      {children}
    </div>
  );
}
