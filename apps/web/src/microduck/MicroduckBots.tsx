import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { BotId } from "@kestrel/contracts";
import { useLab } from "../state/lab";
import { setAnchor } from "../world/anchors";
import { palette } from "../world/palette";
import { buildRig, loadKinematics, MODEL_DIR, setJoint, type Rig } from "../vendor/microduck/duck.js";
import { materialHookFor, VARIANTS } from "../vendor/microduck/variants.js";
import { JOINT_NAMES } from "../vendor/microduck/constants.js";
import { BALANCE, type Side } from "./balance";
import { link } from "./link";
import { physics } from "./instance";
import { MicroduckWorld, SCALE, toSceneXZ, yawToHeading } from "./physics";
import { HomeSkill, PushSkill, type Twist } from "./skills";
import { physicsDisabled, useBalance, useMicroduck } from "./status";

const BOTS = ["pip", "nova"] as const;
// Identity is the duck's own colourway plus its name tag and marking, not colour alone.
const COLOURWAY = { pip: VARIANTS.charcoal, nova: VARIANTS.purple } as const;
const sideOf = (objectId: string): Side => (objectId === "left-weight" ? "left" : "right");

let booted: Promise<{ world: MicroduckWorld; rigs: Record<BotId, Rig> }> | null = null;
function bootOnce() {
  booted ??= (async () => {
    const [world, k] = await Promise.all([MicroduckWorld.boot(BOTS, BALANCE.homes), loadKinematics(`${MODEL_DIR}/kinematics.json`)]);
    const [pip, nova] = await Promise.all(BOTS.map((id) => buildRig(k, { materialForMesh: materialHookFor(COLOURWAY[id]) })));
    return { world, rigs: { pip, nova } };
  })();
  return booted;
}

type Job = { kind: "push"; requestId: string; skill: PushSkill } | { kind: "home"; skill: HomeSkill } | null;

/**
 * Pip and Nova as real Microducks in one shared MuJoCo world with the floor
 * balance. Each runtime action becomes a physical push: the trained policy walks
 * the body to the carriage and pushes it with its chest; afterwards the duck walks
 * home. Carriages are braked at the runtime's recorded notch whenever no push owns them.
 */
export function MicroduckBots({ selected, onPick, fallback }: { selected: BotId; onPick: (id: BotId) => void; fallback: React.ReactNode }) {
  const [ready, setReady] = useState<{ world: MicroduckWorld; rigs: Record<BotId, Rig> } | null>(null);
  const failed = useMicroduck((s) => s.state === "failed" || s.state === "disabled");
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
    const { world } = ready;
    world.reset();
    const jobs: Record<BotId, Job> = { pip: null, nova: null };
    let generation = useLab.getState().simulation.resetGeneration;
    let steps = 0,
      t0 = performance.now();
    const stop = world.run(() => {
      const sim = useLab.getState().simulation;
      if (sim.resetGeneration !== generation) {
        generation = sim.resetGeneration;
        world.reset();
        jobs.pip = jobs.nova = null;
      }
      const owned = new Set<Side>();
      for (const id of BOTS) {
        const duck = world.ducks[id];
        const active = sim.activeAction?.request.botId === id ? sim.activeAction : null;
        let job = jobs[id];
        if (active && (job?.kind !== "push" || job.requestId !== active.request.requestId)) {
          if (!world.balance.locked) world.balance.lock();
          const r = active.request;
          job = jobs[id] = { kind: "push", requestId: r.requestId, skill: new PushSkill(world, duck, sideOf(r.objectId), r.parameters.positionCm) };
        } else if (!active && job?.kind === "push") {
          // The action ended (done, stopped, failed or reset): walk home.
          job = jobs[id] = { kind: "home", skill: new HomeSkill(duck, BALANCE.homes[id]) };
        }
        let twist: Twist = { vx: 0, wz: 0, head: [0, 0, 0] };
        if (job) {
          twist = job.skill.update();
          if (job.kind === "home" && job.skill.done) jobs[id] = null;
        }
        if (job?.kind === "push") {
          owned.add(job.skill.side);
          link.push[id] = { requestId: job.requestId, phase: job.skill.phase, progress: job.skill.progress(), reason: job.skill.reason };
        } else link.push[id] = null;
        duck.command(twist.vx, twist.wz, twist.head);
        const p = duck.pose(),
          sc = toSceneXZ(p.px, p.py);
        link.pose[id] = { x: sc.x, z: sc.z, heading: yawToHeading(p.yaw) };
      }
      // Carriages nobody is pushing sit braked at the runtime's recorded position.
      for (const side of ["left", "right"] as const)
        if (!owned.has(side) && world.balance.locked) world.balance.setBrake(side, BALANCE.slideFor(side, side === "left" ? sim.world.leftCm : sim.world.rightCm));
      steps++;
      if (steps % 5 === 0) {
        const b = world.balance;
        useBalance.setState({ available: true, locked: b.locked, angle: b.angle(), leftCm: b.carriageCm("left"), rightCm: b.carriageCm("right") });
      }
      const now = performance.now();
      if (now - t0 > 1000) {
        useMicroduck.setState({ state: "running", hz: Math.round((steps * 1000) / (now - t0)), falls: world.ducks.pip.falls + world.ducks.nova.falls });
        steps = 0;
        t0 = now;
      }
    });
    physics.world = world;
    useMicroduck.setState({ state: "running" });
    link.ready = true;
    return () => {
      link.ready = false;
      link.pose.pip = link.pose.nova = null;
      link.push.pip = link.push.nova = null;
      physics.world = null;
      useBalance.setState({ available: false, locked: true, angle: 0 });
      stop();
    };
  }, [ready]);

  useFrame(() => {
    if (!ready) return;
    const { world } = ready;
    const qpos = world.data.qpos;
    for (const id of BOTS) {
      const rig = ready.rigs[id],
        duck = world.ducks[id],
        f = duck.freeQ;
      const trunk = rig.bodies.get("trunk_base")!;
      trunk.position.set(qpos[f], qpos[f + 1], qpos[f + 2]);
      trunk.quaternion.set(qpos[f + 4], qpos[f + 5], qpos[f + 6], qpos[f + 3]);
      duck.qposAdr.forEach((adr, j) => setJoint(rig, JOINT_NAMES[j], qpos[adr]));
      const { x, z } = toSceneXZ(qpos[f], qpos[f + 1]);
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
