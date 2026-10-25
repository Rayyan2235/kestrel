import {
  BOT_NAMES,
  freshProgress,
  type Award,
  type BotId,
  type LabEvent,
  type Progress,
} from "@kestrel/contracts";
import { CATALOG, FREE_IDS } from "../cosmetics/catalog.js";
import { whyNot } from "../cosmetics/constraints.js";
import type { BotLook } from "@kestrel/contracts";
import type { LabEventLog } from "./events.js";
import { leveledUp, levelOf, need } from "./levels.js";
import { tokens, unlocked } from "./picks.js";
import { award, totalXp } from "./rules.js";
import { loadProgressChecked, saveProgress } from "./storage.js";

export type ProgressView = {
  awards: readonly Award[];
  picks: Progress["picks"];
  equipped: Progress["equipped"];
  seen: readonly string[];
  xp: number;
  level: number;
  into: number;
  needed: number;
  tokens: number;
  unlocked: ReadonlySet<string>;
  /** Level-ups and rejection reasons waiting for the HUD. */
  levelUps: { from: number; to: number }[];
  rejections: string[];
  /** True when saving or loading failed: progress works but is not kept on this device. */
  unsaved: boolean;
};
export interface ProgressStore {
  get(): ProgressView;
  subscribe(listener: () => void): () => void;
  /** A pick always unlocks; it equips only if `allowed`, else `note` says why. */
  pick(itemId: string, bot: BotId): { equipped: boolean; note: string | null };
  equip(bot: BotId, slot: string, itemId: string): boolean;
  markSeen(ids: readonly string[]): void;
  /** The HUD has shown these; clears the queues. */
  ackLevelUps(): void;
  ackRejections(): void;
  resetProgress(): void;
}
export type StoreOptions = {
  log: LabEventLog;
  storage: Storage | null;
  /** In-memory seed profile (?demo=progress). Never writes storage. */
  seed?: Progress;
};

const otherBot = (bot: BotId): BotId => (bot === "pip" ? "nova" : "pip");

export const createProgressStore = (opts: StoreOptions): ProgressStore => {
  const persist = !opts.seed;
  const loaded = opts.seed ? null : loadProgressChecked(opts.storage);
  let progress: Progress = opts.seed ?? loaded!.progress;
  let unsaved = loaded ? !loaded.ok : false;
  let levelUps: { from: number; to: number }[] = [];
  let rejections: string[] = [];
  let seenEvents: LabEvent[] = [];
  let epoch = 0;
  const listeners = new Set<() => void>();
  let view: ProgressView | null = null;

  const changed = () => {
    view = null;
    if (persist) unsaved = !saveProgress(opts.storage, progress);
    listeners.forEach((fn) => fn());
  };

  const compute = (): ProgressView => {
    const xp = totalXp(progress.awards);
    const level = levelOf(xp);
    return {
      awards: progress.awards,
      picks: progress.picks,
      equipped: progress.equipped,
      seen: progress.seen,
      xp,
      level,
      into: xp - need(level),
      needed: need(level + 1) - need(level),
      tokens: tokens(level, progress.picks),
      unlocked: unlocked(FREE_IDS, progress.picks),
      levelUps,
      rejections,
      unsaved: persist && unsaved,
    };
  };

  opts.log.subscribe((event) => {
    epoch = Math.max(epoch, event.epoch);
    const result = award(event, {
      awards: progress.awards,
      events: seenEvents,
      epoch,
      now: Date.now(),
    });
    seenEvents = [...seenEvents, event];
    if (result.rejected.length)
      rejections = [...rejections, ...result.rejected.map((r) => r.reason)];
    if (result.granted.length) {
      const before = totalXp(progress.awards);
      progress = {
        ...progress,
        awards: [...progress.awards, ...result.granted],
      };
      levelUps = [...levelUps, ...leveledUp(before, totalXp(progress.awards))];
    }
    if (result.granted.length || result.rejected.length) changed();
  });

  const lookWith = (look: BotLook, slot: string, id: string): BotLook => ({
    ...look,
    [slot]: id,
  });

  const store: ProgressStore = {
    get: () => (view ??= compute()),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    pick(itemId, bot) {
      const v = store.get();
      if (v.tokens <= 0)
        return { equipped: false, note: "No reward to pick yet." };
      progress = {
        ...progress,
        picks: [...progress.picks, { itemId, atLevel: v.level }],
      };
      const item = CATALOG.find((i) => i.id === itemId);
      let result: { equipped: boolean; note: string | null };
      if (!item) {
        result = { equipped: false, note: "Unlocked." };
      } else {
        const other = otherBot(bot);
        const own = progress.equipped[bot];
        const why = whyNot(item.slot, itemId, own, progress.equipped[other]);
        if (why === null) {
          progress = {
            ...progress,
            equipped: {
              ...progress.equipped,
              [bot]: lookWith(own, item.slot, itemId),
            },
          };
          result = { equipped: true, note: null };
        } else {
          const shellTaken =
            item.slot === "shell" && progress.equipped[other].shell === itemId;
          result = {
            equipped: false,
            note: shellTaken
              ? `Unlocked. ${BOT_NAMES[other]} wears this shell now.`
              : `Unlocked. ${why}.`,
          };
        }
      }
      changed();
      return result;
    },
    equip(bot, slot, itemId) {
      const item = CATALOG.find((i) => i.id === itemId && i.slot === slot);
      if (!item || !store.get().unlocked.has(itemId)) return false;
      const own = progress.equipped[bot];
      if (whyNot(item.slot, itemId, own, progress.equipped[otherBot(bot)]))
        return false;
      progress = {
        ...progress,
        equipped: { ...progress.equipped, [bot]: lookWith(own, slot, itemId) },
      };
      changed();
      return true;
    },
    markSeen(ids) {
      const fresh = [...new Set(ids)].filter(
        (id) => !progress.seen.includes(id),
      );
      if (!fresh.length) return;
      progress = { ...progress, seen: [...progress.seen, ...fresh] };
      changed();
    },
    ackLevelUps() {
      levelUps = [];
      changed();
    },
    ackRejections() {
      rejections = [];
      changed();
    },
    resetProgress() {
      progress = freshProgress();
      levelUps = [];
      rejections = [];
      changed();
    },
  };
  return store;
};
