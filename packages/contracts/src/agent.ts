import { z } from "zod";
import { DuckTaskSchema } from "./lab.js";

const Text = z.object({ type: z.literal("text"), text: z.string().min(1).max(2400) }).strict();
const Tool = z.object({ type: z.literal("tool_use"), id: z.string().min(1).max(100), name: z.literal("duck_task"), input: DuckTaskSchema }).strict();
const Result = z.object({ type: z.literal("tool_result"), tool_use_id: z.string().min(1).max(100), content: z.string().max(5000), is_error: z.boolean() }).strict();
export const AgentMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.array(z.union([Text, Result])).min(1).max(4) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.array(z.union([Text, Tool])).min(1).max(4) }).strict(),
]);
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
const XY = z.tuple([z.number().finite(), z.number().finite()]);
export const AgentRequestSchema = z.object({
  botId: z.literal("pip"),
  worldVersion: z.number().int().nonnegative(),
  world: z.object({
    lesson: z.enum(["pythagoras", "moments", "free"]),
    duck: z.object({ x: z.number().finite(), y: z.number().finite(), yawDeg: z.number().finite(), mode: z.string().max(30) }).strict(),
    props: z.array(z.object({ id: z.string().max(40), label: z.string().max(80), movable: z.boolean(), position: XY, units: z.number().optional() }).strict()).max(20),
    slots: z.array(z.object({ forProp: z.string().max(40), position: XY, filled: z.boolean() }).strict()).max(10),
    // Measured state of the Moments balance: lock pin, tilt and each weight's rail position.
    balance: z.object({
      plank: z.enum(["locked", "levelling", "released"]),
      lowSide: z.enum(["left", "right", "level"]),
      tiltDeg: z.number().finite(),
      weights: z.array(z.object({ id: z.string().max(40), grams: z.number().positive(), side: z.enum(["left", "right"]), cm: z.number().finite() }).strict()).max(4),
    }).strict().optional(),
  }).strict(),
  messages: z.array(AgentMessageSchema).min(1).max(32),
  final: z.boolean().default(false),
}).strict();
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export const AgentResponseSchema = z.object({
  worldVersion: z.number().int().nonnegative(),
  content: z.array(z.union([Text, Tool])).min(1).max(4),
}).strict();
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// Tool exchanges must remain paired; reject malformed client histories before billing.
export function validConversation(messages: AgentMessage[]): boolean {
  let pending: string[] = [];
  for (const [i, m] of messages.entries()) {
    if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return false;
    if (m.role === "assistant") {
      pending = m.content.filter(b => b.type === "tool_use").map(b => b.id);
      if (pending.length > 1) return false;
    } else {
      const ids = m.content.filter(b => b.type === "tool_result").map(b => b.tool_use_id);
      if (ids.length !== pending.length || ids.some((id, n) => id !== pending[n])) return false;
      pending = [];
    }
  }
  return messages.at(-1)?.role === "user" && pending.length === 0;
}
