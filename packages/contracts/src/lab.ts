import { z } from "zod";
import type { BotId } from "./bot.js";

// Modular lab props. One spec drives both the MuJoCo body and its render
// mesh, so a subject kit (Pythagoras tiles, Moments plank and weights) is
// just data. Coordinates are MuJoCo ground coordinates in metres: +x is
// the duck's spawn heading, +y is to its left, +z is up.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** How a prop is attached to the world, or to its parent prop. */
export type PropJoint = "fixed" | "free" | "hinge" | "slide";

export type PropShape =
  | { type: "box"; size: Vec3 }
  /** Right-triangle prism: legs along local +x and +y, extruded along z. */
  | { type: "triangle"; legs: Vec2; height: number }
  /** Triangular prism lying along local y (a pivot wedge). */
  | { type: "wedge"; width: number; length: number; height: number };

export type PropSpec = {
  id: string;
  label: string;
  role: "tile" | "plank" | "weight" | "paddle" | "pivot" | "triangle" | "furniture";
  shape: PropShape;
  joint: PropJoint;
  /**
   * Position of the body origin. Box and wedge origins are their centers.
   * With a parent, it is relative to the parent at rest.
   */
  pos: Vec3;
  /** Rotation about +z, in radians. */
  yaw: number;
  mass: number;
  color: string;
  /** Prop this one is mounted on (listed before it). It moves with its parent. */
  parent?: string;
  /** Joint axis in body coordinates, for "hinge" and "slide". */
  axis?: Vec3;
  /** Where the hinge axis passes, in body coordinates (default: the origin). */
  anchor?: Vec3;
  /** Joint limits: radians for a hinge, metres for a slide. */
  range?: Vec2;
  damping?: number;
  /** Slide position at rest, metres along the axis from the body origin. */
  rest?: number;
  /** Contact stiffness (MuJoCo solref: time constant, damping ratio); stiffer means less penetration. */
  solref?: Vec2;
  /** Side length in Pythagoras units, drawn as an n × n grid on tiles. */
  units?: number;
};

/** Visual-only floor target: where a tile belongs in a puzzle. */
export type SlotSpec = {
  id: string;
  forProp: string;
  pos: Vec2;
  yaw: number;
  side: number;
  label: string;
};

export type LabKit = {
  id: "pythagoras" | "moments" | "free";
  subject: "Maths" | "Physics" | "Sandbox";
  topic: string;
  props: PropSpec[];
  slots: SlotSpec[];
  /** Lines of the right triangle drawn on the floor, in metres. */
  outline?: Vec2[];
  /** Where the lesson's apparatus is; the camera keeps it in view with the duck. */
  focus: Vec2;
  /** Where each robot starts: x, y and heading (rad). */
  spawns: Record<BotId, Vec3>;
};

/** One Pythagoras unit, in metres. The duck stands about 0.25 m tall. */
export const UNIT = 0.04;
const TILE_THICKNESS = 0.03;

export function tile(
  id: string,
  units: number,
  pos: Vec2,
  color: string,
  yaw = 0,
): PropSpec {
  const side = units * UNIT;
  return {
    id,
    label: `${units}×${units} square`,
    role: "tile",
    shape: { type: "box", size: [side, side, TILE_THICKNESS] },
    joint: "free",
    pos: [pos[0], pos[1], TILE_THICKNESS / 2 + 0.002],
    yaw,
    // Light enough for the walking policy to shove without falling.
    mass: 0.012 * units,
    color,
    units,
  };
}

export function block(
  id: string,
  label: string,
  size: Vec3,
  pos: Vec2,
  color: string,
  opts: { mass?: number; joint?: PropJoint; yaw?: number } = {},
): PropSpec {
  return {
    id,
    label,
    role: opts.joint === "fixed" ? "furniture" : "weight",
    shape: { type: "box", size },
    joint: opts.joint ?? "free",
    pos: [pos[0], pos[1], size[2] / 2 + 0.001],
    yaw: opts.yaw ?? 0,
    mass: opts.mass ?? 0.05,
    color,
  };
}

/**
 * Floor slots for squares on the sides of a right triangle with legs
 * a (along +x) and b (along +y), right angle at `origin`. Each square sits
 * outside the triangle; the hypotenuse square is rotated to match its edge.
 */
