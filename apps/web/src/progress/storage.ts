import {
  freshProgress,
  parseProgress,
  type Progress,
} from "@kestrel/contracts";

export const STORAGE_KEY = "kestrel.progress";
export const CURRENT_SCHEMA = 1;

/**
 * Migration chain from `fromSchema` to current. Each step lifts one version;
 * v1 to v1 is the identity. A valid older save is never discarded.
 */
export const migrate = (old: unknown, fromSchema: number): unknown => {
  let value = old;
  for (let v = fromSchema; v < CURRENT_SCHEMA; v++) {
    // Steps are added here as schemas ship: `if (v === 1) value = v1ToV2(value)`.
  }
  return value;
};

/** Never throws. Corrupt data gives a fresh profile. */
export const loadProgress = (
  storage: Pick<Storage, "getItem"> | null,
): Progress => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return freshProgress();
    const data: unknown = JSON.parse(raw);
    const from =
      typeof data === "object" && data !== null && "schema" in data
        ? Number((data as { schema: unknown }).schema)
        : NaN;
    if (!Number.isInteger(from) || from < 1) return freshProgress();
    return parseProgress(migrate(data, from));
  } catch {
    return freshProgress();
  }
};

export const saveProgress = (
  storage: Pick<Storage, "setItem"> | null,
  progress: Progress,
): void => {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked or full: the in-memory profile keeps working.
  }
};
