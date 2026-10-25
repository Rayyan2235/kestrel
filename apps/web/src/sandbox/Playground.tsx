import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { LabKit } from "@kestrel/contracts";
import { ROOM_HALF, SCREEN_DIRS } from "../simulation/constants";
import { Foliage, SimpleCanopies, barkTexture, type Canopy } from "./Foliage";
import { Grass } from "./Grass";
import { GardenFence } from "./GardenFence";
import {
  PLAY,
  contactShadeTexture,
  courtTexture,
  grassTexture,
  hopscotchTexture,
  sandTexture,
  skyTexture,
} from "./playgroundMaterials";

// Everything here is in MuJoCo coordinates (z up), like the props it surrounds.
// The court inside ROOM_HALF is empty floor; all equipment stands outside the
// boundary wall, so none of it needs a collider and none of it can be walked into.
type V3 = [number, number, number];
const GRAVITY = 9.81;

function Rounded({
  at,
  size,
  color,
  rotation,
  radius = 0.2,
}: {
  at: V3;
  size: V3;
  color: string;
  rotation?: V3;
  radius?: number;
}) {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(...size, 2, Math.min(...size) * radius),
    [...size, radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} rotation={rotation} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

/** A round bar between two points: frame legs, chains, ladder rails. */
function Rod({
  from,
  to,
  radius,
  color,
  metal = false,
}: {
  from: V3;
  to: V3;
  radius: number;
  color: string;
  metal?: boolean;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = b.clone().sub(a);
    return {
      length: d.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
      position: a.add(b).multiplyScalar(0.5),
    };
  }, [...from, ...to]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshStandardMaterial color={color} roughness={metal ? 0.3 : 0.5} metalness={metal ? 0.6 : 0} />
    </mesh>
  );
}

function Sky() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const texture = skyTexture();
    const previous = scene.background;
    scene.background = texture;
    return () => {
      scene.background = previous;
      texture.dispose();
    };
  }, [scene]);
  return null;
}

function Island({ grass }: { grass: THREE.Texture }) {
  return (
    <mesh position={[0, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <cylinderGeometry args={[3.9, 3.7, 0.3, 96, 1]} />
      <meshStandardMaterial attach="material-0" color={PLAY.soil} roughness={0.95} />
      <meshStandardMaterial attach="material-1" map={grass} roughness={0.95} />
      <meshStandardMaterial attach="material-2" color={PLAY.soil} roughness={0.95} />
    </mesh>
  );
}

/** Painted dashes around the experiment area: a station cue that stays flush with the floor. */
function LearningZone({ focus }: { focus: [number, number] }) {
  return (
    <group position={[focus[0], focus[1], 0]}>
      <mesh position={[0, 0, 0.0006]} receiveShadow>
        <circleGeometry args={[0.78, 72]} />
        <meshStandardMaterial color={PLAY.zone} roughness={0.9} />
      </mesh>
      {Array.from({ length: 28 }, (_, i) => (
        <mesh key={i} position={[0, 0, 0.0008]}>
          <ringGeometry args={[0.77, 0.8, 6, 1, (i / 28) * Math.PI * 2, (Math.PI * 2) / 28 / 1.8]} />
          <meshBasicMaterial color={PLAY.zoneEdge} />
        </mesh>
      ))}
    </group>
  );
}

function FocusTarget({ focus, onFocus }: { focus: [number, number]; onFocus: () => void }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);
  return (
    <group position={[focus[0] + 0.56, focus[1] - 0.56, 0.001]} scale={hover ? 1.15 : 1}>
      <mesh
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          onFocus();
        }}
      >
        <circleGeometry args={[0.07, 40]} />
        <meshBasicMaterial color={PLAY.paint} />
      </mesh>
      <mesh position={[0, 0, 0.0002]}>
        <ringGeometry args={[0.03, 0.05, 40]} />
        <meshBasicMaterial color={PLAY.coral} />
      </mesh>
    </group>
  );
}

