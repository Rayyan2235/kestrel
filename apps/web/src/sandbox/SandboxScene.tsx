import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  roomProps,
  slotFilled,
  type LabKit,
  type PropSpec,
  type SlotSpec,
} from "@kestrel/contracts";
import { CAMERA_OFFSET, ROOM_HALF, WALL_H, WALL_T } from "../simulation/constants";
import type { DuckSim } from "../simulation/duckSim";
import { buildDuckRig, poseDuckRig, type DuckRig } from "../simulation/rig";
import styles from "./Sandbox.module.css";

// Everything inside <MjFrame> uses MuJoCo coordinates (z up), so props,
// slots and walls are placed with the same numbers the physics uses.
function MjFrame({ children }: { children: React.ReactNode }) {
  return <group rotation={[-Math.PI / 2, 0, 0]}>{children}</group>;
}

function labelTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: number } = {}) {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = opts.fg ?? "#203b33";
  g.font = `700 ${opts.font ?? 64}px "Plus Jakarta Sans Variable", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** n × n unit grid drawn on a tile's top face, so its area can be counted. */
function gridTexture(units: number, color: string) {
  const px = 64 * units;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, px, px);
  g.strokeStyle = "rgba(24, 53, 44, 0.55)";
  g.lineWidth = 3;
  for (let i = 0; i <= units; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, px);
    g.moveTo(0, i * 64);
    g.lineTo(px, i * 64);
    g.stroke();
  }
  g.fillStyle = "rgba(24, 53, 44, 0.8)";
  g.font = `800 ${Math.min(96, px / 2.6)}px "Plus Jakarta Sans Variable", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(units * units), px / 2, px / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function prismGeometry(verts: number[]) {
  // Two triangles (bottom 0-1-2, top 3-4-5) joined by three quads.
  const faces = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const i of faces) pos.push(verts[i * 3]!, verts[i * 3 + 1]!, verts[i * 3 + 2]!);
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function PropMesh({ spec, sim }: { spec: PropSpec; sim: DuckSim }) {
  const ref = useRef<THREE.Mesh>(null);
  const pose = useMemo(() => ({ pos: [0, 0, 0] as [number, number, number], quat: [1, 0, 0, 0] as [number, number, number, number] }), []);
  const { geometry, material } = useMemo(() => {
    const s = spec.shape;
    const base = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.75 });
    if (s.type === "box") {
      const geometry = new THREE.BoxGeometry(...s.size);
      if (spec.units) {
        const top = new THREE.MeshStandardMaterial({ map: gridTexture(spec.units, spec.color), roughness: 0.8 });
        return { geometry, material: [base, base, base, base, top, base] };
      }
      return { geometry, material: base };
    }
    if (s.type === "triangle") {
      const [a, b] = s.legs;
      return { geometry: prismGeometry([0, 0, 0, a, 0, 0, 0, b, 0, 0, 0, s.height, a, 0, s.height, 0, b, s.height]), material: base };
    }
    const w = s.width / 2, l = s.length / 2, h = s.height;
    return { geometry: prismGeometry([-w, -l, 0, w, -l, 0, 0, -l, h, -w, l, 0, w, l, 0, 0, l, h]), material: base };
  }, [spec]);
  useFrame(() => {
    const m = ref.current;
    if (!m || !sim.readProp(spec.id, pose)) return;
    m.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    m.quaternion.set(pose.quat[1], pose.quat[2], pose.quat[3], pose.quat[0]);
  });
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      position={spec.pos}
      rotation={[0, 0, spec.yaw]}
    />
  );
}

