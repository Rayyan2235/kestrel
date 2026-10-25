import { create } from "zustand";
import {
  CommandSchema,
  messageFor,
  previewExchange,
  type SimulationAdapter,
  type SimulationSnapshot,
  type ActionSubmission,
  type BotId,
  type Message,
  type World,
} from "@kestrel/contracts";
import { createSimulation } from "../simulation/runtime.js";
import { createLinkedController } from "../microduck/controller.js";
import { link } from "../microduck/link.js";

type Lab = {
  simulation: SimulationSnapshot;
  lastSubmission: ActionSubmission | null;
  selected: BotId;
  world: World;
  messages: Message[];
  busy: boolean;
  epoch: number;
  queued: Message[];
  nextTurn: number;
  select: (id: BotId) => void;
  submitAction: (input: unknown) => ActionSubmission;
  moveWeight: (side: "left" | "right", cm: number) => void;
  send: (text: string) => void;
  /** Address one bot explicitly, whatever is selected in the room. */
  sendTo: (botId: BotId, text: string) => void;
  startExchange: (initiator?: BotId) => number;
  deliverExchange: (token: number, turn: number) => void;
  stop: () => void;
  reset: () => void;
};
// Microduck bodies drive the approach when their physics is running; otherwise
// the authored reference controller does.
const runtime = createSimulation({ controller: createLinkedController() });
let requestSequence = 0;

export const useLab = create<Lab>((set, get) => ({
  simulation: runtime.getSnapshot(),
  lastSubmission: null,
  selected: "pip",
  world: runtime.getSnapshot().world,
  messages: [],
  busy: false,
  epoch: 0,
  queued: [],
  nextTurn: 0,
  select: (selected) => set({ selected }),
  submitAction: (input) => {
    const result = runtime.submit(input);
    const s = get();
    set({
      lastSubmission: result,
      ...(result.accepted && !result.duplicate
        ? {
            epoch: s.epoch + 1,
            queued: [],
            nextTurn: 0,
            busy: !!runtime.getSnapshot().activeAction,
          }
        : {}),
    });
    return result;
  },
  moveWeight: (side, cm) => {
    const s = get(),
      snapshot = runtime.getSnapshot();
    s.submitAction({
      requestId: `ui-${++requestSequence}`,
      botId: s.selected,
      worldRevision: snapshot.worldRevision,
      resetGeneration: snapshot.resetGeneration,
      action: "move-weight",
      stationId: "balance",
      objectId: side === "left" ? "left-weight" : "right-weight",
      parameters: { positionCm: cm },
    });
  },
  send: (text) => get().sendTo(get().selected, text),
  sendTo: (botId, text) => {
    const s = get();
    const parsed = CommandSchema.safeParse({
      botId,
      text,
      worldVersion: s.world.version,
    });
    if (!parsed.success) return;
    // Existing grammar is a scripted fixture. Its action suggestion is never a completion.
    const suggestion = messageFor(parsed.data, s.world);
    const capturedSnapshot = runtime.getSnapshot();
    const userMessage: Message = {
      speaker: "you",
      recipient: parsed.data.botId,
      text: parsed.data.text,
    };
    set({ messages: [...s.messages, userMessage].slice(-30) });
    if (suggestion.action) {
      s.submitAction({
        requestId: `ui-${++requestSequence}`,
        botId: parsed.data.botId,
        worldRevision: capturedSnapshot.worldRevision,
        resetGeneration: capturedSnapshot.resetGeneration,
        action: "move-weight",
        stationId: "balance",
        objectId:
          suggestion.action.side === "left" ? "left-weight" : "right-weight",
        parameters: { positionCm: suggestion.action.cm },
      });
      const submission = get().lastSubmission;
      if (submission && !submission.accepted)
        set((current) => ({
          messages: [
            ...current.messages,
            {
              speaker: parsed.data.botId,
              recipient: "you" as const,
              text: submission.error.message,
            },
          ].slice(-30),
        }));
    } else {
      set((current) => ({
        messages: [...current.messages, suggestion].slice(-30),
      }));
    }
  },
  startExchange: (initiator) => {
    const s = get();
    const from = initiator ?? s.selected;
    // The fixture exchanges observations only while the apparatus is settled.
    if (runtime.getSnapshot().activeAction) return s.epoch;
    const epoch = s.epoch + 1;
    set({
      epoch,
      busy: true,
      queued: previewExchange(from, s.world),
      nextTurn: 0,
    });
    return epoch;
  },
  deliverExchange: (token, turn) => {
    const s = get();
    if (token !== s.epoch || turn !== s.nextTurn || !s.queued[turn]) return;
    const remains = turn + 1 < s.queued.length;
    set({
      messages: [...s.messages, s.queued[turn]!].slice(-30),
      nextTurn: turn + 1,
      queued: remains ? s.queued : [],
      busy: remains || !!runtime.getSnapshot().activeAction,
    });
  },
  stop: () => {
    runtime.stop();
    set((s) => ({ epoch: s.epoch + 1, busy: false, queued: [], nextTurn: 0 }));
  },
  reset: () => {
    runtime.reset();
    set((s) => ({
      messages: [],
      epoch: s.epoch + 1,
      busy: false,
      queued: [],
      nextTurn: 0,
      lastSubmission: null,
    }));
  },
}));

runtime.subscribe((event) => {
  useLab.setState((s) => {
    const messages = [...s.messages];
    const action = event.action;
    if (action?.status === "started")
      messages.push({
        speaker: action.request.botId,
        recipient: "you",
        text: link.ready
          ? "Walking to the balance station to operate its weight control."
          : "I’ll approach the balance station and operate its weight control. (Game-controlled fixture.)",
      });
    if (action?.status === "completed" && action.result) {
      const side = action.request.objectId === "left-weight" ? "left" : "right";
      const cm = action.request.parameters.positionCm;
      messages.push({
        speaker: action.request.botId,
        recipient: "you",
        action: { side, cm },
        text: `The ${side} weight is now ${cm} cm from the pivot. Measured mass × distance: ${action.result.leftGramCentimeters} g·cm left and ${action.result.rightGramCentimeters} g·cm right. What changed?`,
      });
    }
    if (action?.status === "failed" || action?.status === "cancelled")
      messages.push({
        speaker: action.request.botId,
        recipient: "you",
        text: action.error?.message ?? "The action did not finish.",
      });
    return {
      simulation: event.snapshot,
      world: event.snapshot.world,
      messages: messages.slice(-30),
      busy: !!event.snapshot.activeAction || s.nextTurn < s.queued.length,
    };
  });
});

/** Provider-free local adapter. No work is scheduled until submit is called. */
export const labSimulation: SimulationAdapter = {
  ...runtime,
  submit: (input) => useLab.getState().submitAction(input),
  stop: () => useLab.getState().stop(),
  reset: () => useLab.getState().reset(),
};
