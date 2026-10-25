import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Group, SRGBColorSpace, Vector3, type Mesh } from "three";
import { useLab } from "../state/lab";
import { BALANCE, type Side } from "../microduck/balance";
import { physics } from "../microduck/instance";
import { SCALE } from "../microduck/physics";
import { setAnchor } from "./anchors";
import { palette } from "./palette";
import { Mat, RBox } from "./parts";

const B = BALANCE.beam;
const P = BALANCE.paddle;
const FRONT = BALANCE.beamY - B.halfDepth;

function rulerTexture() {
  const w = 3072,
    h = 288;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = palette.white;
  g.fillRect(0, 0, w, h);
  const span = 2 * B.halfLength * BALANCE.cmPerMetre; // 96 cm across the beam
  const px = w / span;
  g.fillStyle = palette.noir;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 72px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
  for (let cm = -45; cm <= 45; cm++) {
    const x = w / 2 + cm * px;
    const major = cm % 10 === 0,
      mid = cm % 5 === 0;
    const len = major ? 74 : mid ? 50 : 28;
    g.fillRect(x - (major ? 3 : 1.5), h - len, major ? 6 : 3, len);
    if (major) g.fillText(String(Math.abs(cm)), x, h / 2 - 22);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const scratch = new Vector3();

function Carriage({
  side,
  refGroup,
  tagRef,
  onPick,
}: {
  side: Side;
  refGroup: React.RefObject<Group | null>;
  tagRef: React.RefObject<Group | null>;
  onPick: (side: Side) => void;
}) {
  const half = side === "left" ? 0.028 : 0.022;
  return (
    <group
      ref={refGroup}
      position={[BALANCE.restQpos[side === "left" ? 1 : 2], 0, B.halfThick]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(side);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <RBox size={[2 * half, 0.06, 0.04]} radius={0.006} color={palette.noir} roughness={0.35} metalness={0.25} position={[0, 0, 0.02]} />
      <mesh position={[0, 0, 0.046]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[half * 0.4, half * 0.5, 0.012, 20]} />
        <Mat color={palette.amethyst} roughness={0.35} />
      </mesh>
      {/* The paddle a duck pushes with its chest */}
      <RBox
        size={[2 * P.halfThick, 2 * P.halfReach, 2 * P.halfHeight]}
        radius={0.004}
        color={palette.amethyst}
        roughness={0.45}
        position={[0, -(B.halfDepth + P.halfReach), P.halfHeight - B.halfThick]}
      />
      <group ref={tagRef} position={[0, 0, 0.075]} />
    </group>
  );
}

/**
 * The floor balance, drawn from the MuJoCo state when the Microduck physics runs
 * (beam angle, measured carriage positions, lock pin), and from the runtime's
 * recorded positions with a level beam otherwise.
 */
export function FloorBalance({ onPickWeight }: { onPickWeight: (side: Side) => void }) {
  const ruler = useMemo(rulerTexture, []);
  const beam = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const leftTag = useRef<Group>(null);
  const rightTag = useRef<Group>(null);
  const pin = useRef<Mesh>(null);

  useFrame(() => {
    const world = physics.world;
    const w = useLab.getState().world;
    const angle = world ? world.balance.angle() : 0;
    if (beam.current) beam.current.rotation.y = angle;
    if (left.current) left.current.position.x = world ? world.balance.slide("left") : BALANCE.slideFor("left", w.leftCm);
    if (right.current) right.current.position.x = world ? world.balance.slide("right") : BALANCE.slideFor("right", w.rightCm);
    if (pin.current) pin.current.position.y = world && !world.balance.locked ? FRONT - 0.03 : FRONT - 0.008;
    for (const [ref, id] of [
      [leftTag, "left-weight"],
      [rightTag, "right-weight"],
    ] as const) {
      if (!ref.current) continue;
      ref.current.getWorldPosition(scratch);
      setAnchor(id, scratch.x, scratch.y, scratch.z);
    }
    setAnchor("pivot", 0, 0.02, -(FRONT - 0.09) * SCALE);
  });

  return (
    <group scale={SCALE} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Pivot block and lock pin */}
      <RBox size={[0.06, 0.06, BALANCE.pivotZ]} radius={0.006} color={palette.noir} position={[0, BALANCE.beamY, BALANCE.pivotZ / 2]} />
      <mesh ref={pin} position={[0, FRONT - 0.008, BALANCE.pivotZ]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.005, 0.005, 0.03, 12]} />
        <Mat color={palette.amethystSoft} metalness={0.3} roughness={0.3} />
      </mesh>
      <group ref={beam} position={[0, BALANCE.beamY, BALANCE.pivotZ]}>
        <RBox size={[2 * B.halfLength, 2 * B.halfDepth, 2 * B.halfThick]} radius={0.003} color={palette.white} roughness={0.5} />
        <mesh position={[0, 0, B.halfThick + 0.0004]}>
          <planeGeometry args={[2 * B.halfLength - 0.006, 2 * B.halfDepth - 0.006]} />
          <meshStandardMaterial map={ruler} roughness={0.6} />
        </mesh>
        <Carriage side="left" refGroup={left} tagRef={leftTag} onPick={onPickWeight} />
        <Carriage side="right" refGroup={right} tagRef={rightTag} onPick={onPickWeight} />
      </group>
      {/* Home spots where idle ducks wait */}
      {(["pip", "nova"] as const).map((id) => (
        <group key={id} position={[BALANCE.homes[id].px, BALANCE.homes[id].py, 0.001]}>
          <mesh receiveShadow>
            <circleGeometry args={[0.07, 40]} />
            <meshStandardMaterial color={palette.white} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.0005]}>
            <ringGeometry args={[0.058, 0.07, 40]} />
            <meshStandardMaterial color={palette.noir} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
