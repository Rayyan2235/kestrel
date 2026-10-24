import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useRef, type ReactNode } from "react";
import { Group, MathUtils } from "three";
import { balance, type BotId } from "@kestrel/contracts";
import { useLab } from "../state/lab";

function Box({
  at,
  size,
  color,
  rotation = [0, 0, 0],
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}
function Robot({
  id,
  at,
  color,
  reduced,
}: {
  id: BotId;
  at: [number, number, number];
  color: string;
  reduced: boolean;
}) {
  const ref = useRef<Group>(null);
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.rotation.y =
        -0.3 +
        (reduced
          ? 0
          : Math.sin(clock.elapsedTime * 0.65 + (id === "pip" ? 0 : 2)) * 0.08);
  });
  return (
    <group
      position={at}
      onClick={(e) => {
        e.stopPropagation();
        select(id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.48, selected === id ? 0.53 : 0.49, 48]} />
        <meshBasicMaterial color={selected === id ? "#345d47" : "#b5c5b1"} />
      </mesh>
      <group ref={ref}>
        <Box at={[-0.19, 0.09, 0.08]} size={[0.22, 0.14, 0.4]} color={color} />
        <Box at={[0.19, 0.09, 0.08]} size={[0.22, 0.14, 0.4]} color={color} />
        <Box
          at={[-0.19, 0.34, 0]}
          size={[0.12, 0.44, 0.14]}
          color="#657971"
          rotation={[0, 0, -0.15]}
        />
        <Box
          at={[0.19, 0.34, 0]}
          size={[0.12, 0.44, 0.14]}
          color="#657971"
          rotation={[0, 0, 0.15]}
        />
        <Box at={[0, 0.58, 0]} size={[0.44, 0.2, 0.3]} color="#f5f0df" />
        <Box at={[0, 0.77, 0]} size={[0.13, 0.25, 0.13]} color="#607870" />
        <Box at={[0, 0.96, 0]} size={[0.74, 0.36, 0.4]} color="#faf5e6" />
        <Box at={[0, 1.15, -0.02]} size={[0.57, 0.04, 0.26]} color={color} />
        {[-0.21, 0.21].map((x) => (
          <group
            key={x}
            position={[x, 0.98, 0.235]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <mesh castShadow>
              <cylinderGeometry args={[0.135, 0.135, 0.11, 20]} />
              <meshStandardMaterial color="#263f39" />
            </mesh>
            <mesh position={[0, 0.065, 0]}>
              <cylinderGeometry args={[0.077, 0.077, 0.015, 20]} />
              <meshStandardMaterial
                color="#96ded2"
                emissive="#62aaa7"
                emissiveIntensity={0.25}
              />
            </mesh>
          </group>
        ))}
        <Box
          at={[0.43, 1.19, -0.04]}
          size={[0.025, 0.28, 0.025]}
          color="#647c70"
        />
      </group>
    </group>
  );
}
function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.19, 0.45, 20]} />
        <meshStandardMaterial color="#ca9170" />
      </mesh>
      {[-0.17, 0.1, 0.22].map((v, i) => (
        <mesh
          key={v}
          position={[v, 0.65 + i * 0.13, v / 2]}
          scale={[0.22, 0.43, 0.19]}
          castShadow
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial color={i === 1 ? "#64876a" : "#84a276"} />
        </mesh>
      ))}
    </group>
  );
}
function BalanceStation() {
  const world = useLab((s) => s.world);
  const ref = useRef<Group>(null);
  const side = balance(world);
  useFrame((_, dt) => {
    if (ref.current)
      ref.current.rotation.z = MathUtils.damp(
        ref.current.rotation.z,
        side === "balanced" ? 0 : side === "left" ? 0.12 : -0.12,
        8,
        dt,
      );
  });
  return (
    <group position={[0, 0, -0.5]}>
      <Box at={[0, 0.76, 0]} size={[3.25, 0.18, 1.2]} color="#e0b18b" />
      {[-1.3, 1.3].map((x) => (
        <Box
          key={x}
          at={[x, 0.35, 0]}
          size={[0.13, 0.7, 0.8]}
          color="#6a8074"
        />
      ))}
      <mesh position={[0, 1.08, 0]} castShadow rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.27, 0.5, 4]} />
        <meshStandardMaterial color="#718e80" />
      </mesh>
      <group ref={ref} position={[0, 1.34, 0]}>
        <Box at={[0, 0, 0]} size={[3, 0.07, 0.22]} color="#f8dda9" />
        <Box
          at={[-world.leftCm / 32, 0.18, 0]}
          size={[0.29, 0.29, 0.29]}
          color="#72aeb4"
        />
        <Box
          at={[world.rightCm / 32, 0.14, 0]}
          size={[0.23, 0.23, 0.23]}
          color="#db8769"
        />
        {Array.from({ length: 25 }, (_, i) => (
          <Box
            key={i}
            at={[-1.44 + i * 0.12, 0.038, 0.065]}
            size={[0.012, 0.006, i % 5 === 2 ? 0.12 : 0.06]}
            color="#8e7855"
          />
        ))}
      </group>
    </group>
  );
}
function Room({ reduced }: { reduced: boolean }) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight
        position={[2, 9, 5]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.04}
      />
      <Box at={[0, -0.16, 0]} size={[8.4, 0.3, 6.7]} color="#bbc9ad" />
      <Box at={[0, 1.25, -3.3]} size={[8.4, 2.8, 0.13]} color="#f0ecdd" />
      <Box at={[-4.12, 1.25, 0]} size={[0.13, 2.8, 6.6]} color="#e2e5d5" />
      <Box at={[0, 0.04, 0.5]} size={[4.2, 0.02, 3.4]} color="#d8dec8" />
      <Box at={[0.5, 1.75, -3.2]} size={[2.6, 1.3, 0.06]} color="#c4d6cf" />
      <Box at={[0.5, 1.75, -3.14]} size={[0.05, 1.3, 0.04]} color="#f7f5e9" />
      <Box at={[0.5, 1.75, -3.14]} size={[2.6, 0.05, 0.04]} color="#f7f5e9" />
      <Box at={[-3.35, 0.65, -1.6]} size={[1.15, 1.3, 1.9]} color="#819f8b" />
      <Box at={[-3.35, 1.34, -1.6]} size={[1.25, 0.08, 2]} color="#f6eddc" />
      {[0, 0.6, 1.2].map((v) => (
        <Box
          key={v}
          at={[-2.755, 0.8, -2.2 + v]}
          size={[0.04, 0.08, 0.25]}
          color="#d8dfce"
        />
      ))}
      <Plant x={3.35} z={-2.55} />
      <Plant x={-3.3} z={2.4} />
      <Box at={[2.7, 0.26, -2.6]} size={[1, 0.5, 0.65]} color="#d6b48e" />
      <Box at={[-2.6, 1.8, -3.17]} size={[1, 0.9, 0.05]} color="#a9bea1" />
      <BalanceStation />
      <Robot id="pip" at={[-1.2, 0, 1.2]} color="#db8769" reduced={reduced} />
      <Robot id="nova" at={[1.25, 0, 1.4]} color="#69a99e" reduced={reduced} />
    </>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        The 3D room could not start. Try a browser with WebGL enabled; the
        experiment controls still work.
      </div>
    ) : (
      this.props.children
    );
  }
}
export function LabScene({ reduced }: { reduced: boolean }) {
  return (
    <SceneBoundary>
      <Suspense
        fallback={<div className="scene-fallback">Opening the lab…</div>}
      >
        <Canvas
          shadows
          orthographic
          camera={{ position: [9, 8, 10], zoom: 62, near: 0.1, far: 100 }}
          dpr={[1, 1.5]}
          fallback={
            <div className="scene-fallback">
              This browser cannot show the 3D room. You can still use the
              experiment controls.
            </div>
          }
          onCreated={({ camera }) => camera.lookAt(0, 0.4, 0)}
        >
          <Room reduced={reduced} />
        </Canvas>
      </Suspense>
    </SceneBoundary>
  );
}
