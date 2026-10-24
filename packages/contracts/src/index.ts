import { z } from "zod";
export * from "./simulation.js";
export const BotSchema = z.enum(["pip", "nova"]);
export type BotId = z.infer<typeof BotSchema>;
export const CommandSchema = z
  .object({
    botId: BotSchema,
    text: z.string().trim().min(1).max(500),
    worldVersion: z.number().int().nonnegative(),
  })
  .strict();
export type Command = z.infer<typeof CommandSchema>;
export type World = {
  version: number;
  leftCm: number;
  rightCm: number;
  leftGrams: number;
  rightGrams: number;
};
export type Message = {
  speaker: BotId | "you";
  recipient: BotId | "you";
  text: string;
  action?: { side: "left" | "right"; cm: number };
};
export const BOT_NAMES: Record<BotId, string> = { pip: "Pip", nova: "Nova" };
export const createWorld = (): World => ({
  version: 0,
  leftCm: 20,
  rightCm: 20,
  leftGrams: 200,
  rightGrams: 100,
});
export function balance(w: World): "left" | "right" | "balanced" {
  const delta = w.leftGrams * w.leftCm - w.rightGrams * w.rightCm;
  return Math.abs(delta) < 0.001 ? "balanced" : delta > 0 ? "left" : "right";
}
export function applyWeight(
  world: World,
  side: "left" | "right",
  cm: number,
  version: number,
): World {
  if (version !== world.version) throw new Error("stale world version");
  z.enum(["left", "right"]).parse(side);
  z.number().min(5).max(45).parse(cm);
  return {
    ...world,
    version: world.version + 1,
    [side === "left" ? "leftCm" : "rightCm"]: cm,
  };
}
export function messageFor(command: Command, world: World): Message {
  if (command.worldVersion !== world.version)
    throw new Error("stale world version");
  const match =
    /^(?:move\s+(?:the\s+)?)?(left|right)(?:\s+weight)?\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*cm[.!]?$/i.exec(
      command.text.trim(),
    );
  if (match) {
    const side = match[1]!.toLowerCase() as "left" | "right";
    const cm = Number(match[2]);
    if (cm < 5 || cm > 45)
      return {
        speaker: command.botId,
        recipient: "you",
        text: "Choose a position from 5 to 45 cm from the pivot.",
      };
    return {
      speaker: command.botId,
      recipient: "you",
      text: `The ${side} weight is now ${cm} cm from the pivot. What changed?`,
      action: { side, cm },
    };
  }
  if (/^(why|hint|explain)[?.!]?$/i.test(command.text.trim()))
    return {
      speaker: command.botId,
      recipient: "you",
      text:
        balance(world) === "balanced"
          ? "Both sides have equal mass × distance. Try moving either weight and predict the tilt."
          : "Compare mass × distance on each side. What could you change to make those products equal?",
    };
  return {
    speaker: command.botId,
    recipient: "you",
    text: "This scripted preview understands “right weight to 40 cm”, “left weight to 10 cm”, and “hint”. Open conversation comes with the live AI connection.",
  };
}
export function previewExchange(botId: BotId, world: World): Message[] {
  const peer = botId === "pip" ? "nova" : "pip";
  const state = balance(world);
  return [
    {
      speaker: botId,
      recipient: peer,
      text: `${BOT_NAMES[peer]}, can you check which side has the larger turning effect?`,
    },
    {
      speaker: peer,
      recipient: botId,
      text:
        state === "balanced"
          ? "They are balanced: both mass × distance products match. Let’s ask our scientist to predict the next change."
          : `The ${state} side has the larger mass × distance product. Let’s ask our scientist what to try next.`,
    },
  ];
}
