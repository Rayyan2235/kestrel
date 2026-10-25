import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { LabKit } from "@kestrel/contracts";
import { ROOM_HALF, WALL_T, WALL_H } from "../simulation/constants";

function Box({
  at,
  size,
  color = "#29262e",
  glow = false,
}: {
  at: [number, number, number];
  size: [number, number, number];
  color?: string;
  glow?: boolean;
}) {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.12),
    [size[0], size[1], size[2]],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} geometry={geometry} castShadow={!glow} receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={0.65}
        metalness={0.15}
        emissive={glow ? color : "#000000"}
        emissiveIntensity={glow ? 0.7 : 0}
      />
    </mesh>
  );
}
function Sign({
  text,
  at,
  width = 1,
  height = 0.2,
  wall = false,
}: {
  text: string;
  at: [number, number, number];
  width?: number;
  height?: number;
  wall?: boolean;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * height) / width);
    const g = c.getContext("2d")!;
    g.fillStyle = "#242129";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f5f3f7";
    g.font = `600 ${Math.min(72, c.height * 0.46)}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, c.height / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={at} rotation={wall ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}
function Fan({ reducedMotion }: { reducedMotion: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current && !reducedMotion) rotor.current.rotation.z += dt * 0.55;
  });
  return (
    <group position={[1.02, 1.468, 0.86]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.13, 0.155, 32]} />
        <meshStandardMaterial color="#8e8796" metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={rotor}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <Box at={[0.06, 0, 0]} size={[0.1, 0.035, 0.012]} color="#6d6676" />
          </group>
        ))}
      </group>
      <mesh position={[0, 0, 0.012]}>
        <circleGeometry args={[0.025, 16]} />
        <meshStandardMaterial color="#cfcfcf" />
      </mesh>
    </group>
  );
}
function Dust({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      values[i * 3] = -1.35 + (i % 4) * 0.08;
      values[i * 3 + 1] = -0.4 + ((i * 7) % 24) * 0.055;
      values[i * 3 + 2] = 0.4 + ((i * 11) % 24) * 0.025;
    }
    return values;
  }, []);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.position.z = reducedMotion
        ? 0
        : Math.sin(clock.elapsedTime * 0.3) * 0.018;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#e2cdef"
        size={0.006}
        transparent
        opacity={0.28}
        depthWrite={false}
      />
    </points>
  );
}
function Reveal({ reducedMotion }: { reducedMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    elapsed.current += dt;
    if (!ring.current) return;
    const p = Math.min(1, elapsed.current / 1.4);
    ring.current.visible = !reducedMotion && p < 1;
    ring.current.scale.setScalar(0.05 + p * 2.1);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.65;
  });
  return (
    <mesh ref={ring} position={[0, 0, 0.003]}>
      <ringGeometry args={[0.98, 1, 80]} />
      <meshBasicMaterial color="#b78ae2" transparent depthWrite={false} />
    </mesh>
  );
}
export function Workshop({
  kit,
  reducedMotion,
  onFocus,
}: {
  kit: LabKit;
  reducedMotion: boolean;
  onFocus: () => void;
}) {
  const r = ROOM_HALF;
  const [hover, setHover] = useState(false);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Box at={[0, 0, -0.095]} size={[3.22, 3.22, 0.18]} color="#141414" />
      <Box at={[0, 0, -0.012]} size={[3, 3, 0.024]} color="#cfcfcf" />
      {/* Inlaid lines are flush graphics, never physical obstacles. */}
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <group key={v}>
          <Box at={[v, 0, 0.0008]} size={[0.002, 3, 0.001]} color="#b7b3bd" />
          <Box at={[0, v, 0.0008]} size={[3, 0.002, 0.001]} color="#b7b3bd" />
        </group>
      ))}
      <Box
        at={[-r - WALL_T / 2, 0, 0.6]}
        size={[WALL_T, 3.1, 1.2]}
        color="#302b36"
      />
      <Box
        at={[0, r + WALL_T / 2, 0.6]}
        size={[3, WALL_T, 1.2]}
        color="#252229"
      />
      <Box
        at={[r + WALL_T / 2, 0, WALL_H / 2]}
        size={[WALL_T, 3.1, WALL_H]}
        color="#68616f"
      />
      <Box
        at={[0, -r - WALL_T / 2, WALL_H / 2]}
        size={[3, WALL_T, WALL_H]}
        color="#68616f"
      />
      <Box
        at={[-1.493, 0, 0.12]}
        size={[0.008, 3, 0.018]}
        color="#7e49b3"
        glow
      />
      <Box
        at={[0, 1.493, 0.12]}
        size={[3, 0.008, 0.018]}
        color="#7e49b3"
        glow
      />
      <Box
        at={[0, -1.608, -0.035]}
        size={[2.8, 0.008, 0.014]}
        color="#7e49b3"
        glow
      />
      {/* Wall-mounted details live above the existing collision boundary. */}
      {[-1.05, -0.35, 0.35, 1.05].map((x) => (
        <Box
          key={x}
          at={[x, 1.489, 0.62]}
          size={[0.004, 0.01, 1.06]}
          color="#49414f"
        />
      ))}
      <Sign
        text="Kestrel / Research workshop"
        at={[-0.25, 1.465, 1.02]}
        width={1.9}
        height={0.2}
        wall
      />
      <Sign
        text={
          kit.id === "moments"
            ? "moment = mass × distance"
            : kit.id === "pythagoras"
              ? "a² + b² = c²"
              : "Observe. Try. Discover."
        }
        at={[-0.25, 1.46, 0.7]}
        width={1.85}
        height={0.38}
        wall
      />
      <Fan reducedMotion={reducedMotion} />
      <Dust reducedMotion={reducedMotion} />
      {/* Frosted observation panels mounted on the far wall. */}
      <Box
        at={[-1.477, 0.25, 0.79]}
        size={[0.025, 1.48, 0.58]}
        color="#17151b"
      />
      {[-0.22, 0.25, 0.72].map((y) => (
        <group key={y}>
          <Box
            at={[-1.459, y, 0.79]}
            size={[0.012, 0.43, 0.51]}
            color="#82738e"
          />
          <Box
            at={[-1.45, y, 0.58]}
            size={[0.008, 0.4, 0.008]}
            color="#b5a2c6"
            glow
          />
        </group>
      ))}
      <Box at={[-1.47, 0.25, 0.43]} size={[0.035, 1.6, 0.04]} color="#605967" />
      {/* Recessed workbench front: the authoritative bench is unchanged. */}
      {[-0.0, 0.3, 0.6].map((x) => (
        <group key={x}>
          <Box
            at={[x, 1.186, 0.08]}
            size={[0.27, 0.006, 0.12]}
            color="#69616f"
          />
          <Box
            at={[x, 1.18, 0.115]}
            size={[0.085, 0.008, 0.009]}
            color="#e4dfe9"
          />
        </group>
      ))}
      {/* Cabinet fronts and handles remain within the existing furniture footprints. */}
      {[-0.55, -0.8, -1.05].map((y) => (
        <group key={y}>
          <Box
            at={[-1.187, y, 0.17]}
            size={[0.006, 0.21, 0.2]}
            color="#39333f"
          />
          <Box
            at={[-1.181, y, 0.23]}
            size={[0.008, 0.075, 0.01]}
            color="#cfcfcf"
          />
        </group>
      ))}
      {[-0.58, 0.03].map((y, i) => (
        <group key={y} position={[-0.98, y, 0.002]}>
          <mesh>
            <ringGeometry args={[0.14, 0.15, 48]} />
            <meshBasicMaterial color={i ? "#7e49b3" : "#6a6174"} />
          </mesh>
          <Sign
            text={i ? "PIP" : "NOVA"}
            at={[0, -0.22, 0]}
            width={0.24}
            height={0.06}
          />
        </group>
      ))}
      <group position={[kit.focus[0] + 0.58, kit.focus[1] + 0.4, 0.004]}>
        <mesh
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
        >
          <ringGeometry args={[0.065, hover ? 0.085 : 0.075, 40]} />
          <meshBasicMaterial color={hover ? "#7e49b3" : "#655b70"} />
        </mesh>
        <Sign
          text={hover ? "Focus experiment" : "EXPERIMENT"}
          at={[0, -0.13, 0]}
          width={0.4}
          height={0.09}
        />
      </group>
      <Reveal key={kit.id} reducedMotion={reducedMotion} />
    </group>
  );
}
