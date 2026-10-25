import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { BOT_NAMES, type BotId } from "@kestrel/contracts";
import { clampBox, resizeBox, snapMove, zoneAt, zoneBox, type Box, type Edge, type Size } from "../windows/geometry";
import { BotFace } from "./BotFace";
import styles from "../App.module.css";

const EDGES: readonly Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
// In the title bar these keep their click (from Open Space's useWindowDrag).
const INTERACTIVE = "button, input, textarea, select, a";
const STEP = 24;

/**
 * One bot's agent window, after Open Space's: carried by its title bar (snapping to
 * the area's edges, its middle and the other window; pushed against an edge it
 * takes a half or a quarter), pulled by its sides and corners, raised when
 * touched. Arrow keys move the focused title bar, Shift + arrows resize it.
 */
export function AgentWindow({
  id,
  box,
  area,
  others,
  z,
  front,
  status,
  hidden,
  onPlace,
  onRaise,
  onMinimize,
  onClose,
  children,
}: {
  id: BotId;
  box: Box;
  area: Size;
  others: Box[];
  z: number;
  front: boolean;
  status: string;
  hidden: boolean;
  onPlace: (box: Box) => void;
  onRaise: () => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [live, setLive] = useState<Box | null>(null);
  const [zone, setZone] = useState<Box | null>(null);
  const root = useRef<HTMLElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const name = BOT_NAMES[id];
  useEffect(() => () => stop.current?.(), []);
  const shown = live ?? box;

  function areaPoint(e: PointerEvent | ReactPointerEvent) {
    const rect = root.current!.parentElement!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function carry(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
    onRaise();
    const at = areaPoint(e);
    const grab = { x: at.x - box.left, y: at.y - box.top };
    let latest: Box = box,
      latestZone: Box | null = null,
      moved = false;
    const move = (p: PointerEvent) => {
      const pt = areaPoint(p);
      if (!moved && Math.hypot(pt.x - at.x, pt.y - at.y) < 4) return;
      moved = true;
      const carried = clampBox({ ...box, left: pt.x - grab.x, top: pt.y - grab.y }, area);
      const z = zoneAt(pt, area);
      latestZone = z ? zoneBox(z, area) : null;
      latest = z || p.metaKey || p.ctrlKey ? carried : snapMove(carried, others, area);
      setLive(latest);
      setZone(latestZone);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      stop.current = null;
      setLive(null);
      setZone(null);
      if (commit && moved) onPlace(latestZone ?? latest);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (k: globalThis.KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.preventDefault();
      k.stopImmediatePropagation();
      finish(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    stop.current = () => finish(false);
  }

  function pull(edge: Edge, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onRaise();
    const handle = e.currentTarget,
      from = { x: e.clientX, y: e.clientY },
      start = box;
    handle.setPointerCapture(e.pointerId);
    let latest = start;
    const move = (p: PointerEvent) => {
      latest = clampBox(resizeBox(start, edge, p.clientX - from.x, p.clientY - from.y), area);
      setLive(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setLive(null);
      if (latest !== start) onPlace(latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function keys(e: KeyboardEvent<HTMLElement>) {
    if (e.target !== e.currentTarget) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [dx, dy] = d;
    onPlace(
      e.shiftKey
        ? clampBox({ ...box, width: box.width + dx * STEP, height: box.height + dy * STEP }, area)
        : clampBox({ ...box, left: box.left + dx * STEP, top: box.top + dy * STEP }, area),
    );
  }

  return (
    <>
      {zone ? <div className={styles.zone} style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }} /> : null}
      <section
        ref={root}
        className={styles.window}
        data-bot={id}
        data-front={front}
        data-carried={live !== null}
        hidden={hidden}
        aria-label={`${name} window`}
        style={{ left: shown.left, top: shown.top, width: shown.width, height: shown.height, zIndex: z }}
        onPointerDownCapture={onRaise}
        onFocusCapture={onRaise}
      >
        <header
          className={styles.titleBar}
          tabIndex={0}
          aria-label={`${name} window title bar`}
          aria-describedby={`move-hint-${id}`}
          onPointerDown={carry}
          onKeyDown={keys}
        >
          <BotFace id={id} size={30} />
          <h2 className={styles.windowName}>{name}</h2>
          <span className={styles.statusDot} data-status={status} aria-hidden="true" />
          <span className={styles.windowStatus}>{status}</span>
          <span id={`move-hint-${id}`} className="visually-hidden">
            Arrow keys move this window. Shift and arrow keys resize it.
          </span>
          <div className={styles.windowButtons}>
            <button type="button" className={styles.roundButton} aria-label={`Minimize ${name} window`} onClick={onMinimize}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <button type="button" className={styles.roundButton} aria-label={`Close ${name} window`} onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={styles.windowBody}>{children}</div>
        {EDGES.map((edge) => (
          <div key={edge} className={styles.handle} data-edge={edge} aria-hidden="true" onPointerDown={(e) => pull(edge, e)} />
        ))}
      </section>
    </>
  );
}
