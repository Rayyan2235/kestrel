// World-space anchors the scene updates every frame, and the DOM elements
// that follow them. Projection writes transforms directly, so moving labels
// never re-render React. This module stays free of three.js so the interface
// shell can load before the 3D chunk.
export type AnchorId =
  | "pip"
  | "nova"
  | "pip-head"
  | "nova-head"
  | "left-weight"
  | "right-weight"
  | "pivot";

export type Point = { x: number; y: number; z: number };
export const anchorPositions = new Map<AnchorId, Point>();
export type Follower = { id: AnchorId; align: string };
export const followers = new Map<HTMLElement, Follower>();

export function setAnchor(id: AnchorId, x: number, y: number, z: number) {
  const existing = anchorPositions.get(id);
  if (existing) {
    existing.x = x;
    existing.y = y;
    existing.z = z;
  } else anchorPositions.set(id, { x, y, z });
}

/** Ref callback factory: the element is positioned at the anchor's screen point. */
export function follow(id: AnchorId, align = "translate(-50%, -100%)") {
  return (el: HTMLElement | null) => {
    if (!el) return;
    followers.set(el, { id, align });
    el.dataset.anchor = id;
    return () => {
      followers.delete(el);
    };
  };
}
