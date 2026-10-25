import type { MicroduckWorld } from "./physics";

/** The running physics world, for components that draw from it (null when it is not running). */
export const physics: { world: MicroduckWorld | null } = { world: null };
