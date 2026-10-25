import type { Progress } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

export const STORAGE_KEY = "kestrel.progress";
export const CURRENT_SCHEMA = 1;

/** Migration chain from `fromSchema` to current. v1 to v1 is the identity. */
export const migrate = (_old: unknown, _fromSchema: number): unknown =>
  notImplemented("storage.migrate");
/** Never throws. Corrupt data gives a fresh profile; a valid older save is kept. */
export const loadProgress = (
  _storage: Pick<Storage, "getItem"> | null,
): Progress => notImplemented("storage.loadProgress");
export const saveProgress = (
  _storage: Pick<Storage, "setItem"> | null,
  _progress: Progress,
): void => notImplemented("storage.saveProgress");
