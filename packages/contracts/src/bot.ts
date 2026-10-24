import { z } from "zod";
export const BotSchema = z.enum(["pip", "nova"]);
export type BotId = z.infer<typeof BotSchema>;
