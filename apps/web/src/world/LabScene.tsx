import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Group, MathUtils, OrthographicCamera, Vector3 } from "three";
import {
  balance,
  BALANCE_FIXTURE,
  BOT_NAMES,
  type Message,
  type BotId,
} from "@kestrel/contracts";
import { useLab } from "../state/lab";
import styles from "./LabScene.module.css";
import { Check } from "lucide-react";

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
  color,
  reduced,
}: {
  id: BotId;
  color: string;
  reduced: boolean;
}) {
  const head = useRef<Group>(null);
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const bot = useLab((s) => s.simulation.bots[id]);
  useFrame(({ clock }) => {
    if (!head.current) return;
    // Gaze is cosmetic; root position and heading come only from the snapshot.
    head.current.rotation.y =
      bot.status === "idle" ? -bot.headingRad + 0.35 : 0;
    head.current.rotation.z = reduced
      ? 0
      : Math.sin(clock.elapsedTime * 0.7 + (id === "pip" ? 0 : 2)) * 0.035;
  });
  return (
    <group
      position={[...bot.position]}
      rotation={[0, bot.headingRad, 0]}
      onClick={(e) => {
        e.stopPropagation();
        select(id);
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[0.37, selected === id ? 0.43 : 0.385, 48]} />
        <meshBasicMaterial color={selected === id ? "#335947" : "#9caf98"} />
      </mesh>
      {[-0.17, 0.17].map((x) => (
        <group key={x}>
          <Box at={[x, 0.08, 0.035]} size={[0.19, 0.13, 0.32]} color={color} />
          <Box at={[x, 0.12, 0.11]} size={[0.15, 0.04, 0.16]} color="#faf3dd" />
          <Box
            at={[x, 0.32, 0]}
            size={[0.09, 0.37, 0.1]}
            color="#536c65"
            rotation={[0.15, 0, x > 0 ? 0.12 : -0.12]}
          />
          <mesh
            position={[x, 0.38, 0.035]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.095, 0.095, 0.12, 16]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
        </group>
      ))}
      <Box at={[0, 0.55, 0]} size={[0.39, 0.23, 0.27]} color="#f6efdb" />
      <Box at={[0, 0.56, -0.15]} size={[0.26, 0.15, 0.07]} color={color} />
      <Box
        at={[0, BALANCE_FIXTURE.station.topY - 0.09, 0]}
        size={[0.1, 0.25, 0.11]}
        color="#536c65"
        rotation={[0.16, 0, 0]}
      />
      <group ref={head} position={[0, 0.96, 0]}>
        <Box at={[0, 0, 0]} size={[0.65, 0.32, 0.34]} color="#faf5e6" />
        <Box at={[0, 0.17, -0.015]} size={[0.55, 0.055, 0.29]} color={color} />
        {[-0.18, 0.18].map((x) => (
          <group key={x} position={[x, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry
                args={[x < 0 ? 0.13 : 0.11, x < 0 ? 0.13 : 0.11, 0.1, 24]}
              />
              <meshStandardMaterial color="#203c35" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.075, 0.075, 0.015, 24]} />
              <meshStandardMaterial
                color="#acdcd5"
                emissive="#599e91"
                emissiveIntensity={selected === id ? 0.3 : 0.08}
              />
            </mesh>
            <mesh position={[-0.02, 0.066, -0.023]}>
              <sphereGeometry args={[0.022, 10, 10]} />
              <meshBasicMaterial color="#f7ffff" />
            </mesh>
          </group>
        ))}
        <Box
          at={[0.27, 0.3, -0.08]}
          size={[0.025, 0.23, 0.025]}
          color="#536c65"
          rotation={[0, 0, -0.12]}
        />
        <mesh position={[0.285, 0.42, -0.08]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    </group>
  );
}

function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    camera.zoom = Math.min(size.width / 11.5, size.height / 8) * 0.96;
    camera.lookAt(0, 0.65, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function ProjectLabels({
  labels,
}: {
  labels: RefObject<Record<BotId, HTMLDivElement | null>>;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const bots = useLab.getState().simulation.bots;
    for (const id of ["pip", "nova"] as const) {
      const el = labels.current[id];
      if (!el) continue;
      const [x, y, z] = bots[id].position;
      point.current.set(x, y + 0.05, z).project(camera);
      const footY = ((1 - point.current.y) * size.height) / 2;
      el.style.left = `${((point.current.x + 1) * size.width) / 2}px`;
      el.style.top = `${footY}px`;
      el.style.visibility = point.current.z > 1 ? "hidden" : "visible";
      point.current.set(x, y + 1.48, z).project(camera);
      el.style.setProperty(
        "--head-height",
        `${footY - ((1 - point.current.y) * size.height) / 2}px`,
      );
    }
  });
  return null;
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
function BalanceStation({ reduced }: { reduced: boolean }) {
  const world = useLab((s) => s.world);
  const ref = useRef<Group>(null);
  const side = balance(world);
  useFrame((_, dt) => {
    if (ref.current)
      ref.current.rotation.z = reduced
        ? side === "balanced"
          ? 0
          : side === "left"
            ? 0.12
            : -0.12
        : MathUtils.damp(
            ref.current.rotation.z,
            side === "balanced" ? 0 : side === "left" ? 0.12 : -0.12,
            8,
            dt,
          );
  });
  return (
    <group position={[...BALANCE_FIXTURE.station.position]}>
      <Box
        at={[0, BALANCE_FIXTURE.station.topY - 0.09, 0]}
        size={[
          BALANCE_FIXTURE.station.footprint[0],
          0.18,
          BALANCE_FIXTURE.station.footprint[1],
        ]}
        color="#e0b18b"
      />
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
      <group ref={ref} position={[0, BALANCE_FIXTURE.station.pivot[1], 0]}>
        <Box
          at={[0, 0, 0]}
          size={[BALANCE_FIXTURE.station.beamLength, 0.07, 0.22]}
          color="#f8dda9"
        />
        <Box
          at={[
            -world.leftCm / BALANCE_FIXTURE.station.centimetersPerSceneMeter,
            0.18,
            0,
          ]}
          size={[0.29, 0.29, 0.29]}
          color="#72aeb4"
        />
        <Box
          at={[
            world.rightCm / BALANCE_FIXTURE.station.centimetersPerSceneMeter,
            0.14,
            0,
          ]}
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
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#fcf4df", "#718476", 1.1]} />
      <directionalLight
        position={[2, 9, 5]}
        intensity={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.04}
      />
      <Box
        at={[0, -0.16, 0]}
        size={[
          BALANCE_FIXTURE.room.maxX - BALANCE_FIXTURE.room.minX,
          0.3,
          BALANCE_FIXTURE.room.maxZ - BALANCE_FIXTURE.room.minZ,
        ]}
        color="#bbc9ad"
      />
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
      <BalanceStation reduced={reduced} />
      <Robot id="pip" color="#db8769" reduced={reduced} />
      <Robot id="nova" color="#69a99e" reduced={reduced} />
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
export function LabScene({
  reduced,
  latest,
}: {
  reduced: boolean;
  latest?: Message;
}) {
  const labels = useRef<Record<BotId, HTMLDivElement | null>>({
    pip: null,
    nova: null,
  });
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const [speaker, text] =
    latest && latest.speaker !== "you"
      ? [latest.speaker, latest.text]
      : [null, ""];
  return (
    <SceneBoundary>
      <Suspense
        fallback={<div className="scene-fallback">Opening the lab…</div>}
      >
        <Canvas
          shadows
          orthographic
          camera={{ position: [9, 8, 10], zoom: 55, near: 0.1, far: 100 }}
          dpr={[1, 1.5]}
          fallback={
            <div className="scene-fallback">
              This browser cannot show the 3D room. You can still select a
              companion and use the experiment controls.
            </div>
          }
        >
          <FitCamera />
          <Room reduced={reduced} />
          <ProjectLabels labels={labels} />
        </Canvas>
        <div className={styles.annotations}>
          {(["pip", "nova"] as const).map((id) => (
            <div
              className={styles.anchor}
              key={id}
              ref={(el) => {
                labels.current[id] = el;
              }}
            >
              {speaker === id && (
                <div className={styles.bubble} aria-hidden="true">
                  <span>
                    {text.length > 110 ? `${text.slice(0, 107)}…` : text}
                  </span>
                </div>
              )}
              <button
                className={`${styles.label} ${selected === id ? styles.selected : ""}`}
                onClick={() => select(id)}
                aria-label={`${BOT_NAMES[id]} in the lab`}
                aria-pressed={selected === id}
              >
                <span className={id === "pip" ? styles.coral : styles.teal} />
                {BOT_NAMES[id]}
                {selected === id && <Check size={12} aria-hidden="true" />}
              </button>
            </div>
          ))}
        </div>
      </Suspense>
    </SceneBoundary>
  );
}