export function pythagorasSlots(
  a: number,
  b: number,
  origin: Vec2,
  ids: { a: string; b: string; c: string },
): { slots: SlotSpec[]; outline: Vec2[]; c: number } {
  const c = Math.hypot(a, b);
  const [ox, oy] = origin;
  const u = UNIT;
  const hyp = Math.atan2(b, -a); // direction of the edge from (a,0) to (0,b)
  // Outward normal of the hypotenuse, away from the right angle.
  const n: Vec2 = [b / c, a / c];
  const mid: Vec2 = [(a / 2) * u, (b / 2) * u];
  const slots: SlotSpec[] = [
    {
      id: "slot-a",
      forProp: ids.a,
      pos: [ox + (a / 2) * u, oy - (a / 2) * u],
      yaw: 0,
      side: a * u,
      label: `a² = ${a * a}`,
    },
    {
      id: "slot-b",
      forProp: ids.b,
      pos: [ox - (b / 2) * u, oy + (b / 2) * u],
      yaw: 0,
      side: b * u,
      label: `b² = ${b * b}`,
    },
    {
      id: "slot-c",
      forProp: ids.c,
      pos: [ox + mid[0] + n[0] * (c / 2) * u, oy + mid[1] + n[1] * (c / 2) * u],
      yaw: hyp - Math.PI / 2,
      side: c * u,
      label: `c² = ${Math.round(c * c)}`,
    },
  ];
  const outline: Vec2[] = [
    [ox, oy],
    [ox + a * u, oy],
    [ox, oy + b * u],
    [ox, oy],
  ];
  return { slots, outline, c };
}

/** A square counts as placed when its center lies within `tolerance` of the slot. */
export function slotFilled(
  propXY: Vec2,
  slot: SlotSpec,
  tolerance = UNIT,
): boolean {
  return (
    Math.hypot(propXY[0] - slot.pos[0], propXY[1] - slot.pos[1]) <= tolerance
  );
}

export function pythagorasKit(): LabKit {
  const ids = { a: "square-3", b: "square-4", c: "square-5" };
  // The triangle's legs: 4 units along +x and 3 along +y, so the squares
  // are 4×4 below, 3×3 to the left and 5×5 on the hypotenuse.
  const { slots, outline } = pythagorasSlots(4, 3, [0.35, -0.1], {
    a: ids.b,
    b: ids.a,
    c: ids.c,
  });
  return {
    id: "pythagoras",
    focus: [0.45, -0.05],
    spawns: { pip: [-0.6, 0, 0], nova: [-0.6, -0.45, 0] },
    subject: "Maths",
    topic: "Pythagorean theorem",
    props: [
      // Each tile starts outside its own side of the triangle, so pushing it
      // straight in never sweeps across a slot that is already filled.
      tile(ids.a, 3, [-0.25, 0.35], "#5caca4"),
      tile(ids.b, 4, [0.43, -0.8], "#dc8060"),
      tile(ids.c, 5, [0.95, 0.62], "#d2b54c"),
    ],
    slots,
    outline,
  };
}

// ── Moments: a floor balance ───────────────────────────────────────────
// The plank is a beam balance, locked level until someone releases it. Each
// weight rides a rail on its own side of the pivot. A paddle hangs off each
// weight into a walking lane beside the plank, so the duck moves a weight by
// walking into its paddle. Distances on the rails are real centimetres.

const PIVOT_H = 0.06;
// Long enough that a weight at the far end of its rail travel still sits on the plank.
const PLANK = { length: 0.66, width: 0.04, thick: 0.012 };
const PADDLE = { reach: 0.11, thick: 0.012, height: 0.085, bottom: 0.04, mass: 0.01 };
const PIVOT: Vec2 = [0.5, 0];
/** The duck's chest meets the paddles here, 2 cm inside their tips. */
const LANE_X = PIVOT[0] - PLANK.width / 2 - PADDLE.reach + 0.02;

export type BalanceSide = "left" | "right";
export type MomentsWeight = {
  id: string;
  label: string;
  grams: number;
  side: BalanceSide;
  /** The robot that moves this weight. Pip works the left rail, Nova the right. */
  owner: BotId;
  /** Starting distance from the pivot. */
  cm: number;
  size: number;
  color: string;
};

