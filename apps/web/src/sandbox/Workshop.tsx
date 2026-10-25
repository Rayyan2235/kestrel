import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { LabKit } from "@kestrel/contracts";
import type { DuckSim } from "../simulation/duckSim";
import { surfaceTexture, softShadeTexture } from "./studioMaterials";

type V3 = [number, number, number];
const LEFT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
  ),
);
function Box({
  at,
  size,
  color = "#9bae97",
  material,
  metal = false,
}: {
  at: V3;
  size: V3;
  color?: string;
  material?: THREE.Material;
  metal?: boolean;
}) {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(...size, 3, Math.min(...size) * 0.18),
    [...size],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={at}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
    >
      {!material && (
        <meshStandardMaterial
          color={color}
          metalness={metal ? 0.65 : 0}
          roughness={metal ? 0.32 : 0.72}
        />
      )}
    </mesh>
  );
}
function Cylinder({
  at,
  radius,
  height,
  color = "#b99250",
  rotation = [Math.PI / 2, 0, 0],
}: {
  at: V3;
  radius: number;
  height: number;
  color?: string;
  rotation?: V3;
}) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 32]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.3} />
    </mesh>
  );
}
function Surface({
  at,
  size,
  material,
  left = false,
  back = false,
}: {
  at: V3;
  size: [number, number];
  material: THREE.Material;
  left?: boolean;
  back?: boolean;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(...size);
    g.setAttribute("uv1", g.attributes.uv!.clone());
    return g;
  }, [...size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={at}
      geometry={geometry}
      material={material}
      quaternion={left ? LEFT : undefined}
      rotation={back ? [Math.PI / 2, 0, 0] : undefined}
      receiveShadow
    />
  );
}
function Label({
  text,
  at,
  width = 0.5,
  height = 0.1,
  back = false,
  left = false,
  dark = true,
}: {
  text: string;
  at: V3;
  width?: number;
  height?: number;
  back?: boolean;
  left?: boolean;
  dark?: boolean;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * height) / width);
    const g = c.getContext("2d")!;
    g.fillStyle = dark ? "#293d35" : "#ddd4bd";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = dark ? "#e8e2d6" : "#293d35";
    g.font = `500 ${c.height * 0.42}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, c.height / 2, 950);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [text, width, height, dark]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={at}
      quaternion={left ? LEFT : undefined}
      rotation={back ? [Math.PI / 2, 0, 0] : undefined}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}
/** Lesson diagram, deliberately separate from live measured experiment results. */
function TeachingBoard({ lesson }: { lesson: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 650;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#293d35";
    g.fillRect(0, 0, 1400, 650);
    g.fillStyle = "#b9c9ad";
    g.font = "28px sans-serif";
    g.fillText("KESTREL CLASSROOM  /  TODAY'S INVESTIGATION", 60, 65);
    g.fillStyle = "#f3eee3";
    g.font = "52px sans-serif";
    g.fillText(
      lesson === "moments"
        ? "What makes a beam balance?"
        : lesson === "pythagoras"
          ? "How do the squares fit together?"
          : "What will you discover?",
      60,
      145,
    );
    g.strokeStyle = "#f3eee3";
    g.lineWidth = 7;
    g.lineJoin = "round";
    g.beginPath();
    if (lesson === "moments") {
      g.moveTo(120, 320);
      g.lineTo(610, 320);
      g.moveTo(365, 325);
      g.lineTo(320, 410);
      g.lineTo(410, 410);
      g.closePath();
      g.stroke();
      g.fillStyle = "#b9c9ad";
      g.fillRect(170, 255, 60, 60);
      g.fillStyle = "#d4b470";
      g.fillRect(490, 255, 60, 60);
      g.font = "32px sans-serif";
      g.fillText("force × distance", 750, 300);
      g.fillStyle = "#f3eee3";
      g.fillText("= turning moment", 750, 350);
    } else if (lesson === "pythagoras") {
      g.moveTo(170, 410);
      g.lineTo(170, 240);
      g.lineTo(440, 410);
      g.closePath();
      g.stroke();
      g.strokeRect(170, 385, 25, 25);
      g.font = "32px sans-serif";
      g.fillText("a", 125, 335);
      g.fillText("b", 300, 455);
      g.fillText("c", 335, 310);
      g.font = "64px sans-serif";
      g.fillText("a² + b² = c²", 740, 340);
    } else {
      g.font = "42px sans-serif";
      g.fillText("Ask a question. Test an idea.", 120, 330);
    }
    g.fillStyle = "#b9c9ad";
    g.font = "30px sans-serif";
    g.fillText(
      "01  PREDICT      →      02  TRY      →      03  OBSERVE & EXPLAIN",
      60,
      565,
    );
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [lesson]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      <Box
        at={[-0.43, 1.472, 0.83]}
        size={[1.66, 0.04, 0.79]}
        color="#a78559"
      />
      <mesh position={[-0.43, 1.446, 0.83]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.6, 0.743]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      <Box
        at={[-0.43, 1.405, 0.44]}
        size={[1.68, 0.13, 0.025]}
        color="#a78559"
      />
      <Box
        at={[-0.86, 1.4, 0.463]}
        size={[0.11, 0.045, 0.025]}
        color="#ded7c3"
      />
      <Box
        at={[-0.62, 1.4, 0.459]}
        size={[0.065, 0.012, 0.012]}
        color="#f3eee3"
      />
    </group>
  );
}
function Plant({ at, scale = 1 }: { at: V3; scale?: number }) {
  const leaf = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.06, 0.02, 0.065, 0.15, 0, 0.22);
    s.bezierCurveTo(-0.045, 0.13, -0.05, 0.03, 0, 0);
    const g = new THREE.ShapeGeometry(s, 12);
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++)
      p.setZ(i, Math.sin((p.getY(i) / 0.22) * Math.PI) * 0.032);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => leaf.dispose(), [leaf]);
  return (
    <group position={at} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.065]} castShadow>
        <cylinderGeometry args={[0.075, 0.05, 0.13, 32]} />
        <meshStandardMaterial color="#bc816b" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0, 0.132]}>
        <circleGeometry args={[0.067, 32]} />
        <meshStandardMaterial color="#40372b" />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <group
          key={i}
          position={[0, 0, 0.13]}
          rotation={[0.35 + (i % 3) * 0.24, 0, i * 2.4]}
        >
          <mesh
            geometry={leaf}
            rotation={[0.65, 0, 0]}
            scale={0.65 + (i % 4) * 0.12}
            castShadow
          >
            <meshStandardMaterial
              color={i % 2 ? "#6f8e59" : "#48634a"}
              roughness={0.75}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function LiveDisplay({ sim }: { sim: DuckSim }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 768;
    c.height = 384;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const elapsed = useRef(1);
  const pose = useMemo(
    () => ({
      pos: [0, 0, 0] as V3,
      quat: [1, 0, 0, 0] as [number, number, number, number],
    }),
    [],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#1b3028";
    g.fillRect(0, 0, 768, 384);
    g.fillStyle = "#d0dcb8";
    g.font = "26px sans-serif";
    g.fillText("CREW / LIVE POSITION", 40, 60);
    for (const [i, id] of (["pip", "nova"] as const).entries()) {
      sim.readTrunk(pose, id);
      g.fillStyle = i ? "#d4b470" : "#c4d4bc";
      g.font = "32px monospace";
      g.fillText(
        `${id.toUpperCase()}   ${pose.pos[0].toFixed(2)} / ${pose.pos[1].toFixed(2)} m`,
        40,
        155 + i * 76,
      );
    }
    g.fillStyle = "#8ea895";
    g.font = "22px sans-serif";
    g.fillText("Measured in the shared lab", 40, 335);
    texture.needsUpdate = true;
  });
  return (
    <group>
      <Box
        at={[0.82, 1.477, 0.58]}
        size={[0.62, 0.036, 0.33]}
        color="#263d32"
      />
      <mesh position={[0.82, 1.455, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.57, 0.285]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}
function Atmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  const dust = useRef<THREE.Points>(null),
    fan = useRef<THREE.Group>(null);
  const positions = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 90 }, (_, i) =>
          i % 3 === 0
            ? -1.2 + ((i * 17) % 10) * 0.03
            : i % 3 === 1
              ? -0.2 + ((i * 13) % 30) * 0.04
              : 0.45 + ((i * 7) % 20) * 0.025,
        ),
      ),
    [],
  );
  useFrame(({ clock }, dt) => {
    if (!reducedMotion) {
      if (dust.current)
        dust.current.position.z = Math.sin(clock.elapsedTime * 0.3) * 0.018;
      if (fan.current) fan.current.rotation.z += dt * 0.5;
    }
  });
  return (
    <>
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.004}
          color="#f5e6bb"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </points>
      <group position={[1.27, 1.468, 0.96]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.075, 0.09, 40]} />
          <meshStandardMaterial
            color="#b99250"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        <group ref={fan}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
              <Box
                at={[0.033, 0, 0]}
                size={[0.065, 0.018, 0.008]}
                color="#7c8977"
              />
            </group>
          ))}
        </group>
      </group>
    </>
  );
}
export function Workshop({
  kit,
  sim,
  reducedMotion,
  onFocus,
}: {
  kit: LabKit;
  sim: DuckSim;
  reducedMotion: boolean;
  onFocus: () => void;
}) {
  const [hover, setHover] = useState(false);
  const materials = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const oak = surfaceTexture("oak"),
      floor = surfaceTexture("floor"),
      stone = surfaceTexture("stone"),
      plaster = surfaceTexture("plaster");
    const ao = (name: string) => {
      const t = loader.load(`/workshop/${name}-ao.png`);
      t.channel = 1;
      return t;
    };
    return {
      oak: new THREE.MeshStandardMaterial({
        map: oak,
        bumpMap: oak,
        bumpScale: 0.001,
        roughness: 0.48,
      }),
      floor: new THREE.MeshStandardMaterial({
        map: floor,
        bumpMap: floor,
        bumpScale: 0.0015,
        roughness: 0.6,
        aoMap: ao("floor"),
        aoMapIntensity: 1,
      }),
      stone: new THREE.MeshStandardMaterial({
        map: stone,
        bumpMap: stone,
        bumpScale: 0.0005,
        roughness: 0.7,
      }),
      left: new THREE.MeshStandardMaterial({
        map: plaster,
        aoMap: ao("left"),
        aoMapIntensity: 1,
        roughness: 0.9,
      }),
      back: new THREE.MeshStandardMaterial({
        map: plaster,
        aoMap: ao("back"),
        aoMapIntensity: 1,
        color: "#c6d0bd",
        roughness: 0.9,
      }),
      shade: new THREE.MeshBasicMaterial({
        map: softShadeTexture(),
        transparent: true,
        depthWrite: false,
      }),
    };
  }, []);
  useEffect(
    () => () => {
      const maps = new Set<THREE.Texture>();
      for (const m of Object.values(materials)) {
        if (m.map) maps.add(m.map);
        if (m instanceof THREE.MeshStandardMaterial && m.aoMap)
          maps.add(m.aoMap);
        m.dispose();
      }
      maps.forEach((t) => t.dispose());
    },
    [materials],
  );
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Box
        at={[0, 0, -0.1]}
        size={[3.14, 3.14, 0.2]}
        material={materials.oak}
      />
      <Surface at={[0, 0, 0.0005]} size={[3, 3]} material={materials.floor} />
      <Box at={[-1.525, 0, 0.6]} size={[0.05, 3.1, 1.2]} color="#c5c1ad" />
      <Box at={[0, 1.525, 0.6]} size={[3, 0.05, 1.2]} color="#b4bca6" />
      <Surface
        at={[-1.498, 0, 0.6]}
        size={[3, 1.2]}
        material={materials.left}
        left
      />
      <Surface
        at={[0, 1.498, 0.6]}
        size={[3, 1.2]}
        material={materials.back}
        back
      />
      {/* Oak skirting and a cutaway brass edge expose the experiment clearly. */}
      <Box
        at={[-1.485, 0, 0.045]}
        size={[0.028, 3, 0.09]}
        material={materials.oak}
      />
      <Box
        at={[0, 1.485, 0.045]}
        size={[3, 0.028, 0.09]}
        material={materials.oak}
      />
      <Box at={[1.52, 0, 0.12]} size={[0.05, 3.1, 0.25]} color="#9bae97" />
      <Box at={[0, -1.52, 0.12]} size={[3, 0.05, 0.25]} color="#9bae97" />
      <Box
        at={[1.52, 0, 0.25]}
        size={[0.054, 3.1, 0.013]}
        material={materials.oak}
      />
      <Box
        at={[0, -1.52, 0.25]}
        size={[3, 0.054, 0.013]}
        material={materials.oak}
      />
      {/* A flush stone experiment inlay keeps the physical floor at z=0. */}
      <Surface
        at={[kit.focus[0], kit.focus[1], 0.001]}
        size={[1.55, 1.5]}
        material={materials.stone}
      />
      {[-0.5, 0, 0.5].map((v) => (
        <group key={v} position={[kit.focus[0], kit.focus[1], 0.0014]}>
          <Box at={[v, 0, 0]} size={[0.0015, 1.5, 0.0003]} color="#b6ad98" />
          <Box at={[0, v, 0]} size={[1.55, 0.0015, 0.0003]} color="#b6ad98" />
        </group>
      ))}
      {/* Deep window reveal, oak mullions and a broad daylight surface. */}
      <Box
        at={[-1.47, 0.12, 0.79]}
        size={[0.055, 1.45, 0.64]}
        material={materials.oak}
      />
      <Box
        at={[-1.438, 0.12, 0.79]}
        size={[0.01, 1.37, 0.56]}
        color="#eff0d8"
      />
      {[-0.32, 0.12, 0.56].map((y) => (
        <group key={y}>
          <Box
            at={[-1.428, y, 0.79]}
            size={[0.012, 0.415, 0.53]}
            color="#c7d6bf"
          />
          <Box
            at={[-1.414, y, 0.79]}
            size={[0.025, 0.013, 0.55]}
            material={materials.oak}
          />
        </group>
      ))}
      <Box
        at={[-1.4, 0.12, 0.79]}
        size={[0.035, 1.4, 0.014]}
        material={materials.oak}
      />
      <Box
        at={[-1.385, 0.12, 0.47]}
        size={[0.22, 1.55, 0.04]}
        material={materials.oak}
      />
      <Plant at={[-1.36, 0.63, 0.49]} scale={0.65} />
      {/* Fitted cabinet front: dimensions match the fixed shelf collision envelope. */}
      <Box
        at={[-1.3, -0.75, 0.304]}
        size={[0.22, 0.7, 0.016]}
        material={materials.oak}
      />
      {[-0.52, -0.75, -0.98].map((y) => (
        <group key={y}>
          <Box
            at={[-1.187, y, 0.16]}
            size={[0.008, 0.212, 0.25]}
            color="#8fa183"
          />
          <Cylinder
            at={[-1.178, y, 0.24]}
            radius={0.009}
            height={0.008}
            rotation={[0, 0, Math.PI / 2]}
          />
        </group>
      ))}
      <Plant at={[-1.28, -0.96, 0.316]} scale={0.7} />
      {/* Built-in worktop, recessed doors, and brass handles on the existing bench. */}
      <Box
        at={[0.35, 1.3, 0.165]}
        size={[0.92, 0.24, 0.025]}
        material={materials.oak}
      />
      {[-0.0, 0.3, 0.6].map((x) => (
        <group key={x}>
          <Box
            at={[x, 1.187, 0.08]}
            size={[0.27, 0.008, 0.12]}
            color="#8b9c81"
          />
          <Box
            at={[x, 1.179, 0.11]}
            size={[0.065, 0.01, 0.008]}
            color="#b99250"
            metal
          />
        </group>
      ))}
      {/* A shared teaching wall leaves the walking and experiment space clear. */}
      <TeachingBoard lesson={kit.id} />
      <Label
        text="CLASS EQUIPMENT"
        at={[0.83, 1.469, 0.83]}
        width={0.57}
        height={0.1}
        back
      />
      {["GEOMETRY", "WEIGHTS", "TOOLS"].map((text, i) => (
        <Label
          key={text}
          text={text}
          at={[i * 0.3, 1.174, 0.065]}
          width={0.22}
          height={0.038}
          back
          dark={false}
        />
      ))}
      <LiveDisplay sim={sim} />
      {/* Task lamp: a real light and visible shade, not an unexplained glow strip. */}
      <Cylinder at={[0.67, 1.31, 0.19]} radius={0.05} height={0.015} />
      <Cylinder at={[0.67, 1.31, 0.31]} radius={0.008} height={0.24} />
      <group position={[0.64, 1.27, 0.45]} rotation={[Math.PI / 2, 0, 0.2]}>
        <mesh castShadow>
          <coneGeometry args={[0.085, 0.08, 32, 1, true]} />
          <meshStandardMaterial
            color="#355342"
            side={THREE.DoubleSide}
            metalness={0.25}
            roughness={0.45}
          />
        </mesh>
      </group>
      <pointLight
        position={[0.64, 1.25, 0.41]}
        color="#ffdf9c"
        intensity={0.12}
        distance={1.1}
        decay={2}
      />
      {/* Soft contact shading complements the offline AO of static furniture. */}
      {[
        [0.35, 1.3, 1.1, 0.5],
        [-1.3, -0.75, 0.48, 0.95],
      ].map(([x, y, w, h], i) => (
        <Surface
          key={i}
          at={[x!, y!, 0.0018]}
          size={[w!, h!]}
          material={materials.shade}
        />
      ))}
      {[-0.58, 0.03].map((y, i) => (
        <group key={y} position={[-0.98, y, 0.002]}>
          <mesh>
            <ringGeometry args={[0.14, 0.143, 48]} />
            <meshBasicMaterial color="#8e956d" />
          </mesh>
          <Label
            text={i ? "PIP" : "NOVA"}
            at={[0, -0.2, 0]}
            width={0.19}
            height={0.048}
            dark={false}
          />
        </group>
      ))}
      <group position={[kit.focus[0] + 0.58, kit.focus[1] + 0.4, 0.003]}>
        <mesh
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
        >
          <ringGeometry args={[0.065, hover ? 0.08 : 0.07, 48]} />
          <meshBasicMaterial color={hover ? "#496f51" : "#9b8452"} />
        </mesh>
        <Label
          text={hover ? "Focus experiment" : "LEARNING STATION"}
          at={[0, -0.12, 0]}
          width={0.32}
          height={0.065}
          dark={false}
        />
      </group>
      <Atmosphere reducedMotion={reducedMotion} />
    </group>
  );
}
