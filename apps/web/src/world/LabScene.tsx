import { useLayoutEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, Vector3 } from "three";
import type { BotId } from "@kestrel/contracts";
import { anchorPositions, followers } from "./anchors";
import { Apparatus } from "./Apparatus";
import { palette } from "./palette";
import { Lanes } from "./Lanes";
import { MicroduckBots } from "../microduck/MicroduckBots";
import { Robot } from "./Robot";
import { Room } from "./Room";

export type Insets = { top: number; bottom: number; left: number; right: number };
type Props = {
  selected: BotId;
  reduced: boolean;
  insets: Insets;
  onPickBot: (id: BotId) => void;
  onPickWeight: (side: "left" | "right") => void;
  onBackground: () => void;
};

// A high isometric view from the open corner of the room.
const AZIMUTH = Math.PI / 4;
const ELEVATION = (41 * Math.PI) / 180;
const DIRECTION = new Vector3(
  Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.cos(AZIMUTH),
);
const TARGET = new Vector3(0, 0.55, 0.2);

function regionFor(width: number) {
  // The experiment (bench, beam, both docking lanes) must always fit.
  const wide = width >= 900;
  const xs = wide ? [-2.35, 2.35] : [-1.9, 1.9];
  const zs = wide ? [-1.35, 1.95] : [-1.15, 1.85];
  const pts: Vector3[] = [];
  for (const x of xs) for (const z of zs) for (const y of [0, 1.7]) pts.push(new Vector3(x, y, z));
  return pts;
}

function CameraRig({ insets }: { insets: Insets }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    camera.position.copy(TARGET).addScaledVector(DIRECTION, 24);
    camera.up.set(0, 1, 0);
    camera.lookAt(TARGET);
    camera.updateMatrixWorld();
    const inverse = camera.matrixWorldInverse;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of regionFor(size.width)) {
      const v = p.clone().applyMatrix4(inverse);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const availW = Math.max(120, size.width - insets.left - insets.right);
    const availH = Math.max(120, size.height - insets.top - insets.bottom);
    const zoom = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    const cx = (minX + maxX) / 2 + (insets.right - insets.left) / 2 / zoom;
    const cy = (minY + maxY) / 2 - (insets.bottom - insets.top) / 2 / zoom;
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(right, cx).addScaledVector(up, cy);
    camera.zoom = zoom;
    camera.near = 0.1;
    camera.far = 80;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, size.width, size.height, insets.top, insets.bottom, insets.left, insets.right]);
  return null;
}

const scratch = new Vector3();
function Projector() {
  useFrame(({ camera, size }) => {
    for (const [el, { id, align }] of followers) {
      if (!el.isConnected) {
        followers.delete(el);
        continue;
      }
      const p = anchorPositions.get(id);
      if (!p) continue;
      scratch.set(p.x, p.y, p.z).project(camera);
      const x = Math.round(((scratch.x + 1) / 2) * size.width);
      const y = Math.round(((1 - scratch.y) / 2) * size.height);
      if (el.dataset.clamp !== undefined) {
        // Bubbles stay on screen; the tail keeps pointing at the speaker.
        const w = el.offsetWidth;
        const preferred = el.dataset.clamp === "left" ? x - w + 34 : el.dataset.clamp === "right" ? x - 34 : x - w / 2;
        const left = Math.min(Math.max(preferred, 8), Math.max(8, size.width - w - 8));
        el.style.setProperty("--tail-x", `${Math.min(Math.max(x - left, 18), w - 18)}px`);
        el.style.transform = `translate3d(${Math.round(left)}px, ${y}px, 0) translateY(calc(-100% - 12px))`;
      } else el.style.transform = `translate3d(${x}px, ${y}px, 0) ${align}`;
      el.style.visibility = "visible";
    }
  });
  return null;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#f1f6ff", "#c7b89f", 1.35]} />
      <directionalLight
        position={[5.5, 9, 6.5]}
        intensity={2.1}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      {/* Daylight through the back window */}
      <directionalLight position={[0.4, 4, -8]} intensity={0.55} color="#dcecff" />
    </>
  );
}

export function LabScene({ selected, reduced, insets, onPickBot, onPickWeight, onBackground }: Props) {
  return (
    <Canvas
      orthographic
      shadows="soft"
      dpr={[1, 2]}
      camera={{ zoom: 100, position: [12, 12, 12], near: 0.1, far: 80 }}
      gl={{ antialias: true }}
      onPointerMissed={onBackground}
      aria-hidden="true"
    >
      <color attach="background" args={[palette.sky]} />
      <CameraRig insets={insets} />
      <Lights />
      <Room />
      <Apparatus reduced={reduced} onPickWeight={onPickWeight} />
      <Lanes reduced={reduced} />
      <MicroduckBots
        selected={selected}
        onPick={onPickBot}
        fallback={
          <>
            <Robot id="pip" selected={selected === "pip"} reduced={reduced} onPick={onPickBot} />
            <Robot id="nova" selected={selected === "nova"} reduced={reduced} onPick={onPickBot} />
          </>
        }
      />
      <Projector />
    </Canvas>
  );
}
