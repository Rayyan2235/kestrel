import type { LabEvent } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

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
export const createLabEventLog = (): LabEventLog =>
  notImplemented("events.createLabEventLog");
