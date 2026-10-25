import { CAMERA_OFFSET, ROOM_HALF } from "../simulation/constants";
export type CameraMode = "follow" | "explore" | "experiment";
export type CameraCommand = {
  kind: CameraMode | "reset" | "in" | "out" | "left" | "right" | "up" | "down";
  serial: number;
};
export const clampZoom = (value: number) => Math.max(70, Math.min(650, value));
export const fitZoom = (width: number, height: number, span: number) =>
  clampZoom(Math.min(width / (span * 1.45), height / (span * 1.1)) * 0.78);
/** Drag moves the world with the pointer; orientation matches SCREEN_DIRS. */
export function panGround(
  center: [number, number],
  dx: number,
  dy: number,
  zoom: number,
): [number, number] {
  const [x, y, z] = CAMERA_OFFSET;
  const horizontal = Math.hypot(x, z);
  const elevation = y / Math.hypot(x, y, z);
  const clamp = (v: number) => Math.max(-ROOM_HALF, Math.min(ROOM_HALF, v));
  return [
    clamp(
      center[0] -
        ((dx / zoom) * z) / horizontal +
        ((dy / zoom / elevation) * x) / horizontal,
    ),
    clamp(
      center[1] +
        ((dx / zoom) * x) / horizontal +
        ((dy / zoom / elevation) * z) / horizontal,
    ),
  ];
}