/** Two swings whose sway uses the real pendulum period for their chain length. */
function SwingSet({ at, yaw = 0, reducedMotion }: { at: V3; yaw?: number; reducedMotion: boolean }) {
  const top = 0.62;
  const chain = 0.47;
  const omega = Math.sqrt(GRAVITY / chain);
  const swings = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  useFrame(({ clock }) => {
    swings.forEach((s, i) => {
      if (s.current) s.current.rotation.x = reducedMotion ? 0 : (i ? 0.05 : 0.07) * Math.sin(omega * clock.elapsedTime + i * 1.9);
    });
  });
  return (
    <group position={at} rotation={[0, 0, yaw]}>
      <Rounded at={[0, 0, -0.016]} size={[1.05, 0.62, 0.01]} color={PLAY.blue} radius={0.4} />
      {[-0.45, 0.45].map((x) => (
        <group key={x}>
          <Rod from={[x, -0.22, 0]} to={[x, 0, top]} radius={0.018} color={PLAY.yellow} />
          <Rod from={[x, 0.22, 0]} to={[x, 0, top]} radius={0.018} color={PLAY.yellow} />
        </group>
      ))}
      <Rod from={[-0.48, 0, top]} to={[0.48, 0, top]} radius={0.017} color={PLAY.coral} />
      {[-0.19, 0.19].map((x, i) => (
        <group key={x} ref={swings[i]} position={[x, 0, top]}>
          {[-0.065, 0.065].map((dx) => (
            <Rod key={dx} from={[dx, 0, 0]} to={[dx, 0, -chain]} radius={0.0035} color={PLAY.metal} metal />
          ))}
          <Rounded at={[0, 0, -chain - 0.006]} size={[0.17, 0.065, 0.014]} color={i ? PLAY.mint : PLAY.coral} radius={0.4} />
        </group>
      ))}
    </group>
  );
}

function Slide({ at, yaw = 0 }: { at: V3; yaw?: number }) {
  const deck = 0.36;
  const drop = Math.atan2(deck - 0.05, 0.7);
  const chute = Math.hypot(deck - 0.05, 0.7);
  return (
    <group position={at} rotation={[0, 0, yaw]}>
      {[
        [-0.1, -0.55],
        [0.1, -0.55],
        [-0.1, -0.35],
        [0.1, -0.35],
      ].map(([x, y]) => (
        <Rod key={`${x},${y}`} from={[x!, y!, 0]} to={[x!, y!, 0.58]} radius={0.014} color={PLAY.yellow} />
      ))}
      <Rounded at={[0, -0.45, deck]} size={[0.24, 0.24, 0.03]} color={PLAY.coral} radius={0.3} />
      <mesh position={[0, -0.45, 0.66]} rotation={[Math.PI / 2, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.2, 0.16, 4]} />
        <meshStandardMaterial color={PLAY.coral} roughness={0.5} />
      </mesh>
      {[-0.09, 0.09].map((x) => (
        <Rod key={x} from={[x, -0.85, 0]} to={[x, -0.57, deck]} radius={0.01} color={PLAY.blue} />
      ))}
      {[0.08, 0.16, 0.24, 0.32].map((z) => (
        <Rod key={z} from={[-0.09, -0.85 + (0.28 * z) / deck, z]} to={[0.09, -0.85 + (0.28 * z) / deck, z]} radius={0.008} color={PLAY.paint} />
      ))}
      <group position={[0, -0.33 + 0.35, (deck + 0.05) / 2 + 0.012]} rotation={[-drop, 0, 0]}>
        <Rounded at={[0, 0, 0]} size={[0.17, chute, 0.018]} color={PLAY.blue} radius={0.4} />
        {[-0.09, 0.09].map((x) => (
          <Rounded key={x} at={[x, 0, 0.025]} size={[0.018, chute, 0.05]} color={PLAY.yellow} radius={0.4} />
        ))}
      </group>
      <Rounded at={[0, 0.44, 0.04]} size={[0.17, 0.16, 0.018]} color={PLAY.blue} radius={0.4} />
    </group>
  );
}

