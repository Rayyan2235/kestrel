/** Skeleton marker: a layer not built yet. Replaced as each layer lands. */
export const notImplemented = (what: string): never => {
  throw new Error(`not implemented: ${what}`);
};
