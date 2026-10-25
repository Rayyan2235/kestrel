import { create } from "zustand";
import type { BotId } from "@kestrel/contracts";
import { clampBox, GAP, tile, type Box, type Size } from "./geometry";

/** Each bot's window: open, minimized to the dock, or closed. Windows start minimized. */
export type WindowState = "open" | "minimized" | "closed";
const BOTS: readonly BotId[] = ["pip", "nova"];
const KEY = "kestrel.windows.v1";

type Windows = {
  state: Record<BotId, WindowState>;
  /** Pixel boxes inside the windows area. */
  boxes: Partial<Record<BotId, Box>>;
  /** Back to front. */
  order: BotId[];
  /** "Show lab": every window hidden for now, its arrangement kept. */
  hidden: boolean;
  area: Size | null;
  mobileTab: BotId;
  mobileOpen: boolean;
  setArea: (area: Size) => void;
  open: (id: BotId) => void;
  minimize: (id: BotId) => void;
  close: (id: BotId) => void;
  raise: (id: BotId) => void;
  place: (id: BotId, box: Box) => void;
  arrange: () => void;
  toggleHidden: () => void;
  setMobile: (tab: BotId, open: boolean) => void;
};

// Only geometry is remembered in this browser, as fractions of the area; never conversations or audio.
function load(area: Size): Partial<Record<BotId, Box>> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { boxes?: Record<string, Box> } | null;
    const boxes: Partial<Record<BotId, Box>> = {};
    for (const id of BOTS) {
      const b = raw?.boxes?.[id];
      if (b && [b.left, b.top, b.width, b.height].every(Number.isFinite))
        boxes[id] = clampBox({ left: b.left * area.width, top: b.top * area.height, width: b.width * area.width, height: b.height * area.height }, area);
    }
    return boxes;
  } catch {
    return {};
  }
}
function save(boxes: Partial<Record<BotId, Box>>, area: Size | null) {
  if (!area) return;
  try {
    const fractions = Object.fromEntries(
      Object.entries(boxes).map(([id, b]) => [id, { left: b!.left / area.width, top: b!.top / area.height, width: b!.width / area.width, height: b!.height / area.height }]),
    );
    localStorage.setItem(KEY, JSON.stringify({ boxes: fractions }));
  } catch {
    /* storage unavailable: geometry is simply not remembered */
  }
}

/** First placement keeps the centre of the room clear: Pip on the left edge, Nova on the right. */
const defaultBox = (id: BotId, area: Size) => tile(BOTS, area)[id]!;

export const useWindows = create<Windows>((set, get) => ({
  state: { pip: "minimized", nova: "minimized" },
  boxes: {},
  order: ["pip", "nova"],
  hidden: false,
  area: null,
  mobileTab: "pip",
  mobileOpen: false,
  // The intended boxes are kept as placed; they are clamped to the area when drawn,
  // so a transient tiny measurement (layout not ready yet) never shrinks them.
  setArea: (area) => {
    if (area.width < 240 || area.height < 200) return;
    if (get().area === null) set({ area, boxes: load(area) });
    else set({ area });
  },
  raise: (id) => set((s) => ({ order: [...s.order.filter((o) => o !== id), id] })),
  open: (id) => {
    const s = get();
    const boxes = s.boxes[id] || !s.area ? s.boxes : { ...s.boxes, [id]: defaultBox(id, s.area) };
    set({ state: { ...s.state, [id]: "open" }, boxes, hidden: false, order: [...s.order.filter((o) => o !== id), id] });
  },
  minimize: (id) => set((s) => ({ state: { ...s.state, [id]: "minimized" } })),
  close: (id) => set((s) => ({ state: { ...s.state, [id]: "closed" } })),
  place: (id, box) => {
    const s = get();
    if (!s.area) return;
    const boxes = { ...s.boxes, [id]: clampBox(box, s.area) };
    set({ boxes });
    save(boxes, s.area);
  },
  arrange: () => {
    const s = get();
    if (!s.area) return;
    const boxes = tile(BOTS, s.area) as Record<BotId, Box>;
    set({ boxes, state: { pip: "open", nova: "open" }, hidden: false });
    save(boxes, s.area);
  },
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
  setMobile: (mobileTab, mobileOpen) => set({ mobileTab, mobileOpen }),
}));

export { GAP };
