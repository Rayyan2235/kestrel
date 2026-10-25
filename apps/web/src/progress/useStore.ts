import { useSyncExternalStore } from "react";
import type { ProgressStore, ProgressView } from "./store.js";

export const useProgress = (store: ProgressStore): ProgressView =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