export const MOMENTS = {
  pivot: PIVOT,
  /** Pivot wedge footprint on the floor: x and y half-extents. */
  pivotHalf: [0.02, 0.04] as Vec2,
  plank: PLANK,
  paddle: PADDLE,
  /** Furthest the plank tips either way, radians. */
  tilt: 0.1,
  /** Height of the pivot pin above the plank's centre, metres. */
  pinHeight: 0.08,
  minCm: 5,
  maxCm: 30,
  /**
   * Rail travel past each end mark, metres. A push stops within about a
   * millimetre of its mark; if the rail ended exactly at 5 or 30 cm, that
   * overshoot would press on the joint limit, and the limit's reaction (acting
   * below the pivot pin) would tilt a balanced plank by about 1°.
   */
  railTravel: 0.005,
  laneX: LANE_X,
  /** A walkway clear of the paddle tips, for getting to and from the lane. */
  transitX: LANE_X - 0.1675,
  /** Closest two paddles may come: room for the duck to stand between them. */
  minGap: 0.14,
  /** Left is −y, as the learner sees it on screen. */
  weights: [
    { id: "weight-200", label: "200 g weight", grams: 200, side: "left", owner: "pip", cm: 20, size: 0.04, color: "#72aeb4" },
    { id: "weight-100", label: "100 g weight", grams: 100, side: "right", owner: "nova", cm: 20, size: 0.035, color: "#db8769" },
  ] as MomentsWeight[],
};

/** Rail position (metres along the plank from the pivot) for a side and distance. */
export function railAt(side: BalanceSide, cm: number): number {
  return (side === "left" ? -cm : cm) / 100;
}

export function momentsKit(): LabKit {
  const plankZ = PIVOT_H + 0.001 + PLANK.thick / 2;
  const lo = MOMENTS.minCm / 100;
  const hi = MOMENTS.maxCm / 100;
  return {
    id: "moments",
    focus: PIVOT,
    // Both robots start on the walkway, each beside its own rail.
    spawns: { pip: [0, -0.3, 0], nova: [0, 0.3, 0] },
    subject: "Physics",
    topic: "Moments and balance",
    props: [
      {
        id: "pivot",
        label: "Pivot",
        role: "pivot",
        shape: { type: "wedge", width: 2 * MOMENTS.pivotHalf[1], length: 2 * MOMENTS.pivotHalf[0], height: PIVOT_H },
        joint: "fixed",
        pos: [PIVOT[0], PIVOT[1], 0],
        // Ridge must run across the plank (along the hinge axis, +x) so it can rock.
        yaw: Math.PI / 2,
        mass: 0,
        color: "#718e80",
      },
      {
        id: "plank",
        label: "Plank",
        role: "plank",
        shape: { type: "box", size: [PLANK.width, PLANK.length, PLANK.thick] },
        joint: "hinge",
        axis: [1, 0, 0],
        // Pivot pin 8 cm above the plank: like a beam balance's pivot above its
        // centre of mass, equal moments rest level, and a small imbalance
        // settles at a small tilt instead of tipping off a knife edge.
        anchor: [0, 0, MOMENTS.pinHeight],
        range: [-MOMENTS.tilt, MOMENTS.tilt],
        damping: 0.15,
        pos: [PIVOT[0], PIVOT[1], plankZ],
        yaw: 0,
        mass: 0.08,
        color: "#f8dda9",
      },
      ...MOMENTS.weights.flatMap((w): PropSpec[] => {
        const z = PLANK.thick / 2 + w.size / 2;
        return [
          {
            id: w.id,
            label: w.label,
            role: "weight",
            shape: { type: "box", size: [w.size, w.size, w.size] },
            joint: "slide",
            parent: "plank",
            axis: [0, 1, 0],
            range: w.side === "left" ? [-(hi + MOMENTS.railTravel), -(lo - MOMENTS.railTravel)] : [lo - MOMENTS.railTravel, hi + MOMENTS.railTravel],
            damping: 3,
            rest: railAt(w.side, w.cm),
            pos: [0, 0, z],
            yaw: 0,
            // The paddle is part of the weight, so the two add up to its label.
            mass: w.grams / 1000 - PADDLE.mass,
            color: w.color,
          },
          {
            id: `${w.id}-paddle`,
            label: `${w.label} paddle`,
            role: "paddle",
            shape: { type: "box", size: [PADDLE.reach, PADDLE.thick, PADDLE.height] },
            joint: "fixed",
            parent: w.id,
            pos: [-(PLANK.width + PADDLE.reach) / 2, 0, PADDLE.bottom + PADDLE.height / 2 - (plankZ + z)],
            yaw: 0,
            mass: PADDLE.mass,
            color: w.color,
            // A firm push face: MuJoCo's default soft contact let a pushing robot sink ~5 mm in.
            solref: [0.005, 1],
          },
        ];
      }),
    ],
    slots: [],
  };
}

