import { notImplemented } from "../notImplemented.js";
import type { Provider } from "./types.js";

export type MockProviderOptions = {
  /** Injected latency per call: 1000, 3000 or 6000 in the demo. */
  delayMs: number;
  /** Test hook for deterministic time. Defaults to setTimeout. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

/** Deterministic, no network, no keys. Output is always labelled `mock`. */
export const createMockProvider = (_options: MockProviderOptions): Provider =>
  notImplemented("createMockProvider");
