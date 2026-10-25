import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D, type MeshStandardMaterial } from "three";
import { BALANCE_FIXTURE, type BotId, type Position } from "@kestrel/contracts";
import { useLab } from "../state/lab";
import { palette } from "./palette";

const DOTS = 40;

/** Docking pads, and the fixture's route while a bot is actually acting. */
function Route({ id, reduced }: { id: BotId; reduced: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const start = useRef<Position | null>(null);
  const shown = useRef(0);
  const o = useMemo(() => new Object3D(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const sim = useLab.getState().simulation;
    const acting = sim.activeAction?.request.botId === id;
    if (acting && !start.current) start.current = sim.bots[id].position;
    if (!acting) start.current = null;
    const target = acting ? 1 : 0;
    shown.current += (target - shown.current) * (reduced ? 1 : Math.min(1, dt * 6));
    (m.material as MeshStandardMaterial).opacity = 0.85 * shown.current;
    m.visible = shown.current > 0.02;
    if (!m.visible || !start.current) return;
    const { waypoint, dock } = BALANCE_FIXTURE.bots[id];
    const pts = [start.current, waypoint, dock];
    const lens = [Math.hypot(pts[1][0] - pts[0][0], pts[1][2] - pts[0][2]), Math.hypot(pts[2][0] - pts[1][0], pts[2][2] - pts[1][2])];
    const total = lens[0] + lens[1];
    for (let i = 0; i < DOTS; i++) {
      let d = (i / (DOTS - 1)) * total;
      const seg = d <= lens[0] || lens[1] === 0 ? 0 : 1;
      if (seg === 1) d -= lens[0];
      const a = pts[seg],
        b = pts[seg + 1];
      const t = lens[seg] ? Math.min(1, d / lens[seg]) : 0;
      o.position.set(a[0] + (b[0] - a[0]) * t, 0.012, a[2] + (b[2] - a[2]) * t);
      o.scale.setScalar(i % 2 ? 0 : 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, DOTS]} visible={false}>
      <cylinderGeometry args={[0.035, 0.035, 0.01, 12]} />
      <meshStandardMaterial color={palette.amethyst} emissive={new Color(palette.amethyst)} emissiveIntensity={0.3} transparent opacity={0} />
    </instancedMesh>
  );
}

function Pad({ id }: { id: BotId }) {
  const [x, , z] = BALANCE_FIXTURE.bots[id].dock;
  return (
    <group position={[x, 0.004, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.3, 40]} />
        <meshStandardMaterial color={palette.white} roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.24, 0.29, 40]} />
        <meshStandardMaterial color={palette.noir} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Lanes({ reduced }: { reduced: boolean }) {
  return (
    <group>
      <Pad id="pip" />
      <Pad id="nova" />
      <Route id="pip" reduced={reduced} />
      <Route id="nova" reduced={reduced} />
    </group>
  );
}
