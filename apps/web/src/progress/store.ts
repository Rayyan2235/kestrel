import type { Award, BotId, Progress } from "@kestrel/contracts";
import type { LabEventLog } from "./events.js";
import { notImplemented } from "../notImplemented.js";

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
};
export interface ProgressStore {
  get(): ProgressView;
  subscribe(listener: () => void): () => void;
  /** A pick always unlocks; it equips only if `allowed`, else `note` says who wears it. */
  pick(itemId: string, bot: BotId): { equipped: boolean; note: string | null };
  equip(bot: BotId, slot: string, itemId: string): boolean;
  markSeen(ids: readonly string[]): void;
  resetProgress(): void;
}
export type StoreOptions = {
  log: LabEventLog;
  storage: Storage | null;
  /** In-memory seed profile (?demo=progress). Never writes storage. */
  seed?: Progress;
};
export const createProgressStore = (_opts: StoreOptions): ProgressStore =>
  notImplemented("store.createProgressStore");
