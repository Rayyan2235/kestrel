import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SRGBColorSpace,
  Vector3,
} from "three";
import { BALANCE_FIXTURE, balance } from "@kestrel/contracts";
import { useLab } from "../state/lab";
import { setAnchor } from "./anchors";
import { palette } from "./palette";
import { Mat, RBox } from "./parts";

const station = BALANCE_FIXTURE.station;
const CM = station.centimetersPerSceneMeter;
const [PX, PY, PZ] = station.pivot;
const TOP = station.topY;
const FRONT = station.position[2] + station.footprint[1] / 2;
const BEAM_H = 0.09;
const BEAM_D = 0.3;
const MAX_TILT = 0.12;

function rulerTexture() {
  const w = 3072,
    h = 224;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = palette.white;
  g.fillRect(0, 0, w, h);
  // Soft grain, drawn once.
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(20, 20, 20, ${0.012 + (i % 5) * 0.004})`;
    g.fillRect(0, (i * 37) % h, w, 2 + (i % 3));
  }
  const span = station.beamLength * CM; // 96 cm across the beam
  const px = w / span;
  g.fillStyle = palette.noir;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 64px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
  for (let cm = -45; cm <= 45; cm++) {
    const x = w / 2 + cm * px;
    const major = cm % 10 === 0,
      mid = cm % 5 === 0;
    const len = major ? 62 : mid ? 42 : 24;
    g.fillRect(x - (major ? 2.5 : 1.5), 0, major ? 5 : 3, len);
    g.fillRect(x - (major ? 2.5 : 1.5), h - len, major ? 5 : 3, len);
    if (major) g.fillText(String(Math.abs(cm)), x, h / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function wedgeGeometry() {
  const s = new Shape();
  const base = 0.4,
    height = PY - TOP - 0.03;
  s.moveTo(-base / 2, 0);
  s.lineTo(base / 2, 0);
  s.lineTo(0.03, height);
  s.lineTo(-0.03, height);
  s.closePath();
  const geo = new ExtrudeGeometry(s, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.1);
  return geo;
}

function Weight({
  side,
  size,
  onPick,
}: {
  side: "left" | "right";
  size: number;
  onPick: (side: "left" | "right") => void;
}) {
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onPick(side);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* Carriage that clamps the weight to its track */}
      <RBox
        size={[0.1, BEAM_H + 0.05, BEAM_D + 0.05]}
        radius={0.015}
        color={palette.amethyst}
        roughness={0.4}
        position={[0, 0, 0]}
      />
      <RBox
        size={[size, size * 0.82, size]}
        radius={0.03}
        color={palette.noir}
        roughness={0.35}
        metalness={0.3}
        position={[0, BEAM_H / 2 + 0.025 + (size * 0.82) / 2, 0]}
      />
      <mesh
        castShadow
        position={[0, BEAM_H / 2 + 0.025 + size * 0.82 + 0.03, 0]}
      >
        <cylinderGeometry args={[size * 0.18, size * 0.22, 0.06, 20]} />
        <Mat color={palette.amethyst} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  );
}

function StationPanel({ lane }: { lane: "pip" | "nova" }) {
  const x = BALANCE_FIXTURE.bots[lane].dock[0];
  const dial = useRef<Mesh>(null);
  const lamp = useRef<MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const operating =
      useLab.getState().simulation.bots[lane].status === "operating";
    if (dial.current && operating) dial.current.rotation.z -= dt * 5;
    if (lamp.current)
      lamp.current.emissiveIntensity +=
        ((operating ? 2.2 : 0) - lamp.current.emissiveIntensity) *
        Math.min(1, dt * 10);
  });
  return (
    <group position={[x, 0.69, FRONT + 0.06]}>
      <RBox size={[0.34, 0.15, 0.04]} radius={0.015} color={palette.noir} />
      <mesh ref={dial} position={[-0.05, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 24]} />
        <Mat color={palette.steel} roughness={0.4} />
      </mesh>
      <mesh position={[-0.05, 0.035, 0.05]}>
        <boxGeometry args={[0.012, 0.03, 0.01]} />
        <Mat color={palette.noir} />
      </mesh>
      <mesh position={[0.1, 0, 0.03]}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <meshStandardMaterial
          ref={lamp}
          color={palette.amethyst}
          emissive={palette.amethyst}
          emissiveIntensity={0}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

const scratch = new Vector3();

export function Apparatus({
  reduced,
  onPickWeight,
}: {
  reduced: boolean;
  onPickWeight: (side: "left" | "right") => void;
}) {
  const ruler = useMemo(rulerTexture, []);
  const wedge = useMemo(wedgeGeometry, []);
  const beam = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const leftTop = useRef<Group>(null);
  const rightTop = useRef<Group>(null);

  setAnchor("pivot", PX, TOP + 0.02, PZ + 0.44);

  useFrame((_, dt) => {
    const world = useLab.getState().world;
    const state = balance(world);
    const l = world.leftGrams * world.leftCm,
      r = world.rightGrams * world.rightCm;
    const target =
      state === "balanced"
        ? 0
        : Math.max(-MAX_TILT, Math.min(MAX_TILT, ((l - r) / Math.max(l, r)) * 0.2));
    const k = reduced ? 1 : Math.min(1, dt * 4);
    if (beam.current) beam.current.rotation.z += (target - beam.current.rotation.z) * k;
    const slide = reduced ? 1 : Math.min(1, dt * 7);
    if (left.current)
      left.current.position.x += (-world.leftCm / CM - left.current.position.x) * slide;
    if (right.current)
      right.current.position.x += (world.rightCm / CM - right.current.position.x) * slide;
    for (const [ref, id] of [
      [leftTop, "left-weight"],
      [rightTop, "right-weight"],
    ] as const) {
      if (!ref.current) continue;
      ref.current.getWorldPosition(scratch);
      setAnchor(id, scratch.x, scratch.y, scratch.z);
    }
  });

  return (
    <group>
      {/* Bench top and cabinet */}
      <RBox
        size={[station.footprint[0], 0.09, station.footprint[1]]}
        radius={0.035}
        color={palette.white}
        roughness={0.35}
        position={[0, TOP - 0.045, station.position[2]]}
      />
      <RBox
        size={[station.footprint[0] - 0.12, 0.14, 0.05]}
        radius={0.015}
        color={palette.noir}
        position={[0, 0.69, FRONT - 0.03]}
      />
      {[-1, 1].map((s) => (
        <RBox
          key={s}
          size={[0.12, 0.62, 1.04]}
          radius={0.02}
          color={palette.steel}
          position={[s * 1.48, 0.31, station.position[2]]}
        />
      ))}
      <RBox
        size={[2.86, 0.62, 0.05]}
        radius={0.01}
        color={palette.steelDark}
        position={[0, 0.31, station.position[2] - 0.48]}
      />
      <RBox
        size={[2.9, 0.05, 1.0]}
        radius={0.01}
        color={palette.steel}
        position={[0, 0.1, station.position[2]]}
      />
      <BenchShelf />
      <StationPanel lane="pip" />
      <StationPanel lane="nova" />

      {/* Pivot */}
      <mesh geometry={wedge} position={[PX, TOP, PZ]} castShadow receiveShadow>
        <Mat color={palette.noir} roughness={0.45} />
      </mesh>
      <mesh position={[PX, PY, PZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.3, 16]} />
        <Mat color={palette.steel} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Beam: an ideal massless lever; the tilt is illustrative */}
      <group ref={beam} position={[PX, PY, PZ]}>
        <RBox
          size={[station.beamLength, BEAM_H, BEAM_D]}
          radius={0.012}
          color={palette.white}
          roughness={0.5}
        />
        <mesh position={[0, BEAM_H / 2 + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[station.beamLength - 0.02, BEAM_D - 0.02]} />
          <meshStandardMaterial map={ruler} roughness={0.6} />
        </mesh>
        <group ref={left} position={[-20 / CM, 0, 0]}>
          <Weight side="left" size={0.28} onPick={onPickWeight} />
          <group ref={leftTop} position={[0, 0.4, 0]} />
        </group>
        <group ref={right} position={[20 / CM, 0, 0]}>
          <Weight side="right" size={0.22} onPick={onPickWeight} />
          <group ref={rightTop} position={[0, 0.34, 0]} />
        </group>
      </group>
    </group>
  );
}

function BenchShelf() {
  const z = station.position[2];
  return (
    <group>
      {/* Spare weights tray, books and a sample box on the lower shelf */}
      <RBox size={[0.6, 0.12, 0.42]} radius={0.02} color={palette.noir} position={[0.75, 0.185, z]} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.55 + i * 0.13, 0.27, z]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.06 + i * 0.015, 16]} />
          <Mat color={palette.steelDark} metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
      <RBox size={[0.55, 0.08, 0.36]} radius={0.01} color={palette.white} position={[-0.6, 0.165, z]} />
      <RBox size={[0.5, 0.07, 0.34]} radius={0.01} color={palette.amethystSoft} position={[-0.6, 0.24, z]} />
      <RBox size={[0.38, 0.22, 0.34]} radius={0.02} color={palette.noirSoft} position={[-1.15, 0.235, z]} />
    </group>
  );
}
