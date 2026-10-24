import { notImplemented } from "../notImplemented.js";
import type { Provider } from "../provider/types.js";
import type { SimAdapter } from "../simulation/types.js";
import type { Coordinator, CoordinatorConfig } from "./types.js";

export type CoordinatorDeps = {
  sim: SimAdapter;
  provider: Provider;
  config?: Partial<CoordinatorConfig>;
  /** Test hooks for deterministic time. */
  now?: () => number;
};

export * from "./types.js";
export const createCoordinator = (_deps: CoordinatorDeps): Coordinator =>
  notImplemented("createCoordinator");
