import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DuckSim } from "../simulation/duckSim";
import { CAMERA_OFFSET } from "../simulation/constants";
import {
  clampZoom,
  fitZoom,
  panGround,
  type CameraCommand,
  type CameraMode,
} from "./camera";

export function LabCamera({
  sim,
  focus,
  command,
  onMode,
  reducedMotion,
}: {
  sim: DuckSim;
  focus: [number, number];
  command: CameraCommand;
  onMode: (mode: CameraMode) => void;
  reducedMotion: boolean;
}) {
  const { camera, gl, size } = useThree();
  const mode = useRef<CameraMode>("follow");
  const desired = useRef({
    center: [focus[0], -focus[1]] as [number, number],
    zoom: 250,
  });
  const target = useMemo(() => new THREE.Vector3(focus[0], 0.1, -focus[1]), []);
  const next = useMemo(() => new THREE.Vector3(), []);
  const poses = useMemo(
    () =>
      [0, 1].map(() => ({
        pos: [0, 0, 0] as [number, number, number],
        quat: [1, 0, 0, 0] as [number, number, number, number],
      })),
    [],
  );
  const setMode = (value: CameraMode) => {
    mode.current = value;
    onMode(value);
  };
  useEffect(() => {
    if (["left", "right", "up", "down"].includes(command.kind)) {
      const dx =
        command.kind === "left" ? 60 : command.kind === "right" ? -60 : 0;
      const dy = command.kind === "up" ? 60 : command.kind === "down" ? -60 : 0;
      desired.current = {
        center: panGround([target.x, target.z], dx, dy, camera.zoom),
        zoom: camera.zoom,
      };
      setMode("explore");
    } else if (command.kind === "in" || command.kind === "out") {
      desired.current.zoom = clampZoom(
        (mode.current === "explore" ? desired.current.zoom : camera.zoom) *
          (command.kind === "in" ? 1.2 : 1 / 1.2),
      );
      desired.current.center = [target.x, target.z];
      setMode("explore");
    } else {
      setMode(
        command.kind === "reset" ? "follow" : (command.kind as CameraMode),
      );
    }
  }, [command]);
  useEffect(() => {
    setMode("follow");
  }, [focus[0], focus[1]]);
  useEffect(() => {
    const canvas = gl.domElement;
    const points = new Map<number, { x: number; y: number }>();
    const gesture = () => {
      const a = [...points.values()];
      return {
        x: a.reduce((s, p) => s + p.x, 0) / a.length,
        y: a.reduce((s, p) => s + p.y, 0) / a.length,
        distance:
          a.length > 1 ? Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y) : 0,
      };
    };
    const explore = () => {
      if (mode.current !== "explore") {
        desired.current = { center: [target.x, target.z], zoom: camera.zoom };
        setMode("explore");
      }
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      canvas.setPointerCapture(e.pointerId);
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      const before = gesture();
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = gesture();
      if (
        before.x === after.x &&
        before.y === after.y &&
        before.distance === after.distance
      )
        return;
      explore();
      desired.current.center = panGround(
        desired.current.center,
        after.x - before.x,
        after.y - before.y,
        camera.zoom,
      );
      if (before.distance > 0 && after.distance > 0)
        desired.current.zoom = clampZoom(
          (desired.current.zoom * after.distance) / before.distance,
        );
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      explore();
      const delta =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.height : 1);
      desired.current.zoom = clampZoom(
        desired.current.zoom *
          Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002),
      );
    };
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.style.touchAction = "";
    };
  }, [gl, camera, size.height]);
  useFrame((_, dt) => {
    if (mode.current === "follow") {
      sim.readTrunk(poses[0]!, "pip");
      sim.readTrunk(poses[1]!, "nova");
      const a = poses[0]!.pos,
        b = poses[1]!.pos;
      desired.current.center = [
        (a[0] + b[0] + focus[0] * 2) / 4,
        -(a[1] + b[1] + focus[1] * 2) / 4,
      ];
      const spread = Math.max(
        Math.hypot(a[0] - focus[0], a[1] - focus[1]),
        Math.hypot(b[0] - focus[0], b[1] - focus[1]),
      );
      // Wide screens frame a little more of the playground, so the lesson
      // board behind the court stays in view between the floating panels.
      desired.current.zoom = fitZoom(
        size.width,
        size.height,
        Math.max(size.width > 900 ? 3.2 : 2.5, spread * 2 + 0.8),
      );
    } else if (mode.current === "experiment") {
      desired.current.center = [focus[0], -focus[1]];
      desired.current.zoom = fitZoom(size.width, size.height, 1.8);
    }
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-8 * Math.min(dt, 0.1));
    next.set(desired.current.center[0], 0.1, desired.current.center[1]);
    target.lerp(next, alpha);
    camera.position.set(
      target.x + CAMERA_OFFSET[0],
      target.y + CAMERA_OFFSET[1],
      target.z + CAMERA_OFFSET[2],
    );
    camera.lookAt(target);
    camera.zoom += (desired.current.zoom - camera.zoom) * alpha;
    camera.updateProjectionMatrix();
    gl.domElement.dataset.cameraMode = mode.current;
    gl.domElement.dataset.cameraZoom = camera.zoom.toFixed(2);
    gl.domElement.dataset.cameraTarget = `${target.x.toFixed(3)},${target.z.toFixed(3)}`;
  }, -1);
  return null;
}
