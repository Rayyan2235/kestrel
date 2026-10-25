import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { BotId } from "@kestrel/contracts";
import { useLab } from "../state/lab";
import { setAnchor } from "./anchors";
import { botColor, palette } from "./palette";
import { Mat, RBox } from "./parts";

const CAMERA_HEADING = Math.PI / 4;
const MAX_NECK = 1.9;

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function Leg({ side, refGroup, color }: { side: 1 | -1; refGroup: React.RefObject<Group | null>; color: string }) {
  return (
    <group ref={refGroup} position={[side * 0.1, 0.34, 0]}>
      <mesh position={[0, -0.08, 0]} castShadow>
        <capsuleGeometry args={[0.045, 0.1, 6, 12]} />
        <Mat color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, -0.2, -0.02]} rotation={[0.25, 0, 0]} castShadow>
        <capsuleGeometry args={[0.035, 0.1, 6, 12]} />
        <Mat color={palette.shell} roughness={0.45} />
      </mesh>
      <RBox size={[0.1, 0.05, 0.16]} radius={0.02} color={palette.noir} position={[0, -0.3, 0.02]} />
    </group>
  );
}

export function Robot({
  id,
  selected,
  reduced,
  onPick,
}: {
  id: BotId;
  selected: boolean;
  reduced: boolean;
  onPick: (id: BotId) => void;
}) {
  const color = botColor[id];
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const ringMat = useRef<MeshStandardMaterial>(null);
  const motion = useRef({ phase: 0, speed: 0, blinkAt: 2 + Math.random() * 3, t: 0, initialised: false });

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    const m = motion.current;
    m.t += dt;
    const snapshot = useLab.getState().simulation.bots[id];
    const [tx, , tz] = snapshot.position;
    if (!m.initialised || reduced) {
      g.position.set(tx, 0, tz);
      g.rotation.y = snapshot.headingRad;
      m.initialised = true;
    }
    const px = g.position.x,
      pz = g.position.z;
    const k = reduced ? 1 : Math.min(1, dt * 14);
    g.position.x += (tx - px) * k;
    g.position.z += (tz - pz) * k;
    g.rotation.y += wrap(snapshot.headingRad - g.rotation.y) * (reduced ? 1 : Math.min(1, dt * 10));
    const moved = Math.hypot(g.position.x - px, g.position.z - pz) / Math.max(dt, 1e-3);
    m.speed += (moved - m.speed) * Math.min(1, dt * 8);

    const walking = !reduced && m.speed > 0.05;
    m.phase += dt * 13 * Math.min(1, m.speed / 0.6);
    const swing = walking ? Math.sin(m.phase) * 0.55 * Math.min(1, m.speed / 0.6) : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (body.current) {
      const bob = reduced ? 0 : walking ? Math.abs(Math.sin(m.phase)) * 0.025 : Math.sin(m.t * 2) * 0.008;
      body.current.position.y = bob;
    }

    const status = snapshot.status;
    if (arm.current) {
      const target = status === "operating" ? 1 : 0;
      const s = arm.current.scale.z + (target - arm.current.scale.z) * (reduced ? 1 : Math.min(1, dt * 9));
      arm.current.scale.set(1, 1, Math.max(0.001, s));
      arm.current.visible = s > 0.02;
    }
    if (head.current) {
      let yaw = 0,
        pitch = 0;
      if (status === "idle") yaw = Math.max(-MAX_NECK, Math.min(MAX_NECK, wrap(CAMERA_HEADING - g.rotation.y)));
      if (status === "docking" || status === "operating") pitch = 0.32;
      const hk = reduced ? 1 : Math.min(1, dt * 5);
      head.current.rotation.y += (yaw - head.current.rotation.y) * hk;
      head.current.rotation.x += (pitch - head.current.rotation.x) * hk;
    }
    if (eyes.current && !reduced) {
      const blinking = m.t > m.blinkAt && m.t < m.blinkAt + 0.12;
      eyes.current.scale.y = blinking ? 0.15 : 1;
      if (m.t > m.blinkAt + 0.12) m.blinkAt = m.t + 2.5 + Math.random() * 3.5;
    }
    if (ring.current && ringMat.current) {
      ring.current.visible = selected;
      const pulse = reduced ? 1 : 1 + Math.sin(state.clock.elapsedTime * 3) * 0.04;
      ring.current.scale.setScalar(pulse);
    }
    setAnchor(id, g.position.x, 0.02, g.position.z);
    setAnchor(`${id}-head`, g.position.x, 1.5, g.position.z);
  });

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        onPick(id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.34, 0.4, 48]} />
        <meshStandardMaterial ref={ringMat} color={color} emissive={color} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
      <group ref={body} scale={1.3}>
        <Leg side={-1} refGroup={legL} color={color} />
        <Leg side={1} refGroup={legR} color={color} />
        {/* Torso */}
        <RBox size={[0.28, 0.22, 0.22]} radius={0.07} color={palette.shell} roughness={0.4} position={[0, 0.45, 0]} />
        <RBox size={[0.3, 0.1, 0.16]} radius={0.04} color={color} roughness={0.45} position={[0, 0.42, -0.01]} />
        {/* Tool arm: extends only while operating the station */}
        <group ref={arm} position={[0.0, 0.47, 0.1]} scale={[1, 1, 0.001]}>
          <mesh position={[0, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.34, 12]} />
            <Mat color={palette.steelDark} metalness={0.5} roughness={0.35} />
          </mesh>
          <RBox size={[0.08, 0.05, 0.05]} radius={0.015} color={color} position={[0, 0, 0.35]} />
        </group>
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.08, 16]} />
          <Mat color={palette.noir} roughness={0.5} />
        </mesh>
        {/* Head */}
        <group ref={head} position={[0, 0.66, 0]}>
          <RBox size={[0.5, 0.31, 0.4]} radius={0.14} color={color} roughness={0.38} position={[0, 0.13, 0]} />
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.255, 0.1, -0.02]} rotation={[0, 0, (s * Math.PI) / 2]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.07, 0.07, 0.05, 24]} />
                <Mat color={palette.shell} roughness={0.4} />
              </mesh>
              <mesh position={[0, s * 0.027, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 0.01, 20]} />
                <Mat color={color} roughness={0.4} />
              </mesh>
            </group>
          ))}
          <RBox size={[0.52, 0.12, 0.3]} radius={0.05} color={palette.shell} roughness={0.4} position={[0, 0.03, -0.02]} />
          <RBox size={[0.42, 0.19, 0.08]} radius={0.07} color={palette.visor} roughness={0.25} position={[0, 0.14, 0.17]} />
          <group ref={eyes} position={[0, 0.14, 0.215]}>
            {[-1, 1].map((s) => (
              <group key={s} position={[s * 0.1, 0, 0]}>
                <mesh>
                  <torusGeometry args={[0.066, 0.016, 10, 32]} />
                  <Mat color={palette.shell} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, -0.004]}>
                  <circleGeometry args={[0.054, 32]} />
                  <Mat color={palette.eye} emissive={palette.eye} emissiveIntensity={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[0.012, 0.012, 0.001]}>
                  <circleGeometry args={[0.014, 16]} />
                  <Mat color="#ffffff" emissive="#ffffff" emissiveIntensity={1} />
                </mesh>
              </group>
            ))}
          </group>
          <mesh position={[0.15, 0.33, -0.1]} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.14, 8]} />
            <Mat color={palette.noir} />
          </mesh>
          <mesh position={[0.15, 0.41, -0.1]} castShadow>
            <sphereGeometry args={[0.025, 16, 12]} />
            <Mat color={color} roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
