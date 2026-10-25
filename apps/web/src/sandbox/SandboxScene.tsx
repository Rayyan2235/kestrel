import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  MOMENTS,
  roomProps,
  slotFilled,
  type LabKit,
  type PropSpec,
  type SlotSpec,
} from "@kestrel/contracts";
import { CAMERA_OFFSET, ROOM_HALF, WALL_H, WALL_T } from "../simulation/constants";
import type { BotId } from "@kestrel/contracts";
import { BOTS, type DuckSim } from "../simulation/duckSim";
import { buildDuckRig, poseDuckRig, type DuckRig } from "../simulation/rig";
import type { BotLook } from "@kestrel/contracts";
import { applyLook, describeLook, dressingFor } from "../cosmetics/rig3d";
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

/** Centimetre ruler along a plank: ticks every cm, numbered every 10 cm out from the pivot. */
function rulerTexture(length: number, width: number, color: string) {
  const perCm = 16;
  const w = Math.round(width * 100 * perCm);
  const h = Math.round(length * 100 * perCm);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(24, 53, 44, 0.7)";
  const half = Math.floor((length * 100) / 2);
  for (let cm = -half; cm <= half; cm++) {
    const y = h / 2 - cm * perCm;
    const tick = cm % 10 === 0 ? 0.3 : cm % 5 === 0 ? 0.22 : 0.12;
    // From both long edges, so the ruler reads the same from either side.
    g.fillRect(0, y - 1, w * tick, 2);
    g.fillRect(w * (1 - tick), y - 1, w * tick, 2);
  }
  g.font = `800 ${Math.round(w * 0.42)}px "Plus Jakarta Sans Variable", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let cm = -30; cm <= 30; cm += 10) {
    g.save();
    g.translate(w / 2, h / 2 - cm * perCm);
    g.rotate(Math.PI / 2);
    g.fillText(String(Math.abs(cm)), 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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
      if (spec.role === "plank") {
        const top = new THREE.MeshStandardMaterial({ map: rulerTexture(s.size[1], s.size[0], spec.color), roughness: 0.8 });
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
    // A push face glows only while MuJoCo reports a robot touching it.
    if (spec.role === "paddle" && !Array.isArray(material)) {
      const f = sim.touchForce(spec.id);
      (material as THREE.MeshStandardMaterial).emissive.set(f > 0.05 ? "#7e49b3" : "#000000");
      (material as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(0.9, f / 6);
    }
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
    >
      {spec.role === "plank" && <PlankHanger />}
    </mesh>
  );
}

/** The hanger from the plank up to its pivot pin (moves with the plank; drawn, not simulated). */
function PlankHanger() {
  const h = MOMENTS.pinHeight;
  return (
    <group>
      <mesh position={[0, 0, h / 2 + 0.003]} castShadow>
        <boxGeometry args={[0.006, 0.012, h]} />
        <meshStandardMaterial color="#3a3a3e" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Moments dressing: the floor walkway the robots stand on (mechanically
 * separate from the beam), the stand that carries the pivot pin at the
 * hinge axis, and the lock collar, red while locked and green while free.
 * Visual only; the hinge, pin lock and rails are what MuJoCo simulates.
 */
function MomentsDressing({ sim }: { sim: DuckSim }) {
  const collar = useRef<THREE.MeshStandardMaterial>(null);
  const [px, py] = MOMENTS.pivot;
  const pinZ = 0.06 + 0.001 + MOMENTS.plank.thick / 2 + MOMENTS.pinHeight;
  const walk0 = MOMENTS.transitX - 0.09;
  const walk1 = MOMENTS.laneX + 0.03;
  useFrame(() => {
    const state = sim.pinState();
    collar.current?.color.set(state === "free" ? "#4f9d69" : state === "levelling" ? "#d2b54c" : "#c0453a");
  });
  return (
    <MjFrame>
      <mesh position={[(walk0 + walk1) / 2, py, 0.0012]} receiveShadow>
        <planeGeometry args={[walk1 - walk0, MOMENTS.plank.length + 0.3]} />
        <meshStandardMaterial color="#cfcfcf" roughness={0.95} transparent opacity={0.55} />
      </mesh>
      {/* Stand on the far side of the beam, carrying the pin over the plank. */}
      <mesh position={[px + 0.045, py, pinZ / 2]} castShadow>
        <boxGeometry args={[0.012, 0.03, pinZ]} />
        <meshStandardMaterial color="#141414" roughness={0.6} />
      </mesh>
      <mesh position={[px + 0.02, py, pinZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.004, 0.004, 0.055, 12]} />
        <meshStandardMaterial color="#cfcfcf" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[px + 0.034, py, pinZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.008, 16]} />
        <meshStandardMaterial ref={collar} color="#c0453a" />
      </mesh>
    </MjFrame>
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

/** One robot, posed from MuJoCo each frame. Rendering only reads physics state. */
function Robot({ sim, id, rig }: { sim: DuckSim; id: BotId; rig: DuckRig }) {
  const pose = useMemo(() => ({ pos: [0, 0, 0] as [number, number, number], quat: [1, 0, 0, 0] as [number, number, number, number] }), []);
  const angles = useMemo(() => new Float32Array(14), []);
  useFrame(() => {
    sim.readTrunk(pose, id);
    poseDuckRig(rig, pose.pos, pose.quat, sim.readJoints(angles, id));
  });
  return <primitive object={rig.placer} />;
}

function Duck({
  sim,
  bubble,
  focus,
}: {
  sim: DuckSim;
  bubble: React.RefObject<HTMLDivElement | null>;
  /** The lesson's apparatus, kept in frame together with the ducks. */
  focus: [number, number];
}) {
  const pose = useMemo(() => ({ pos: [0, 0, 0] as [number, number, number], quat: [1, 0, 0, 0] as [number, number, number, number] }), []);
  const other = useMemo(() => ({ pos: [0, 0, 0] as [number, number, number], quat: [1, 0, 0, 0] as [number, number, number, number] }), []);
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const { size } = useThree();
  useFrame(() => {
    sim.readTrunk(pose, "pip");
    sim.readTrunk(other, "nova");
    // Isometric follow: centre on both ducks and the lesson apparatus,
    // zooming out as they spread, so the experiment stays on screen.
    const mx = (pose.pos[0] + other.pos[0] + 2 * focus[0]) / 4;
    const my = (pose.pos[1] + other.pos[1] + 2 * focus[1]) / 4;
    target.lerp(new THREE.Vector3(mx, 0.1, -my), 0.06);
    camera.position.set(target.x + CAMERA_OFFSET[0], target.y + CAMERA_OFFSET[1], target.z + CAMERA_OFFSET[2]);
    camera.lookAt(target);
    const spread = Math.max(
      Math.hypot(pose.pos[0] - focus[0], pose.pos[1] - focus[1]),
      Math.hypot(other.pos[0] - focus[0], other.pos[1] - focus[1]),
    );
    const zoom = Math.min(420, Math.max(220, 470 - 190 * spread));
    if (Math.abs(camera.zoom - zoom) > 0.5) {
      camera.zoom += (zoom - camera.zoom) * 0.05;
      camera.updateProjectionMatrix();
    }
    // Anchor the speech bubble just above the duck's head, in screen space.
    const el = bubble.current;
    if (el) {
      const speaking = el.dataset.speaker === "nova" ? other.pos : pose.pos;
      head.set(speaking[0], speaking[2] + 0.2, -speaking[1]).project(camera);
      const x = ((head.x + 1) / 2) * size.width;
      const y = ((1 - head.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

/** Pip in Nox Noir graphite, Nova in Royal Amethyst. */
export const BOT_TINTS: Record<BotId, string> = { pip: "#3a3a3e", nova: "#7e49b3" };

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
  looks,
}: {
  sim: DuckSim;
  kit: LabKit;
  tint: string;
  /** Workshop looks per robot: shell colour and simple props, drawn only. */
  looks?: Record<BotId, BotLook>;
  onProgress: (filled: string[]) => void;
  /** Latest public reply from the duck, shown next to it. */
  bubble: { id: number; text: string; speaker: BotId } | null;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [rigs, setRigs] = useState<Record<BotId, DuckRig> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(BOTS.map((id) => buildDuckRig(BOT_TINTS[id] ?? tint))).then(
      (r) => live && setRigs(Object.fromEntries(BOTS.map((id, i) => [id, r[i]!])) as Record<BotId, DuckRig>),
      (e) => live && setError(String(e?.message ?? e)),
    );
    return () => {
      live = false;
    };
  }, [tint]);
  const dressings = useMemo(
    () =>
      rigs
        ? (Object.fromEntries(BOTS.map((id) => [id, dressingFor(rigs[id], BOT_TINTS[id] ?? tint)])) as Record<
            BotId,
            ReturnType<typeof dressingFor>
          >)
        : null,
    [rigs, tint],
  );
  useEffect(() => {
    if (!dressings || !looks) return;
    for (const id of BOTS) applyLook(dressings[id], looks[id]);
    // Dev-only handle for browser tests: what each robot wears.
    if (import.meta.env.DEV)
      (window as unknown as { kestrelLooks: unknown }).kestrelLooks = () =>
        Object.fromEntries(BOTS.map((id) => [id, describeLook(dressings[id])]));
  }, [dressings, looks]);
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
      {kit.id === "moments" && <MomentsDressing sim={sim} />}
      <MjFrame>
        {[...furniture, ...kit.props].map((p) => (
          <PropMesh key={`${kit.id}-${p.id}`} spec={p} sim={sim} />
        ))}
      </MjFrame>
      {rigs && BOTS.map((id) => <Robot key={id} sim={sim} id={id} rig={rigs[id]} />)}
      {rigs && <Duck sim={sim} bubble={bubbleRef} focus={kit.focus} />}
    </Canvas>
      {bubble && (
        <div key={bubble.id} ref={bubbleRef} data-speaker={bubble.speaker} className={styles.bubble} role="status">
          {bubble.text}
        </div>
      )}
    </div>
  );
}
