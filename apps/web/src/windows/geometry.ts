// Window geometry for the bots' agent windows. clampBox, resizeBox, snapMove,
// zoneAt and zoneBox are adapted from Open Space's src/state/windows.ts
// (https://github.com/Fantomiald/open-space @ 3f971d1, MIT License,
// Copyright (c) 2026 VibesMoney; see ./OPEN-SPACE-LICENSE). Kestrel changes:
// a single snap pass without guides, Kestrel's sizes, and no grid mode.
export type Box = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Zone = "left" | "right" | "full" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const GAP = 12;
export const MIN_WINDOW = { width: 300, height: 220 };
/** a window's title bar, which must stay within reach */
export const TITLE_HEIGHT = 52;
/** how much of a window stays on screen, across */
export const KEEP_VISIBLE = 120;
/** how close an edge comes to another before it sticks */
export const SNAP = 10;
/** how close the pointer comes to the screen edge for a window to take its half or quarter */
export const EDGE_ZONE = 6;

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** No smaller than a readable window, no bigger than the area, its title bar within reach. */
export function clampBox(box: Box, area: Size): Box {
  const width = within(box.width, Math.min(MIN_WINDOW.width, area.width), area.width);
  const height = within(box.height, Math.min(MIN_WINDOW.height, area.height), area.height);
  return {
    left: within(box.left, KEEP_VISIBLE - width, area.width - KEEP_VISIBLE),
    top: within(box.top, 0, Math.max(0, area.height - TITLE_HEIGHT)),
    width,
    height,
  };
}

/** `start` pulled by `edge` by dx, dy; the opposite side stays where it was. */
export function resizeBox(start: Box, edge: Edge, dx: number, dy: number): Box {
  let { left, top, width, height } = start;
  const right = left + width,
    bottom = top + height;
  if (edge.includes("w")) {
    left = Math.min(left + dx, right - MIN_WINDOW.width);
    width = right - left;
  }
  if (edge.includes("e")) width = Math.max(width + dx, MIN_WINDOW.width);
  if (edge.includes("n")) {
    top = Math.min(top + dy, bottom - MIN_WINDOW.height);
    height = bottom - top;
  }
  if (edge.includes("s")) height = Math.max(height + dy, MIN_WINDOW.height);
  return { left, top, width, height };
}

/** Each axis sticks to the nearest line within SNAP: the area's edges and middle, and the other windows. */
export function snapMove(box: Box, others: readonly Box[], area: Size): Box {
  let placed = box;
  for (const axis of ["x", "y"] as const) {
    const length = axis === "x" ? area.width : area.height;
    const start = (b: Box) => (axis === "x" ? b.left : b.top);
    const size = (b: Box) => (axis === "x" ? b.width : b.height);
    const starts = [GAP, ...others.flatMap((b) => [start(b), start(b) + size(b) + GAP])];
    const ends = [length - GAP, ...others.flatMap((b) => [start(b) + size(b), start(b) - GAP])];
    const s = start(placed),
      z = size(placed);
    let best: number | null = null;
    const consider = (delta: number) => {
      if (Math.abs(delta) <= SNAP && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
    };
    for (const line of starts) consider(line - s);
    for (const line of ends) consider(line - (s + z));
    consider(length / 2 - (s + z / 2));
    if (best !== null) placed = axis === "x" ? { ...placed, left: placed.left + best } : { ...placed, top: placed.top + best };
  }
  return placed;
}

/** The zone the pointer pushes against: a side is a half, a corner a quarter, the top all of it. */
export function zoneAt(point: { x: number; y: number }, area: Size): Zone | null {
  const { width, height } = area;
  const top = point.y < height / 6,
    bottom = point.y > (height * 5) / 6,
    leftmost = point.x < width / 6,
    rightmost = point.x > (width * 5) / 6;
  if (point.x <= EDGE_ZONE) return top ? "top-left" : bottom ? "bottom-left" : "left";
  if (point.x >= width - EDGE_ZONE) return top ? "top-right" : bottom ? "bottom-right" : "right";
  if (point.y <= EDGE_ZONE) return leftmost ? "top-left" : rightmost ? "top-right" : "full";
  if (point.y >= height - EDGE_ZONE) return leftmost ? "bottom-left" : rightmost ? "bottom-right" : null;
  return null;
}

export function zoneBox(zone: Zone, area: Size): Box {
  const half = (area.width - 3 * GAP) / 2,
    halfHeight = (area.height - 3 * GAP) / 2;
  const full = { left: GAP, top: GAP, width: area.width - 2 * GAP, height: area.height - 2 * GAP };
  const right = GAP + half + GAP,
    lower = GAP + halfHeight + GAP;
  switch (zone) {
    case "full":
      return full;
    case "left":
      return { ...full, width: half };
    case "right":
      return { ...full, left: right, width: half };
    case "top-left":
      return { left: GAP, top: GAP, width: half, height: halfHeight };
    case "top-right":
      return { left: right, top: GAP, width: half, height: halfHeight };
    case "bottom-left":
      return { left: GAP, top: lower, width: half, height: halfHeight };
    case "bottom-right":
      return { left: right, top: lower, width: half, height: halfHeight };
  }
}

/** Kestrel's tiling keeps the experiment clear: one column per bot, pinned to the outer edges. */
export function tile(ids: readonly string[], area: Size): Record<string, Box> {
  const width = Math.min(360, Math.max(MIN_WINDOW.width, (area.width - 3 * GAP) / 3));
  const height = Math.max(MIN_WINDOW.height, Math.min(area.height - 2 * GAP, 560));
  const boxes: Record<string, Box> = {};
  ids.forEach((id, i) => {
    boxes[id] = { left: i % 2 === 0 ? GAP : area.width - GAP - width, top: GAP, width, height };
  });
  return boxes;
}