/** A seesaw at rest on one end, as an empty one would be. It is the Moments lesson at play size. */
function Seesaw({ at }: { at: V3 }) {
  const half = 0.45;
  const pivot = 0.1;
  const tilt = Math.asin((pivot - 0.012) / half);
  return (
    <group position={at}>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 4, 0, 0]} castShadow>
        <boxGeometry args={[0.12, 0.14, 0.14]} />
        <meshStandardMaterial color={PLAY.coral} roughness={0.55} />
      </mesh>
      <group position={[0, 0, pivot]} rotation={[tilt, 0, 0]}>
        <Rounded at={[0, 0, 0]} size={[0.1, 2 * half, 0.02]} color={PLAY.yellow} radius={0.4} />
        {[-half + 0.08, half - 0.08].map((y) => (
          <group key={y}>
            <Rod from={[-0.04, y, 0.01]} to={[-0.04, y, 0.08]} radius={0.007} color={PLAY.blue} />
            <Rod from={[0.04, y, 0.01]} to={[0.04, y, 0.08]} radius={0.007} color={PLAY.blue} />
            <Rod from={[-0.04, y, 0.08]} to={[0.04, y, 0.08]} radius={0.007} color={PLAY.blue} />
          </group>
        ))}
      </group>
    </group>
  );
}