function Slot({ slot, filled }: { slot: SlotSpec; filled: boolean }) {
  const label = useMemo(() => labelTexture(slot.label, { font: 70 }), [slot.label]);
  const edge = useMemo(() => {
    const h = slot.side / 2;
    const g = new THREE.BufferGeometry().setFromPoints(
      [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    return g;
  }, [slot.side]);
  return (
    <group position={[slot.pos[0], slot.pos[1], 0.0015]} rotation={[0, 0, slot.yaw]}>
      <mesh>
        <planeGeometry args={[slot.side, slot.side]} />
        <meshBasicMaterial color={filled ? "#d2eb88" : "#f6f7ef"} transparent opacity={filled ? 0.85 : 0.45} />
      </mesh>
      <lineLoop geometry={edge}>
        <lineBasicMaterial color={filled ? "#456c53" : "#7d938a"} />
      </lineLoop>
      <mesh position={[0, -slot.side / 2 - 0.03, 0.001]}>
        <planeGeometry args={[0.2, 0.05]} />
        <meshBasicMaterial map={label} transparent />
      </mesh>
    </group>
  );
}

function Outline({ points }: { points: [number, number][] }) {
  const g = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0.002))),
    [points],
  );
  return (
    <line>
      <primitive object={g} attach="geometry" />
      <lineBasicMaterial color="#203b33" />
    </line>
  );
}

// Chalkboard on the −x wall, facing +x: text runs along +y, up is +z.
const BOARD_FACING = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
  ),
);

function Room({ kit }: { kit: LabKit }) {
  const board = useMemo(
    () =>
      labelTexture(
        kit.id === "pythagoras" ? "a² + b² = c²" : kit.id === "moments" ? "moment = mass × distance" : "Kestrel lab",
        { bg: "#2f4f45", fg: "#f2f6ed", w: 1024, h: 384, font: 120 },
      ),
    [kit.id],
  );
  const r = ROOM_HALF;
  return (
    <MjFrame>
      <mesh receiveShadow position={[0, 0, -0.01]}>
        <boxGeometry args={[2 * r + 0.6, 2 * r + 0.6, 0.02]} />
        <meshStandardMaterial color="#bbc9ad" roughness={0.95} />
      </mesh>
      <mesh receiveShadow position={[0, 0, 0.0005]}>
        <planeGeometry args={[2 * r, 2 * r]} />
        <meshStandardMaterial color="#d8dec8" roughness={0.95} />
      </mesh>
      {/* Far walls are tall for the room feel; near walls stay low so the camera sees in. */}
      <mesh receiveShadow position={[-r - WALL_T / 2, 0, 0.6]}>
        <boxGeometry args={[WALL_T, 2 * r + 2 * WALL_T, 1.2]} />
        <meshStandardMaterial color="#f0ecdd" />
      </mesh>
      <mesh receiveShadow position={[0, r + WALL_T / 2, 0.6]}>
        <boxGeometry args={[2 * r, WALL_T, 1.2]} />
        <meshStandardMaterial color="#e2e5d5" />
      </mesh>
      <mesh position={[-r + 0.002, 0.15, 0.7]} quaternion={BOARD_FACING}>
        <planeGeometry args={[1.5, 0.56]} />
        <meshStandardMaterial map={board} roughness={0.9} />
      </mesh>
      <mesh position={[r + WALL_T / 2, 0, WALL_H / 2]}>
        <boxGeometry args={[WALL_T, 2 * r + 2 * WALL_T, WALL_H]} />
        <meshStandardMaterial color="#c8d3bf" transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, -r - WALL_T / 2, WALL_H / 2]}>
        <boxGeometry args={[2 * r, WALL_T, WALL_H]} />
        <meshStandardMaterial color="#c8d3bf" transparent opacity={0.7} />
      </mesh>
    </MjFrame>
  );
}

