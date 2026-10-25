export type Slot =
  "shell" | "accent" | "eye" | "eyeShape" | "head" | "back" | "neck";
export type Item = {
  id: string;
  slot: Slot;
  label: string;
  minLevel: number;
  free: boolean;
  color?: string;
};

/** Placeholder catalogue (G5 fills it). Final art and palettes are an owner item. */
export const CATALOG: readonly Item[] = [];
export const itemsFor = (slot: Slot): Item[] =>
  CATALOG.filter((i) => i.slot === slot);
export const FREE_IDS: readonly string[] = CATALOG.filter((i) => i.free).map(
  (i) => i.id,
);
