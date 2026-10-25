import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { BALANCE_FIXTURE, type BotId } from "@kestrel/contracts";
import { useLab } from "../state/lab";
import { setAnchor } from "../world/anchors";
import { palette } from "../world/palette";
import { buildRig, loadKinematics, MODEL_DIR, setJoint, type Rig } from "../vendor/microduck/duck.js";
import { materialHookFor, VARIANTS } from "../vendor/microduck/variants.js";
import { JOINT_NAMES } from "../vendor/microduck/constants.js";
import { link } from "./link";
import { physicsDisabled, useMicroduck } from "./status";
import { headingToYaw, MicroduckWorld, SCALE, toPhysicsXY, toSceneXZ, yawToHeading, type Duck } from "./physics";

const BOTS = ["pip", "nova"] as const;
// Identity is the duck's own colourway plus its name tag and marking, not colour alone.
const COLOURWAY = { pip: VARIANTS.charcoal, nova: VARIANTS.purple } as const;


let booted: Promise<{ world: MicroduckWorld; rigs: Record<BotId, Rig> }> | null = null;
function bootOnce() {
  booted ??= (async () => {
    const [world, k] = await Promise.all([MicroduckWorld.boot(), loadKinematics(`${MODEL_DIR}/kinematics.json`)]);
    const [pip, nova] = await Promise.all(BOTS.map((id) => buildRig(k, { materialForMesh: materialHookFor(COLOURWAY[id]) })));
    return { world, rigs: { pip, nova } };
  })();
  return booted;
}

const WAYPOINT_REACHED = 0.2; // scene metres

/** Where a body walks: along its fixture lane while it owns an action, otherwise hold the published pose. */
function target(id: BotId, duck: Duck) {
  const sim = useLab.getState().simulation;
  const bot = sim.bots[id];
  const lane = BALANCE_FIXTURE.bots[id];
  const active = sim.activeAction?.request.botId === id ? sim.activeAction : null;
  const here = duck.pose();
  const scene = toSceneXZ(here.px, here.py);
  link.pose[id] = { x: scene.x, z: scene.z, heading: yawToHeading(here.yaw) };
  let goal: readonly number[] = bot.position;
  let heading = bot.headingRad;
  if (active && active.phase === "approach") {
    if (link.leg[id] === 0 && Math.hypot(scene.x - lane.waypoint[0], scene.z - lane.waypoint[2]) < WAYPOINT_REACHED) link.leg[id] = 1;
    goal = link.leg[id] === 0 ? lane.waypoint : lane.dock;
    heading = Math.PI;
  } else if (active) {
    goal = lane.dock;
    heading = Math.PI;
  }
  const { px, py } = toPhysicsXY(goal[0], goal[2]);
  const working = bot.status === "docking" || bot.status === "operating";
  // Head command slots, as the real robot's runtime takes them: look down at the station control.
  return { px, py, yaw: headingToYaw(heading), head: { neck: 0, pitch: working ? 0.55 : 0, yaw: 0 } };
}

function spawn(duck: Duck, id: BotId) {
  const s = BALANCE_FIXTURE.bots[id].spawn;
  const { px, py } = toPhysicsXY(s[0], s[2]);
  duck.reset(px, py, headingToYaw(Math.PI));
}

/** Pip and Nova as real Microducks: MuJoCo bodies walked by the trained policy. */
export function MicroduckBots({ selected, onPick, fallback }: { selected: BotId; onPick: (id: BotId) => void; fallback: React.ReactNode }) {
  const [ready, setReady] = useState<{ world: MicroduckWorld; rigs: Record<BotId, Rig> } | null>(null);
  const failed = useMicroduck((s) => s.state === "failed" || s.state === "disabled");
  const ducks = useRef<Record<BotId, Duck> | null>(null);
  const rings = useRef<Record<BotId, Mesh | null>>({ pip: null, nova: null });

  useEffect(() => {
    if (physicsDisabled()) return;
    let alive = true;
    bootOnce().then(
      (r) => alive && setReady(r),
      (err: unknown) => {
        console.error("[microduck] boot failed", err);
        useMicroduck.setState({ state: "failed", error: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const created = { pip: ready.world.createDuck(), nova: ready.world.createDuck() };
    for (const id of BOTS) spawn(created[id], id);
    ducks.current = created;
    let generation = useLab.getState().simulation.resetGeneration;
    let steps = 0,
      t0 = performance.now();
    const stop = ready.world.run(
      () => BOTS.map((id) => created[id]),
      () => {
        const g = useLab.getState().simulation.resetGeneration;
        if (g !== generation) {
          generation = g;
          for (const id of BOTS) spawn(created[id], id);
        }
        for (const id of BOTS) created[id].steer(target(id, created[id]));
        steps++;
        const now = performance.now();
        if (now - t0 > 1000) {
          useMicroduck.setState({
            state: "running",
            hz: Math.round((steps * 1000) / (now - t0)),
            falls: created.pip.falls + created.nova.falls,
          });
          steps = 0;
          t0 = now;
        }
      },
    );
    useMicroduck.setState({ state: "running" });
    for (const id of BOTS) {
      const p = created[id].pose(), sc = toSceneXZ(p.px, p.py);
      link.pose[id] = { x: sc.x, z: sc.z, heading: yawToHeading(p.yaw) };
    }
    link.ready = true;
    return () => {
      link.ready = false;
      link.pose.pip = link.pose.nova = null;
      stop();
      ducks.current = null;
      for (const id of BOTS) created[id].data.delete?.();
    };
  }, [ready]);

  useFrame(() => {
    const all = ducks.current;
    if (!all || !ready) return;
    for (const id of BOTS) {
      const rig = ready.rigs[id],
        qpos = all[id].data.qpos;
      const trunk = rig.bodies.get("trunk_base")!;
      trunk.position.set(qpos[0], qpos[1], qpos[2]);
      trunk.quaternion.set(qpos[4], qpos[5], qpos[6], qpos[3]);
      ready.world.qposAdr.forEach((adr, j) => setJoint(rig, JOINT_NAMES[j], qpos[adr]));
      const { x, z } = toSceneXZ(qpos[0], qpos[1]);
      setAnchor(id, x, 0.02, z);
      setAnchor(`${id}-head`, x, 1.15, z);
      const ring = rings.current[id];
      if (ring) {
        ring.position.set(x, 0.012, z);
        ring.visible = selected === id;
      }
    }
  });

  if (failed) return <>{fallback}</>;
  if (!ready) return null;
  return (
    <group>
      {BOTS.map((id) => (
        <mesh
          key={`ring-${id}`}
          ref={(m) => {
            rings.current[id] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.36, 0.43, 48]} />
          <meshStandardMaterial color={palette.amethyst} emissive={palette.amethyst} emissiveIntensity={0.25} />
        </mesh>
      ))}
      <group scale={SCALE}>
        {BOTS.map((id) => (
          <primitive
            key={id}
            object={ready.rigs[id].placer}
            onClick={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              onPick(id);
            }}
            onPointerOver={() => (document.body.style.cursor = "pointer")}
            onPointerOut={() => (document.body.style.cursor = "")}
          />
        ))}
      </group>
    </group>
  );
}