function Duck({
  sim,
  rig,
  bubble,
  focus,
}: {
  sim: DuckSim;
  rig: DuckRig;
  bubble: React.RefObject<HTMLDivElement | null>;
  /** The lesson's apparatus, kept in frame together with the duck. */
  focus: [number, number];
}) {
  const pose = useMemo(() => ({ pos: [0, 0, 0] as [number, number, number], quat: [1, 0, 0, 0] as [number, number, number, number] }), []);
  const angles = useMemo(() => new Float32Array(14), []);
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const { size } = useThree();
  useFrame(() => {
    sim.readTrunk(pose);
    poseDuckRig(rig, pose.pos, pose.quat, sim.readJoints(angles));
    // Isometric follow: centre between the duck and the lesson apparatus,
    // zooming out as they separate, so the experiment stays on screen.
    const mx = (pose.pos[0] + focus[0]) / 2;
    const my = (pose.pos[1] + focus[1]) / 2;
    target.lerp(new THREE.Vector3(mx, 0.1, -my), 0.06);
    camera.position.set(target.x + CAMERA_OFFSET[0], target.y + CAMERA_OFFSET[1], target.z + CAMERA_OFFSET[2]);
    camera.lookAt(target);
    const spread = Math.hypot(pose.pos[0] - focus[0], pose.pos[1] - focus[1]);
    const zoom = Math.min(420, Math.max(240, 470 - 170 * spread));
    if (Math.abs(camera.zoom - zoom) > 0.5) {
      camera.zoom += (zoom - camera.zoom) * 0.05;
      camera.updateProjectionMatrix();
    }
    // Anchor the speech bubble just above the duck's head, in screen space.
    const el = bubble.current;
    if (el) {
      head.set(pose.pos[0], pose.pos[2] + 0.2, -pose.pos[1]).project(camera);
      const x = ((head.x + 1) / 2) * size.width;
      const y = ((1 - head.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  return <primitive object={rig.placer} />;
}

function Slots({ kit, sim, onProgress }: { kit: LabKit; sim: DuckSim; onProgress: (filled: string[]) => void }) {
  const [filled, setFilled] = useState<string[]>([]);
  const last = useRef("");
  useFrame(() => {
    if (!kit.slots.length) return;
    const props = sim.propPositions();
    const now = kit.slots.filter((s) => {
      const p = props.get(s.forProp);
      return p && slotFilled(p, s);
    }).map((s) => s.id);
    const key = now.join(",");
    if (key !== last.current) {
      last.current = key;
      setFilled(now);
      onProgress(now);
    }
  });
  return (
    <MjFrame>
      {kit.outline && <Outline points={kit.outline} />}
      {kit.slots.map((s) => (
        <Slot key={s.id} slot={s} filled={filled.includes(s.id)} />
      ))}
    </MjFrame>
  );
}

export function SandboxScene({
  sim,
  kit,
  tint,
  onProgress,
  bubble,
}: {
  sim: DuckSim;
  kit: LabKit;
  tint: string;
  onProgress: (filled: string[]) => void;
  /** Latest public reply from the duck, shown next to it. */
  bubble: { id: number; text: string } | null;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [rig, setRig] = useState<DuckRig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    buildDuckRig(tint).then((r) => live && setRig(r), (e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [tint]);
  const furniture = useMemo(() => roomProps(), []);
  if (error) return <div className="scene-fallback">The robot model could not load: {error}</div>;
  return (
    <div className={styles.sceneWrap}>
    <Canvas
      shadows
      orthographic
      camera={{ position: [2, 2, 2], zoom: 420, near: 0.01, far: 50 }}
      dpr={[1, 1.5]}
      fallback={<div className="scene-fallback">This browser cannot show the 3D lab.</div>}
    >
      <color attach="background" args={["#dde5d5"]} />
      <ambientLight intensity={1.3} />
      <directionalLight
        position={[2.5, 5, 3]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-normalBias={0.02}
      />
      <Room kit={kit} />
      <Slots kit={kit} sim={sim} onProgress={onProgress} />
      <MjFrame>
        {[...furniture, ...kit.props].map((p) => (
          <PropMesh key={`${kit.id}-${p.id}`} spec={p} sim={sim} />
        ))}
      </MjFrame>
      {rig && <Duck sim={sim} rig={rig} bubble={bubbleRef} focus={kit.focus} />}
    </Canvas>
      {bubble && (
        <div key={bubble.id} ref={bubbleRef} className={styles.bubble} role="status">
          {bubble.text}
        </div>
      )}
    </div>
  );
}