export function freeKit(): LabKit {
  return {
    id: "free",
    focus: [0.1, 0],
    spawns: { pip: [-0.6, 0, 0], nova: [-0.6, -0.5, 0] },
    subject: "Sandbox",
    topic: "Free play",
    props: [
      tile("square-2", 2, [0.3, 0.3], "#5caca4"),
      tile("square-3", 3, [0.4, -0.35], "#dc8060"),
      block("crate", "Crate", [0.08, 0.08, 0.08], [-0.3, 0.5], "#d6b48e", { mass: 0.08 }),
      block("block-small", "Small block", [0.05, 0.05, 0.05], [0.6, 0], "#72aeb4", {
        mass: 0.04,
      }),
    ],
    slots: [],
  };
}

/** Fixed furniture shared by every lesson, so each kit sits in the same lab. */
export function roomProps(): PropSpec[] {
  return [
    block("bench", "Lab bench", [0.9, 0.22, 0.16], [0.35, 1.3], "#e0b18b", { joint: "fixed" }),
    block("shelf", "Shelf", [0.22, 0.7, 0.3], [-1.3, -0.75], "#819f8b", { joint: "fixed" }),
    block("crate-stack", "Crate", [0.18, 0.18, 0.18], [-1.25, 1.2], "#d6b48e", {
      joint: "fixed",
      yaw: 0.3,
    }),
  ];
}

export const KITS = { pythagoras: pythagorasKit, moments: momentsKit, free: freeKit };
export type KitId = keyof typeof KITS;

// ── Duck tasks ─────────────────────────────────────────────────────────
// The bounded actions a robot can be asked to do. Typed commands use this
// schema today. A transcript or an LLM tool call must produce the same
// shape, and the simulator validates it again against the live world.

const PropRef = z.string().min(1).max(40);
export const DuckTaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), meters: z.number().min(-1).max(2) }).strict(),
  z.object({ kind: z.literal("turn"), degrees: z.number().min(-360).max(360) }).strict(),
  z.object({ kind: z.literal("go_to"), target: PropRef }).strict(),
  z
    .object({ kind: z.literal("push"), target: PropRef, toward: PropRef.optional(), direction: z.enum(["left", "right", "forward", "backward"]).optional(), meters: z.number().min(0.05).max(1).optional() })
    .strict(),
  z.object({ kind: z.literal("kick"), foot: z.enum(["left", "right"]) }).strict(),
  /** Push a balance weight along its rail to a distance from the pivot (its owner robot does it). */
  z.object({ kind: z.literal("place_weight"), target: PropRef, cm: z.number().min(5).max(30) }).strict(),
  /**
   * The cooperative experiment: both robots push their own weights to these
   * marks, step clear, and the plank is released and measured.
   */
  z.object({ kind: z.literal("set_balance"), left_cm: z.number().min(5).max(30), right_cm: z.number().min(5).max(30) }).strict(),
  /** Both robots push the three squares onto the triangle, in stages that keep their paths apart. */
  z.object({ kind: z.enum(["sit", "stand", "peck", "roll", "stop", "release_plank", "lock_plank", "build_squares"]) }).strict(),
]);
export type DuckTask = z.infer<typeof DuckTaskSchema>;

export type ParseResult =
  | { ok: true; task: DuckTask }
  | { ok: false; reason: string };

const WORD_NUMBERS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * Resolve a spoken or typed name to a prop id: "the 3 square", "square three",
 * "five by five", "pivot", "plank".
 */
export function resolveProp(phrase: string, props: PropSpec[]): string | null {
  const p = phrase.toLowerCase().replace(/\b(the|a|an)\b/g, " ").trim();
  if (!p) return null;
  const direct = props.find(
    (x) => x.id === p || x.label.toLowerCase() === p || x.id.replace("-", " ") === p,
  );
  if (direct) return direct.id;
  // A number names a square by its side: "the 3 square", "five by five".
  const n = /(\d)|\b(two|three|four|five)\b/.exec(p);
  const units = n ? Number(n[1] ?? WORD_NUMBERS[n[2]!]) : null;
  if (units) {
    const t = props.find((x) => x.units === units);
    if (t) return t.id;
  }
  const word = props.find((x) => p.includes(x.role) || p.includes(x.label.toLowerCase()));
  return word?.id ?? null;
}

/** Resolve a phrase to a weight on a balance rail: "the 200 g weight", "weight-100". */
function resolveWeight(phrase: string, props: PropSpec[]): string | null {
  const rails = props.filter((p) => p.joint === "slide");
  const g = /(\d+)\s*(?:g|grams?)\b/.exec(phrase);
  if (g) return rails.find((p) => p.label.startsWith(`${g[1]} g`))?.id ?? null;
  return resolveProp(phrase, rails);
}

