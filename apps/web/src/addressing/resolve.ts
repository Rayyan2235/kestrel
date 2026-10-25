import type { BotId } from "@kestrel/contracts";

/**
 * Who the learner is talking to, decided locally before any model call.
 * A name counts only in call position: the first word after an optional
 * greeting, or the last word. Anywhere else it is a mention.
 */
export type AddressMode =
  | "named"
  | "group"
  | "selected"
  | "continuing"
  | "owner"
  | "crew-default"
  | "clarify";

export type Resolution = {
  to: BotId[];
  mode: AddressMode;
  /** The text with the vocative removed. */
  body: string;
  /** Names in argument position ("ask Nova", "Nova's weight"): not addressees. */
  mentions: BotId[];
  /** The word that matched a name, shown as "heard: Pip". */
  heard: string | null;
  /** The name matched only by sound-alike distance: show "to Nova?". */
  unsure: boolean;
  /** Which weight the body refers to, if any. */
  side: "left" | "right" | null;
};

/** Routing context, snapshotted when the learner presses to talk. */
export type AddressContext = {
  /** A robot the learner selected since the last turn. */
  selected: BotId | null;
  /** The robot whose last line to the learner was a question, within 30 s. */
  thread: BotId | null;
};

const BOTS: BotId[] = ["pip", "nova"];
const ALIASES: Record<BotId, string[]> = {
  pip: ["pip", "pipp", "pips"],
  nova: ["nova", "noba", "nover"],
};
/** The robot that works each rail: left (200 g) is Pip, right (100 g) is Nova. */
export const OWNER: Record<"left" | "right", BotId> = {
  left: "pip",
  right: "nova",
};
const GREETINGS = new Set(["hey", "okay", "ok", "hi", "yo", "hello"]);
const GROUP_WORDS = new Set(["both", "everyone", "guys", "team", "crew"]);
/** A name right after one of these is what is being talked about, not who. */
const MENTION_BEFORE = new Set([
  "ask",
  "tell",
  "with",
  "to",
  "for",
  "like",
  "than",
  "help",
  "and",
  "call",
]);
const ACTION = /\b(move|push|put|slide|place|shift|set|pick|drag|bring)\b/;
const WEIGHT_SIDE =
  /\b(left|right)\s+(weight|one|block|mass)\b|\b(200|100)\s*g(?:rams?)?\b/;
const POINTING = /\b(this|that|it)\b/;

const plain = (word: string) =>
  word
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9']/g, "");

const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = keep;
    }
  }
  return row[b.length]!;
};

/** The robot a word names, and whether only a sound-alike matched. */
const nameOf = (
  raw: string,
): { bot: BotId; fuzzy: boolean; possessive: boolean } | null => {
  const word = plain(raw);
  const possessive = word.endsWith("'s");
  const stem = word.replace(/'s$/, "").replace(/'/g, "");
  for (const bot of BOTS) {
    if (ALIASES[bot].includes(stem)) return { bot, fuzzy: false, possessive };
    // Sound-alikes only for names of 4+ letters: "pick" and "tip" never become Pip.
    if (bot.length >= 4 && stem.length >= 3 && distance(stem, bot) <= 1)
      return { bot, fuzzy: true, possessive };
  }
  return null;
};

export const sideOf = (text: string): "left" | "right" | null => {
  const m = WEIGHT_SIDE.exec(text.toLowerCase());
  if (!m) return null;
  if (m[1]) return m[1] as "left" | "right";
  return m[3] === "200" ? "left" : "right";
};

export function resolveAddressees(
  text: string,
  ctx: AddressContext,
): Resolution {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const used = new Set<number>();
  let to: BotId[] = [];
  let mode: AddressMode | null = null;
  let heard: string | null = null;
  let unsure = false;

  let i = 0;
  while (i < words.length && GREETINGS.has(plain(words[i]!))) i++;
  const front = words.slice(i, i + 3).map(plain);
  const pair = (a: number) => nameOf(words[i + a] ?? "")?.bot;
  if (front[1] === "and" && pair(0) && pair(2) && pair(0) !== pair(2)) {
    to = [...BOTS];
    mode = "group";
    for (let k = 0; k < i + 3; k++) used.add(k);
  } else if (front[0] === "you" && front[1] === "two") {
    to = [...BOTS];
    mode = "group";
    for (let k = 0; k < i + 2; k++) used.add(k);
  } else if (front[0] && GROUP_WORDS.has(front[0])) {
    to = [...BOTS];
    mode = "group";
    for (let k = 0; k <= i; k++) used.add(k);
  } else {
    const first = words[i] ? nameOf(words[i]!) : null;
    const lastAt = words.length - 1;
    const last =
      lastAt > i && !MENTION_BEFORE.has(plain(words[lastAt - 1]!))
        ? nameOf(words[lastAt]!)
        : null;
    const pick =
      first && !first.possessive
        ? { at: i, hit: first }
        : last && !last.possessive
          ? { at: lastAt, hit: last }
          : null;
    if (pick) {
      to = [pick.hit.bot];
      mode = "named";
      heard = plain(words[pick.at]!).replace(/'s$/, "");
      unsure = pick.hit.fuzzy;
      used.add(pick.at);
      if (pick.at === i) for (let k = 0; k < i; k++) used.add(k);
    }
  }

  const body = words
    .filter((_, k) => !used.has(k))
    .join(" ")
    .replace(/^[\s,.:;!?-]+|[\s,;:-]+$/g, "");
  const lower = body.toLowerCase();
  const mentions = [
    ...new Set(
      words
        .filter((_, k) => !used.has(k))
        .map((w) =>
          ALIASES.pip.concat(ALIASES.nova).includes(plain(w).replace(/'s$/, ""))
            ? nameOf(w)?.bot
            : undefined,
        )
        .filter((b): b is BotId => Boolean(b)),
    ),
  ];
  const side = sideOf(lower);

  if (!mode && /\b(both|everyone|guys|crew)\b|\byou two\b/.test(lower)) {
    to = [...BOTS];
    mode = "group";
  }
  if (!mode) {
    const acting = ACTION.test(lower);
    if (acting && side) {
      to = [OWNER[side]];
      mode = "owner";
    } else if (acting && POINTING.test(lower)) {
      // "move this" with no weight named: ask, never guess. A plain "move please" goes on below.
      to = [ctx.selected ?? ctx.thread ?? "pip"];
      mode = "clarify";
    } else if (ctx.selected) {
      to = [ctx.selected];
      mode = "selected";
    } else if (ctx.thread) {
      to = [ctx.thread];
      mode = "continuing";
    } else {
      to = [...BOTS];
      mode = "crew-default";
    }
  }
  return { to, mode, body: body || text.trim(), mentions, heard, unsure, side };
}

/**
 * The context a turn binds to when no name is spoken: taken at press-start,
 * so a selection change before the transcript arrives never retargets it.
 */
export const pressStart = (ctx: AddressContext): AddressContext =>
  Object.freeze({ ...ctx });

/** Crew turn lead, decided before any model call: the object owner, else the last trial bot, else alternate. */
export const crewLead = (
  side: "left" | "right" | null,
  lastTrial: BotId | null,
  previousLead: BotId | null,
): BotId =>
  side ? OWNER[side] : (lastTrial ?? (previousLead === "pip" ? "nova" : "pip"));
