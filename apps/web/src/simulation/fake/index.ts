// TEMPORARY: stub simulation over the analytic balance world.
// Replaced by an adapter over the real simulation when it lands; nothing
// above SimAdapter may depend on this file.
import { notImplemented } from "../../notImplemented.js";
import type { SimAdapter } from "../types.js";

export const createFakeSim = (): SimAdapter => notImplemented("createFakeSim");