function Sandpit({ at, sand }: { at: V3; sand: THREE.Texture }) {
  const w = 0.72,
    d = 0.56,
    t = 0.045,
    h = 0.06;
  return (
    <group position={at}>
      <Rounded at={[0, d / 2, h / 2]} size={[w, t, h]} color={PLAY.wood} radius={0.3} />
      <Rounded at={[0, -d / 2, h / 2]} size={[w, t, h]} color={PLAY.wood} radius={0.3} />
      <Rounded at={[w / 2, 0, h / 2]} size={[t, d, h]} color={PLAY.wood} radius={0.3} />
      <Rounded at={[-w / 2, 0, h / 2]} size={[t, d, h]} color={PLAY.wood} radius={0.3} />
      <mesh position={[0, 0, h - 0.018]} receiveShadow>
        <planeGeometry args={[w - t, d - t]} />
        <meshStandardMaterial map={sand} roughness={1} />
      </mesh>
      <mesh position={[0.15, 0.08, h + 0.01]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.038, 0.075, 24]} />
        <meshStandardMaterial color={PLAY.coral} roughness={0.45} />
      </mesh>
      <Rod from={[0.02, -0.12, h]} to={[0.15, -0.04, h + 0.06]} radius={0.006} color={PLAY.blue} />
      <group position={[-0.14, 0.02, h - 0.02]}>
        {[
          [0, 0, 0.06],
          [0.07, 0.03, 0.045],
          [-0.06, 0.04, 0.045],
        ].map(([x, y, s]) => (
          <mesh key={`${x},${y}`} position={[x!, y!, s! / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[s! * 0.55, s! * 0.65, s!, 16]} />
            <meshStandardMaterial map={sand} roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const LEAVES = ["#4f9a3e", "#62ad48", "#78bd55"];

/** Leaf clusters for one tree, sized by the tree's scale. */
function treeCanopies(x: number, y: number, s: number): Canopy[] {
  return (
    [
      [0, 0, 0.72, 0.3],
      [0.17, 0.08, 0.6, 0.22],
      [-0.15, -0.07, 0.62, 0.22],
      [0.03, -0.04, 0.9, 0.2],
      [-0.05, 0.15, 0.76, 0.22],
    ] as const
  ).map(([dx, dy, z, r], i) => ({ at: [x + dx * s, y + dy * s, z * s - 0.02], radius: r * s, color: LEAVES[i % 3]! }));
}

/** Tapered bark trunk and branches; the canopy is drawn by <Foliage>. */
function Trunk({ at, scale, bark }: { at: V3; scale: number; bark: THREE.Texture }) {
  return (
    <group position={at} scale={scale}>
      <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.026, 0.048, 0.6, 14]} />
        <meshStandardMaterial map={bark} roughness={0.95} />
      </mesh>
      {(
        [
          [0.15, 0.07, 0.56],
          [-0.13, -0.06, 0.58],
          [-0.04, 0.13, 0.7],
        ] as const
      ).map(([x, y, z]) => (
        <Rod key={`${x},${y}`} from={[0, 0, 0.36]} to={[x, y, z]} radius={0.012} color="#7a5639" />
      ))}
    </group>
  );
}

function Flowers({ at, color }: { at: V3; color: string }) {
  return (
    <group position={at}>
      {[
        [0.05, 0.03, 0.11],
        [-0.06, -0.02, 0.1],
        [0.0, -0.06, 0.12],
        [-0.02, 0.06, 0.12],
      ].map(([x, y, z]) => (
        <mesh key={`${x},${y}`} position={[x!, y!, z!]}>
          <sphereGeometry args={[0.014, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Bench({ at, yaw }: { at: V3; yaw: number }) {
  return (
    <group position={at} rotation={[0, 0, yaw]}>
      {[-0.03, 0.03].map((y) => (
        <Rounded key={y} at={[0, y, 0.085]} size={[0.42, 0.05, 0.014]} color={PLAY.wood} radius={0.3} />
      ))}
      <Rounded at={[0, 0.07, 0.15]} size={[0.42, 0.014, 0.06]} color={PLAY.wood} radius={0.3} />
      {[-0.17, 0.17].map((x) => (
        <Rounded key={x} at={[x, 0.02, 0.05]} size={[0.025, 0.11, 0.1]} color={PLAY.blue} radius={0.3} />
      ))}
    </group>
  );
}

/** Flags on a sagging string; they flutter only when motion is allowed. */
function Bunting({ from, to, reducedMotion }: { from: V3; to: V3; reducedMotion: boolean }) {
  const count = 11;
  const flags = useRef<(THREE.Mesh | null)[]>([]);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.04, 0);
    s.lineTo(0.04, 0);
    s.lineTo(0, -0.075);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useEffect(() => () => shape.dispose(), [shape]);
  const points = useMemo(
    () =>
      Array.from({ length: count + 2 }, (_, i) => {
        const t = i / (count + 1);
        const sag = 0.14 * 4 * t * (1 - t);
        return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t - sag] as V3;
      }),
    [...from, ...to],
  );
  const heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    flags.current.forEach((f, i) => {
      if (f) f.rotation.x = Math.PI / 2 + 0.18 * Math.sin(clock.elapsedTime * 1.6 + i * 0.7);
    });
  });
  const colors = [PLAY.coral, PLAY.yellow, PLAY.blue, PLAY.mint, PLAY.pink];
  return (
    <group>
      {points.slice(1).map((p, i) => (
        <Rod key={`s${i}`} from={points[i]!} to={p} radius={0.0025} color={PLAY.paint} />
      ))}
      {points.slice(1, -1).map((p, i) => (
        <group key={i} position={p} rotation={[0, 0, heading]}>
          <mesh ref={(m) => void (flags.current[i] = m)} geometry={shape} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <meshStandardMaterial color={colors[i % colors.length]} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Clouds all around the floating island, one instanced draw. Each drifts
 * sideways on its own slow cycle; reduced motion holds them still.
 */
function Clouds({ reducedMotion }: { reducedMotion: boolean }) {
  const { mesh, puffs, geometry, material } = useMemo(() => {
    let seed = 314;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const [rx, ry] = SCREEN_DIRS.right;
    // Placed by where they appear on screen (right, up, in metres at zoom 1):
    // the sky band above the island, its corners and sides, and below the rim.
    // None of these spots projects over the court or its border.
    const SPOTS: [number, number, number][] = [
      [-1.6, 2.7, 0.9], [1.4, 2.9, 1], [0.1, 3.5, 0.8], [-3.0, 3.6, 0.9], [3.1, 3.8, 0.9],
      [-3.4, 2.1, 1.1], [3.4, 2.3, 1], [-4.6, 1.2, 0.9], [4.5, 1.4, 0.9],
      [-5.0, -0.2, 0.8], [5.1, 0.1, 0.9],
      [-3.8, -2.0, 1], [3.6, -2.3, 1.1], [-1.2, -3.2, 0.9], [1.6, -3.4, 1], [-4.8, -1.4, 0.7], [4.9, -1.2, 0.7],
    ];
    const clouds = SPOTS.map(([right, up, scale]) => {
      // Height above (or below) the island, then the ground depth that puts it at `up`.
      const z = up > 1 ? 1.1 + random() * 0.7 : up < -1 ? -1.2 + random() * 0.5 : 0.2 + random() * 0.3;
      const depth = (up - 0.83 * z) / 0.56;
      return {
        at: new THREE.Vector3((right - depth) * Math.SQRT1_2, (right + depth) * Math.SQRT1_2, z),
        scale,
        phase: random() * Math.PI * 2,
        rate: 1 / (50 + random() * 40),
      };
    });
    const puffs = clouds.flatMap((c) =>
      Array.from({ length: 5 }, (_, k) => {
        const t = (k / 4 - 0.5) * 0.9 + (random() - 0.5) * 0.12;
        return {
          cloud: c,
          offset: new THREE.Vector3(rx * t, ry * t, (0.5 - Math.abs(t)) * 0.28 + random() * 0.06).multiplyScalar(c.scale),
          radius: (0.34 - Math.abs(t) * 0.28 + random() * 0.05) * c.scale,
        };
      }),
    );
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, puffs.length);
    return { mesh, puffs, geometry, material };
  }, []);
  useEffect(
    () => () => {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
    [mesh, geometry, material],
  );
  const o = useMemo(() => new THREE.Object3D(), []);
  const place = (time: number) => {
    const [rx, ry] = SCREEN_DIRS.right;
    puffs.forEach((p, i) => {
      const drift = Math.sin(time * p.cloud.rate * Math.PI * 2 + p.cloud.phase) * 0.35;
      o.position.copy(p.cloud.at).add(p.offset);
      o.position.x += rx * drift;
      o.position.y += ry * drift;
      o.scale.setScalar(p.radius);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  useEffect(() => place(0), [puffs]);
  useFrame(({ clock }) => {
    if (!reducedMotion) place(clock.elapsedTime);
  });
  return <primitive object={mesh} />;
}

const boardFont = (weight: number, size: number) => `${weight} ${size}px "Plus Jakarta Sans Variable", sans-serif`;

/**
 * The lesson board: the rule behind the activity, drawn to scale. It is a
 * diagram, never a live result; measured results stay in the console.
 */
function drawBoard(lesson: string) {
  const W = 2048,
    H = 990;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = PLAY.chalkboard;
  g.fillRect(0, 0, W, H);
  let seed = 55;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 6; i++) {
    const x = random() * W,
      y = random() * H;
    const smudge = g.createRadialGradient(x, y, 0, x, y, 260);
    smudge.addColorStop(0, "rgba(245,242,232,.06)");
    smudge.addColorStop(1, "rgba(245,242,232,0)");
    g.fillStyle = smudge;
    g.fillRect(x - 260, y - 260, 520, 520);
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(245,242,232,${0.02 + random() * 0.04})`;
    g.fillRect(random() * W, random() * H, 2, 2);
  }
  g.lineCap = g.lineJoin = "round";
  const text = (s: string, x: number, y: number, size: number, color: string = PLAY.chalk, weight = 600, align: CanvasTextAlign = "left") => {
    g.font = boardFont(weight, size);
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(s, x, y);
  };
  const title =
    lesson === "moments" ? "What makes a seesaw balance?" : lesson === "pythagoras" ? "How do the squares fit together?" : "What will you discover?";
  text(title, 96, 160, 92, PLAY.chalk, 700);
  if (lesson === "pythagoras") {
    const s = 56;
    const P: [number, number] = [430, 690];
    const A: [number, number] = [P[0], P[1] - 3 * s];
    const B: [number, number] = [P[0] + 4 * s, P[1]];
    const n: [number, number] = [3 * s, -4 * s];
    const square = (pts: [number, number][], units: number, label: string) => {
      g.strokeStyle = "rgba(245,242,232,.32)";
      g.lineWidth = 3;
      const [o, u, , v] = pts as [[number, number], [number, number], [number, number], [number, number]];
      for (let i = 1; i < units; i++) {
        const t = i / units;
        g.beginPath();
        g.moveTo(o[0] + (u[0] - o[0]) * t, o[1] + (u[1] - o[1]) * t);
        g.lineTo(v[0] + (u[0] - o[0]) * t, v[1] + (u[1] - o[1]) * t);
        g.moveTo(o[0] + (v[0] - o[0]) * t, o[1] + (v[1] - o[1]) * t);
        g.lineTo(u[0] + (v[0] - o[0]) * t, u[1] + (v[1] - o[1]) * t);
        g.stroke();
      }
      g.strokeStyle = PLAY.chalk;
      g.lineWidth = 7;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
      const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
      const cy = pts.reduce((a, p) => a + p[1], 0) / 4;
      g.textBaseline = "middle";
      text(label, cx, cy + 4, 68, PLAY.chalkYellow, 800, "center");
      g.textBaseline = "alphabetic";
    };
    square([A, P, [P[0] - 3 * s, P[1]], [A[0] - 3 * s, A[1]]], 3, "9");
    square([P, B, [B[0], B[1] + 4 * s], [P[0], P[1] + 4 * s]], 4, "16");
    square([A, B, [B[0] + n[0], B[1] + n[1]], [A[0] + n[0], A[1] + n[1]]], 5, "25");
    g.strokeStyle = PLAY.chalkYellow;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(...A);
    g.lineTo(...P);
    g.lineTo(...B);
    g.closePath();
    g.stroke();
    text("a² + b² = c²", 1150, 440, 104, PLAY.chalk, 700);
    text("3² + 4² = 5²", 1150, 570, 80);
    text("9 + 16 = 25", 1150, 690, 80, PLAY.chalkYellow, 700);
    text("Predict, build, then count the tiles.", 96, 960, 50, "rgba(245,242,232,.8)", 500);
  } else if (lesson === "moments") {
    const cm = 16;
    const px = 560,
      beamY = 600;
    g.fillStyle = PLAY.chalk;
    g.strokeStyle = PLAY.chalk;
    g.lineWidth = 7;
    g.strokeRect(px - 30 * cm - 20, beamY - 8, 60 * cm + 40, 16);
    g.beginPath();
    g.moveTo(px, beamY + 10);
    g.lineTo(px - 52, beamY + 100);
    g.lineTo(px + 52, beamY + 100);
    g.closePath();
    g.stroke();
    g.lineWidth = 3;
    for (let d = -30; d <= 30; d += 5) {
      if (!d) continue;
      g.beginPath();
      g.moveTo(px + d * cm, beamY - 8);
      g.lineTo(px + d * cm, beamY - (d % 10 ? 20 : 30));
      g.stroke();
    }
    const weight = (x: number, size: number, label: string) => {
      g.fillStyle = "rgba(247,221,122,.25)";
      g.fillRect(x - size / 2, beamY - 8 - size, size, size);
      g.strokeStyle = PLAY.chalkYellow;
      g.lineWidth = 7;
      g.strokeRect(x - size / 2, beamY - 8 - size, size, size);
      text(label, x, beamY - size - 34, 60, PLAY.chalkYellow, 700, "center");
    };
    weight(px - 10 * cm, 104, "200 g");
    weight(px + 20 * cm, 76, "100 g");
    const span = (x0: number, x1: number, label: string) => {
      const y = beamY + 150;
      g.strokeStyle = PLAY.chalk;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      for (const [x, dir] of [
        [x0, 1],
        [x1, -1],
      ] as const) {
        g.moveTo(x + dir * 20, y - 14);
        g.lineTo(x, y);
        g.lineTo(x + dir * 20, y + 14);
        g.moveTo(x, y - 24);
        g.lineTo(x, y + 24);
      }
      g.stroke();
      text(label, (x0 + x1) / 2, y + 74, 56, PLAY.chalk, 600, "center");
    };
    span(px - 10 * cm, px, "10 cm");
    span(px, px + 20 * cm, "20 cm");
    text("mass × distance", 1180, 400, 84, PLAY.chalk, 700);
    text("200 g × 10 cm", 1180, 530, 76);
    text("= 100 g × 20 cm", 1180, 640, 76, PLAY.chalkYellow, 700);
    text("Equal turning, so it balances.", 1180, 750, 46, "rgba(245,242,232,.85)", 500);
    text("Predict which way it tips, then release.", 96, 960, 50, "rgba(245,242,232,.8)", 500);
  } else {
    text("Ask a question. Test an idea.", 96, 520, 96, PLAY.chalkYellow, 700);
    text("Push, turn, kick: then explain what you saw.", 96, 680, 64);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function LessonBoard({ lesson, at }: { lesson: string; at: V3 }) {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);
  const texture = useMemo(() => drawBoard(lesson), [lesson, fontsReady]);
  useEffect(() => () => texture.dispose(), [texture]);
  const w = 1.45,
    h = 0.7,
    bottom = 0.22;
  return (
    // Turned 45° so the board faces the fixed camera head on.
    <group position={at} rotation={[0, 0, Math.PI / 4]}>
      <Rounded at={[0, 0.012, bottom + h / 2]} size={[w + 0.09, 0.035, h + 0.09]} color={PLAY.wood} radius={0.25} />
      <mesh position={[0, -0.007, bottom + h / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      <Rounded at={[0, -0.03, bottom - 0.03]} size={[w * 0.8, 0.05, 0.02]} color={PLAY.woodDark} radius={0.3} />
      {[-w / 2 - 0.07, w / 2 + 0.07].map((x) => (
        <group key={x}>
          <Rod from={[x, 0.02, 0]} to={[x, 0.02, bottom + h + 0.12]} radius={0.028} color={PLAY.woodDark} />
          <mesh position={[x, 0.02, bottom + h + 0.15]} castShadow>
            <sphereGeometry args={[0.04, 20, 14]} />
            <meshStandardMaterial color={PLAY.yellow} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ContactShade({ at, size, material }: { at: V3; size: [number, number]; material: THREE.Material }) {
  return (
    <mesh position={at} material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

const TREES = [
  [-3.05, 0.95, 1.25],
  [-0.55, 3.15, 1.05],
  [1.5, 3.2, 0.95],
  [-3.0, -1.2, 0.9],
  [2.85, 1.0, 0.85],
] as const;
/** No blades on the court and its border, in the sand or on the swing mat. */
const NO_GRASS: [number, number, number, number][] = [
  [0, 0, 1.64, 1.64],
  [2.15, 2.05, 0.38, 0.3],
  [-2.25, 0.1, 0.33, 0.55],
];
const SHRUBS = [
  [1.85, -1.1, PLAY.pink],
  [1.85, 0.75, PLAY.yellow],
  [-0.6, -1.85, PLAY.yellow],
  [0.9, -1.85, PLAY.pink],
  [-1.75, -0.75, PLAY.paint],
] as const;

export function Playground({
  kit,
  reducedMotion,
  lowPower = false,
  onFocus,
}: {
  kit: LabKit;
  reducedMotion: boolean;
  /** Software WebGL: no grass blades or clouds, solid canopies instead of leaf cards. */
  lowPower?: boolean;
  onFocus: () => void;
}) {
  const maps = useMemo(
    () => ({
      grass: grassTexture(),
      court: courtTexture(),
      sand: sandTexture(),
      hop: hopscotchTexture(),
      bark: barkTexture(),
      shade: new THREE.MeshBasicMaterial({ map: contactShadeTexture(), transparent: true, depthWrite: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      maps.grass.dispose();
      maps.court.dispose();
      maps.sand.dispose();
      maps.hop.dispose();
      maps.bark.dispose();
      maps.shade.map?.dispose();
      maps.shade.dispose();
    },
    [maps],
  );
  const canopies = useMemo<Canopy[]>(
    () => [
      ...TREES.flatMap(([x, y, s]) => treeCanopies(x, y, s)),
      ...SHRUBS.map(([x, y]) => ({ at: [x, y, 0.06] as V3, radius: 0.11, color: "#4e9440" })),
    ],
    [],
  );
  // Just behind the far corner post, close enough to stay in the default follow framing.
  const board: V3 = [-1.62, 1.62, -0.02];
  // The board's left post, so the bunting runs along the outside of the court.
  const boardPost: V3 = [-1.62 - (0.795 * Math.SQRT2) / 2, 1.62 - (0.795 * Math.SQRT2) / 2, 1.01];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Sky />
      <Island grass={maps.grass} />
      {!lowPower && <Grass radius={3.75} keepOut={NO_GRASS} reducedMotion={reducedMotion} />}
      {/* The court is the physical floor at z = 0: an open play surface with no furniture. */}
      <mesh position={[0, 0, -0.015]} receiveShadow>
        <boxGeometry args={[2 * ROOM_HALF, 2 * ROOM_HALF, 0.03]} />
        <meshStandardMaterial map={maps.court} roughness={0.92} />
      </mesh>
      <mesh position={[-1.08, 0.86, 0.0007]} receiveShadow>
        <planeGeometry args={[0.42, 0.84]} />
        <meshStandardMaterial map={maps.hop} transparent roughness={0.9} />
      </mesh>
      <LearningZone focus={kit.focus} />
      <FocusTarget focus={kit.focus} onFocus={onFocus} />
      <GardenFence reducedMotion={reducedMotion} lowPower={lowPower} />
      <LessonBoard lesson={kit.id} at={board} />
      {/* Swings on the open left side, where the default view always shows them. */}
      <SwingSet at={[-2.25, 0.1, -0.02]} yaw={Math.PI / 2} reducedMotion={reducedMotion} />
      <Bunting from={boardPost} to={[-2.25, -0.36, 0.6]} reducedMotion={reducedMotion} />
      <Slide at={[0.75, 2.25, -0.02]} yaw={-Math.PI / 2} />
      <Seesaw at={[-2.1, -1.75, -0.02]} />
      <Sandpit at={[2.15, 2.05, -0.02]} sand={maps.sand} />
      <Bench at={[2.0, -0.2, -0.02]} yaw={-Math.PI / 2} />
      {TREES.map(([x, y, s]) => (
        <group key={`${x},${y}`}>
          <ContactShade at={[x, y, -0.018]} size={[0.9 * s, 0.9 * s]} material={maps.shade} />
          <Trunk at={[x, y, -0.02]} scale={s} bark={maps.bark} />
        </group>
      ))}
      {SHRUBS.map(([x, y, c]) => (
        <Flowers key={`${x},${y}`} at={[x, y, -0.02]} color={c} />
      ))}
      {lowPower ? <SimpleCanopies canopies={canopies} /> : <Foliage canopies={canopies} reducedMotion={reducedMotion} />}
      {!lowPower && <Clouds reducedMotion={reducedMotion} />}
    </group>
  );
}
