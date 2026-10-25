// Tester-owned helpers for layer gate tests. Not product code.
import {
  eventId,
  type Addressee,
  type LedgerEvent,
  type Respond,
} from "@kestrel/contracts";
import type {
  Provider,
  ProviderReply,
  ProviderRequest,
} from "../provider/types.js";

export const ev = (
  seq: number,
  from: Addressee,
  to: Addressee,
  over: Partial<LedgerEvent> = {},
): LedgerEvent => ({
  id: eventId(0, seq),
  seq,
  rootTurnId: "t0",
  causedBy: seq === 0 ? null : eventId(0, seq - 1),
  epoch: 0,
  worldVersion: 0,
  source: "mock",
  kind: "say",
  hop: 0,
  from,
  to,
  text: `m${seq}`,
  ...over,
});

export const say = (text: string): Respond => ({
  say: text,
  action: null,
  ask_peer: null,
});

export const askPeer = (
  to: "pip" | "nova",
  text = "Let me check with my partner.",
): Respond => ({
  say: text,
  action: null,
  ask_peer: { to, question: "What do you see?", evidence: "balance reading" },
});

type Pending = {
  req: ProviderRequest;
  signal: AbortSignal;
  resolve: (r: Respond) => void;
  reject: (e: unknown) => void;
};

/** A provider whose calls the test settles by hand. */
export const controlledProvider = () => {
  const calls: Pending[] = [];
  const provider: Provider = {
    respond: (req, signal) =>
      new Promise<ProviderReply>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        calls.push({
          req,
          signal,
          reject,
          resolve: (respond) => resolve({ respond, source: "mock" }),
        });
      }),
  };
  return { provider, calls };
};

/** A provider that answers at once from a function of the request. */
export const instantProvider = (
  fn: (req: ProviderRequest, n: number) => Respond,
) => {
  const seen: ProviderRequest[] = [];
  const provider: Provider = {
    respond: async (req) => {
      seen.push(req);
      return { respond: fn(req, seen.length), source: "mock" };
    },
  };
  return { provider, seen };
};

export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
