import { create } from "zustand";
import {
  applyWeight,
  CommandSchema,
  createWorld,
  messageFor,
  previewExchange,
  type BotId,
  type Message,
  type World,
} from "@kestrel/contracts";
type Lab = {
  selected: BotId;
  world: World;
  messages: Message[];
  busy: boolean;
  epoch: number;
  queued: Message[];
  nextTurn: number;
  select: (id: BotId) => void;
  moveWeight: (side: "left" | "right", cm: number) => void;
  send: (text: string) => void;
  startExchange: () => number;
  deliverExchange: (token: number, turn: number) => void;
  stop: () => void;
  reset: () => void;
};
export const useLab = create<Lab>((set, get) => ({
  selected: "pip",
  world: createWorld(),
  messages: [],
  busy: false,
  epoch: 0,
  queued: [],
  nextTurn: 0,
  select: (selected) => set({ selected }),
  moveWeight: (side, cm) => {
    const s = get();
    set({
      world: applyWeight(s.world, side, cm, s.world.version),
      epoch: s.epoch + 1,
      busy: false,
      queued: [],
      nextTurn: 0,
    });
  },
  send: (text) => {
    const s = get();
    const parsed = CommandSchema.safeParse({
      botId: s.selected,
      text,
      worldVersion: s.world.version,
    });
    if (!parsed.success) return;
    const reply = messageFor(parsed.data, s.world);
    const world = reply.action
      ? applyWeight(
          s.world,
          reply.action.side,
          reply.action.cm,
          s.world.version,
        )
      : s.world;
    const userMessage: Message = {
      speaker: "you",
      recipient: s.selected,
      text: parsed.data.text,
    };
    set({
      world,
      messages: [...s.messages, userMessage, reply].slice(-30),
      epoch: s.epoch + 1,
      busy: false,
      queued: [],
      nextTurn: 0,
    });
  },
  startExchange: () => {
    const s = get();
    const epoch = s.epoch + 1;
    set({
      epoch,
      busy: true,
      queued: previewExchange(s.selected, s.world),
      nextTurn: 0,
    });
    return epoch;
  },
  deliverExchange: (token, turn) => {
    const s = get();
    if (!s.busy || token !== s.epoch || turn !== s.nextTurn || !s.queued[turn])
      return;
    set({
      messages: [...s.messages, s.queued[turn]!].slice(-30),
      nextTurn: turn + 1,
      busy: turn + 1 < s.queued.length,
    });
  },
  stop: () =>
    set((s) => ({ epoch: s.epoch + 1, busy: false, queued: [], nextTurn: 0 })),
  reset: () =>
    set((s) => ({
      world: { ...createWorld(), version: s.world.version + 1 },
      messages: [],
      epoch: s.epoch + 1,
      busy: false,
      queued: [],
      nextTurn: 0,
    })),
}));
