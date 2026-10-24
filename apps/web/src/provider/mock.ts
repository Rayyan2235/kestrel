import { BOT_NAMES, type Respond } from "@kestrel/contracts";
import type { Provider, ProviderRequest } from "./types.js";

export type MockProviderOptions = {
  /** Injected latency per call: 1000, 3000 or 6000 in the demo. */
  delayMs: number;
  /** Test hook for deterministic time. Defaults to setTimeout. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Scripted, no network. Same input always gives the same output. */
const script = (req: ProviderRequest): Respond => {
  if (req.peer)
    return {
      say: `Compare mass × distance on each side. What do you predict?`,
      action: null,
      ask_peer: null,
    };
  if (/\b(ask|why|help|heavier)\b/i.test(req.input)) {
    const other = req.bot === "pip" ? "nova" : "pip";
    return {
      say: `Let me check with ${BOT_NAMES[other]}.`,
      action: null,
      ask_peer: {
        to: other,
        question: "Which side has the larger turning effect?",
        evidence: "Balance reading",
      },
    };
  }
  return {
    say: "Try moving one weight, but predict the tilt first.",
    action: null,
    ask_peer: null,
  };
};

/** Deterministic, no network, no keys. Output is always labelled `mock`. */
export const createMockProvider = (options: MockProviderOptions): Provider => {
  const sleep = options.sleep ?? defaultSleep;
  return {
    async respond(req, signal) {
      signal.throwIfAborted();
      await sleep(options.delayMs, signal);
      signal.throwIfAborted();
      return { respond: script(req), source: "mock" };
    },
  };
};
