export type Slot =
  "shell" | "accent" | "eye" | "eyeShape" | "head" | "back" | "neck";
export type Item = {
  id: string;
  slot: Slot;
  label: string;
  minLevel: number;
  free: boolean;
  /** Hex colour for shell, accent and eye items. */
  color?: string;
};

/** Placeholder catalogue. Final art and palettes are an owner item. */
export const CATALOG: readonly Item[] = [
  {
    id: "shell-sky",
    slot: "shell",
    label: "Sky",
    minLevel: 1,
    free: true,
    color: "#2f7dbd",
  },
  {
    id: "shell-mint",
    slot: "shell",
    label: "Mint",
    minLevel: 1,
    free: true,
    color: "#1f8a6a",
  },
  {
    id: "shell-slate",
    slot: "shell",
    label: "Slate",
    minLevel: 1,
    free: true,
    color: "#475569",
  },
  {
    id: "shell-plum",
    slot: "shell",
    label: "Plum",
    minLevel: 1,
    free: true,
    color: "#7a3f8f",
  },
  {
    id: "shell-gold",
    slot: "shell",
    label: "Gold",
    minLevel: 2,
    free: false,
    color: "#b7791f",
  },
  {
    id: "shell-coral",
    slot: "shell",
    label: "Coral",
    minLevel: 2,
    free: false,
    color: "#c2410c",
  },
  {
    id: "shell-ink",
    slot: "shell",
    label: "Ink",
    minLevel: 3,
    free: false,
    color: "#1e293b",
  },
  {
    id: "shell-berry",
    slot: "shell",
    label: "Berry",
    minLevel: 3,
    free: false,
    color: "#9d174d",
  },
  {
    id: "shell-pearl",
    slot: "shell",
    label: "Pearl",
    minLevel: 4,
    free: false,
    color: "#e5e7eb",
  },
  {
    id: "shell-lime",
    slot: "shell",
    label: "Lime",
    minLevel: 5,
    free: false,
    color: "#4d7c0f",
  },
  {
    id: "accent-amber",
    slot: "accent",
    label: "Amber",
    minLevel: 1,
    free: true,
    color: "#f59e0b",
  },
  {
    id: "accent-coral",
    slot: "accent",
    label: "Coral",
    minLevel: 1,
    free: true,
    color: "#fb7185",
  },
  {
    id: "accent-teal",
    slot: "accent",
    label: "Teal",
    minLevel: 2,
    free: false,
    color: "#14b8a6",
  },
  {
    id: "accent-violet",
    slot: "accent",
    label: "Violet",
    minLevel: 2,
    free: false,
    color: "#8b5cf6",
  },
  {
    id: "accent-rose",
    slot: "accent",
    label: "Rose",
    minLevel: 3,
    free: false,
    color: "#f43f5e",
  },
  {
    id: "accent-lime",
    slot: "accent",
    label: "Lime",
    minLevel: 3,
    free: false,
    color: "#84cc16",
  },
  {
    id: "accent-sky",
    slot: "accent",
    label: "Sky",
    minLevel: 4,
    free: false,
    color: "#38bdf8",
  },
  {
    id: "accent-orange",
    slot: "accent",
    label: "Orange",
    minLevel: 4,
    free: false,
    color: "#f97316",
  },
  {
    id: "accent-gray",
    slot: "accent",
    label: "Gray",
    minLevel: 5,
    free: false,
    color: "#94a3b8",
  },
  {
    id: "accent-mint",
    slot: "accent",
    label: "Mint",
    minLevel: 5,
    free: false,
    color: "#34d399",
  },
  {
    id: "eye-white",
    slot: "eye",
    label: "White",
    minLevel: 1,
    free: true,
    color: "#ffffff",
  },
  {
    id: "eye-cream",
    slot: "eye",
    label: "Cream",
    minLevel: 1,
    free: true,
    color: "#fef3c7",
  },
  {
    id: "eye-ice",
    slot: "eye",
    label: "Ice",
    minLevel: 1,
    free: true,
    color: "#e0f2fe",
  },
  {
    id: "eye-yellow",
    slot: "eye",
    label: "Yellow",
    minLevel: 2,
    free: false,
    color: "#facc15",
  },
  {
    id: "eye-ink",
    slot: "eye",
    label: "Ink",
    minLevel: 2,
    free: false,
    color: "#0f172a",
  },
  {
    id: "eye-lime",
    slot: "eye",
    label: "Lime",
    minLevel: 3,
    free: false,
    color: "#bef264",
  },
  { id: "round", slot: "eyeShape", label: "Round", minLevel: 1, free: true },
  { id: "visor", slot: "eyeShape", label: "Visor", minLevel: 2, free: false },
  { id: "happy", slot: "eyeShape", label: "Happy", minLevel: 3, free: false },
  { id: "none", slot: "head", label: "No hat", minLevel: 1, free: true },
  { id: "antenna", slot: "head", label: "Antenna", minLevel: 2, free: false },
  { id: "goggles", slot: "head", label: "Goggles", minLevel: 3, free: false },
  { id: "none", slot: "back", label: "No pack", minLevel: 1, free: true },
  { id: "backpack", slot: "back", label: "Backpack", minLevel: 3, free: false },
  { id: "none", slot: "neck", label: "No scarf", minLevel: 1, free: true },
  { id: "scarf", slot: "neck", label: "Scarf", minLevel: 2, free: false },
];

export const itemsFor = (slot: Slot): Item[] =>
  CATALOG.filter((i) => i.slot === slot);
export const itemById = (id: string): Item | undefined =>
  CATALOG.find((i) => i.id === id);
export const FREE_IDS: readonly string[] = CATALOG.filter((i) => i.free).map(
  (i) => i.id,
);