/**
 * Small deterministic grammar for typed commands and, later, transcripts.
 * It covers the base Microduck skills only. Anything else is refused
 * instead of guessed.
 */
export function parseDuckTask(text: string, props: PropSpec[]): ParseResult {
  const t = text.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (!t) return { ok: false, reason: "Say what the duck should do." };
  if (/^(stop|halt|freeze|wait)$/.test(t)) return { ok: true, task: { kind: "stop" } };
  if (/^(sit|sit down)$/.test(t)) return { ok: true, task: { kind: "sit" } };
  if (/^(stand|stand up|get up)$/.test(t)) return { ok: true, task: { kind: "stand" } };
  if (/^(peck|pick|nod|bow)( the ground)?$/.test(t)) return { ok: true, task: { kind: "peck" } };
  if (/^(roll|do a roll|tumble)$/.test(t)) return { ok: true, task: { kind: "roll" } };
  if (/jump/.test(t))
    return { ok: false, reason: "The base Microduck model has no jump skill yet." };
  const kick = /^kick(?: with)?(?: (?:the|your))? ?(left|right)?(?: foot)?$/.exec(t);
  if (kick) return { ok: true, task: { kind: "kick", foot: (kick[1] as "left" | "right") ?? "right" } };
  const move = /^(?:walk|move|go|step)\s+(forward|ahead|back|backward|backwards)\s*(\d+(?:\.\d+)?)?\s*(cm|centimeters?|m|meters?)?$/.exec(t);
  if (move) {
    const dist = move[2] ? Number(move[2]) * (move[3]?.startsWith("c") || !move[3] ? 0.01 : 1) : 0.2;
    const sign = move[1]!.startsWith("back") ? -1 : 1;
    return { ok: true, task: { kind: "move", meters: Math.min(2, dist) * sign } };
  }
  const turn = /^(?:turn|rotate|spin)\s+(left|right|around)\s*(\d+)?\s*(?:degrees?|°)?$/.exec(t);
  if (turn) {
    const deg = turn[1] === "around" ? 180 : Number(turn[2] ?? 90);
    return { ok: true, task: { kind: "turn", degrees: turn[1] === "right" ? -deg : deg } };
  }
  if (/^(?:release|unlock|let go of|free)\s+(?:the\s+)?(?:plank|beam|balance)$|^let (?:the )?(?:plank|beam|balance) go$/.test(t))
    return { ok: true, task: { kind: "release_plank" } };
  if (/^(?:lock|level|hold)\s+(?:the\s+)?(?:plank|beam|balance)(?: level)?$/.test(t))
    return { ok: true, task: { kind: "lock_plank" } };
  const place = /^(?:move|put|place|slide|push|set)\s+(.+?)\s+(?:to|at|onto)\s+(\d+(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?)?(?: mark)?$/.exec(t);
  const weight = place && resolveWeight(place[1]!, props);
  if (place && weight) {
    const cm = Number(place[2]);
    if (cm < 5 || cm > 30) return { ok: false, reason: "The rails run from 5 to 30 cm from the pivot." };
    return { ok: true, task: { kind: "place_weight", target: weight, cm } };
  }
  const push = /^(?:push|shove|nudge)\s+(.+?)(?:\s+(?:to|toward|towards|onto|into)\s+(.+))?$/.exec(t);
  if (push) {
    const target = resolveProp(push[1]!, props);
    if (!target) return { ok: false, reason: `I can't find “${push[1]}” in this lab.` };
    if (push[2]) {
      const toward = resolveProp(push[2], props) ?? (/slot|place|triangle/.test(push[2]) ? "slot" : null);
      if (!toward) return { ok: false, reason: `I can't find “${push[2]}” in this lab.` };
      return { ok: true, task: { kind: "push", target, toward } };
    }
    return { ok: true, task: { kind: "push", target } };
  }
  const go = /^(?:go|walk|move|head)\s+(?:to|over to|toward|towards)\s+(.+)$/.exec(t);
  if (go) {
    const target = resolveProp(go[1]!, props);
    if (!target) return { ok: false, reason: `I can't find “${go[1]}” in this lab.` };
    return { ok: true, task: { kind: "go_to", target } };
  }
  return {
    ok: false,
    reason:
      "I know: walk forward 20 cm, turn left, go to the 3 square, push the 5 square to its slot, move the 200 g weight to 10 cm, release the plank, kick, sit, stand, peck, roll, stop.",
  };
}
