import type { LabEvent } from "@kestrel/contracts";

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;
export type LabEventInput = DistributiveOmit<LabEvent, "seq">;
export interface LabEventLog {
  /** Appends, assigning the next `seq`. */
  append(event: LabEventInput): LabEvent;
  events(): readonly LabEvent[];
  subscribe(listener: (event: LabEvent) => void): () => void;
  clear(): void;
}

export const createLabEventLog = (): LabEventLog => {
  let events: LabEvent[] = [];
  let seq = 0;
  const listeners = new Set<(event: LabEvent) => void>();
  return {
    append(input) {
      const event = { ...input, seq: seq++ } as LabEvent;
      events = [...events, event];
      listeners.forEach((fn) => fn(event));
      return event;
    },
    events: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    clear() {
      events = [];
      seq = 0;
    },
  };
};
