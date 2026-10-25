import { MOMENTS, roomProps, slotFilled, type BotId, type DuckTask, type LabKit, type Vec2 } from "@kestrel/contracts";
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { CTRL_DT, DECIMATION, NUM_JOINTS, OBS_SIZE, POLICIES, ROBOT_DIR, type PolicyId } from "./constants";
import { buildSceneXml, type DuckSpawn } from "./mjcf";
import { BalanceExperiment, CrewPlan, type BalanceResult, type ExperimentPorts } from "./moments";
import { Robot, type DuckMode, type RobotEvent } from "./robot";
import { TaskRunner, type BalanceView, type Skill, type TaskStep, type WorldView } from "./tasks";

// Browser-side Microduck runtime: MuJoCo WASM physics stepping the MJCF the
// policies were trained on, ONNX policies at 50 Hz, for every robot in ONE
// shared MjModel/MjData (robots namespaced like ROSClaw Duckverse's world
// composer). It runs outside React renders and never waits on network or
// model calls. Ported and trimmed from pollen-robotics/microduck-simulator
// (Apache-2.0, rev ad9d41a).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mujoco = any;
type Ort = typeof import("onnxruntime-web");
type Session = import("onnxruntime-web").InferenceSession;

export type { DuckMode } from "./robot";
export const BOTS: BotId[] = ["pip", "nova"];
export type SimEvent =
  | { type: "task-done"; duck: BotId | "lab"; task: DuckTask; ok: boolean; summary: string }
  | { type: "reset"; reason: string }
  | { type: "fell"; duck: BotId }
  | { type: "recovered"; duck: BotId }
  | { type: "experiment"; result: BalanceResult };

export type SimStatus = {
  mode: DuckMode | "recovering" | "fallen";
  sitting: boolean;
  task: DuckTask | null;
  /** The running task's state-machine phase, if it reports one. */
  phase: string | null;
  pose: { x: number; y: number; yawDeg: number };
  hz: number;
  balance: BalanceView | null;
  experiment: { phase: string; result: BalanceResult | null } | null;
};

/** One contact-ledger row: a robot (or both robots) against a prop, after Duckverse's audit. */
export type ContactRecord = { first: number; last: number; samples: number; impulseNs: number; peakN: number; maxPenetrationM: number };

export type SimPerf = { stepMs: number; inferMs: number; physicsMs: number; auditMs: number; steps: number };

type Pose7 = { pos: [number, number, number]; quat: [number, number, number, number] };
type Instruction = TaskStep | { pin?: "release" | "lock" } | null;

export async function loadRuntimes(onLine: (label: string) => void) {
  onLine("Loading physics and policy runtimes");
  const [{ default: loadMujoco }, ort] = await Promise.all([
    import("@mujoco/mujoco"),
    import("onnxruntime-web/wasm") as Promise<Ort>,
  ]);
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
  // No COOP/COEP headers in dev, so no shared-memory threads.
  ort.env.wasm.numThreads = 1;
  const mujoco: Mujoco = await loadMujoco({
    locateFile: (p: string) => (p.endsWith(".wasm") ? mujocoWasmUrl : p),
  });
  return { mujoco, ort };
}

/** Apparatus props a robot must be clear of before the plank is measured. */
const APPARATUS = new Set(["plank", "pivot", ...MOMENTS.weights.flatMap((w) => [w.id, `${w.id}-paddle`])]);

export class DuckSim {
  private model: any = null;
  private data: any = null;
  private vfs: any;
  private standKey = 0;
  private propBodies = new Map<string, number>();
  private propOfBody = new Map<number, string>();
  private slotHolds = new Map<string, { body: number; dof: number; slot: LabKit["slots"][number] }>();
  private geomBody: ArrayLike<number> = [];
  private robots: Robot[] = [];
  private byId = new Map<BotId, Robot>();
  private duckOfBody = new Map<number, BotId>();

  // Kinematic holds for the Moments balance, applied before every physics
  // substep: a lock pin on the plank's hinge and a clamp on each weight's
  // rail. A clamp holds a carriage wherever it is and is only off while a
  // robot is pushing that weight. Both are idealised mechanisms.
  private pin: { q: number; v: number; state: BalanceView["pin"] } | null = null;
  private rails = new Map<string, { q: number; v: number; brake: number | null }>();

  // Contact ledger, sampled every physics substep (Duckverse parkour/audit.py).
  private ledger = new Map<string, ContactRecord>();
  private touching = new Map<BotId, Map<string, number>>();
  private lastApparatusContact = -Infinity;
  /** mj_contactForce's out-parameter must live in WASM memory (a JS array is copied in, never back). */
  private force: any = null;

  /** Plank lock/release tasks belong to the apparatus, not to a robot. */
  private readonly apparatus = new TaskRunner();
  private experiment: BalanceExperiment | null = null;
  private crew: CrewPlan | null = null;
  private experimentPhase = "";
  private lastExperiment: BalanceResult | null = null;
  private results = new Map<BotId, { ok: boolean; summary: string }>();
  private pendingReset: string | null = null;
  /** The balance's restoring stiffness about its pin (N·m/rad), measured from the model at rest. */
  private balanceK = 0;

  private acc = 0;
  private pendingKit: LabKit | null = null;
  private stepCount = 0;
  private hzWindow = { t: performance.now(), steps: 0, hz: 0 };
  readonly perf: SimPerf = { stepMs: 0, inferMs: 0, physicsMs: 0, auditMs: 0, steps: 0 };
  kit: LabKit;

  private constructor(
    private mujoco: Mujoco,
    private ort: Ort,
    private sessions: Record<PolicyId, Session>,
    private robotXml: string,
    kit: LabKit,
    private listener: (e: SimEvent) => void,
  ) {
    this.kit = kit;
    this.vfs = new mujoco.MjVFS();
  }

  static async create(
    kit: LabKit,
    listener: (e: SimEvent) => void,
    onLine: (label: string) => void = () => {},
  ): Promise<DuckSim> {
    const { mujoco, ort } = await loadRuntimes(onLine);
    onLine("Loading robot model and 7 policies");
    const opts = { executionProviders: ["wasm"] };
    const [robotXml, ...sessions] = await Promise.all([
      fetch(`${ROBOT_DIR}/robot_allcollisions.xml`).then((r) => {
        if (!r.ok) throw new Error(`Robot model failed to load (${r.status}).`);
        return r.text();
      }),
      ...(Object.keys(POLICIES) as PolicyId[]).map((id) =>
        ort.InferenceSession.create(POLICIES[id], opts),
      ),
    ]);
    const ids = Object.keys(POLICIES) as PolicyId[];
    const map = Object.fromEntries(ids.map((id, i) => [id, sessions[i]!])) as Record<PolicyId, Session>;
    const sim = new DuckSim(mujoco, ort, map, robotXml as string, kit, listener);
    onLine("Compiling the lab");
    await sim.compile(kit);
    return sim;
  }

  private async compile(lesson: LabKit): Promise<void> {
    // Room furniture is part of every kit, so tasks can target it too.
    const kit = { ...lesson, props: [...roomProps(), ...lesson.props] };
    const spawns: DuckSpawn[] = BOTS.map((id) => {
      const s = lesson.spawns[id];
      return { id, pos: [s[0], s[1]], yaw: s[2] };
    });
    const scene = buildSceneXml(this.robotXml, kit.props, spawns);
    await Promise.all(
      scene.meshFiles.map(async (f) => {
        const r = await fetch(`${ROBOT_DIR}/meshes/${f}`);
        if (!r.ok) throw new Error(`Collision mesh ${f} failed to load.`);
        try {
          this.vfs.addBuffer(`assets/${f}`, new Uint8Array(await r.arrayBuffer()));
        } catch {
          // Already in the VFS from an earlier kit.
        }
      }),
    );
    const m = this.mujoco;
    this.data?.delete();
    this.model?.delete();
    this.force ??= new m.DoubleBuffer(6);
    this.model = m.MjModel.from_xml_string(scene.xml, this.vfs);
    this.data = new m.MjData(this.model);
    const BODY = m.mjtObj.mjOBJ_BODY.value;
    this.standKey = m.mj_name2id(this.model, m.mjtObj.mjOBJ_KEY.value, "STAND");
    this.robots = BOTS.map((id) => new Robot(id, m, this.model, this.data, (e) => this.onRobot(id, e)));
    this.byId = new Map(this.robots.map((r) => [r.id, r]));
    assertNoCrossTalk(this.robots);
    this.duckOfBody = new Map(this.robots.flatMap((r) => [...r.bodies].map((b) => [b, r.id] as const)));
    this.propBodies = new Map(kit.props.map((p) => [p.id, m.mj_name2id(this.model, BODY, p.id)]));
    this.propOfBody = new Map([...this.propBodies].map(([id, b]) => [b, id]));
    const joint = (name: string) => this.model.jnt(name);
    this.slotHolds = new Map(kit.slots.flatMap((slot) => {
      const prop = kit.props.find((p) => p.id === slot.forProp && p.joint === "free");
      if (!prop) return [];
      const body = this.propBodies.get(prop.id)!;
      return [[prop.id, { body, dof: joint(`${prop.id}_free`).dofadr, slot }] as const];
    }));
    // Copy, don't keep the view: typed arrays over WASM memory go stale
    // (detached, every read undefined) whenever the WASM heap grows.
    this.geomBody = Int32Array.from(this.model.geom_bodyid as ArrayLike<number>);
    const plank = kit.props.find((p) => p.role === "plank" && p.joint === "hinge");
    this.pin = plank
      ? { q: joint(`${plank.id}_hinge`).qposadr, v: joint(`${plank.id}_hinge`).dofadr, state: "locked" }
      : null;
    this.rails = new Map(
      kit.props
        .filter((p) => p.joint === "slide")
        .map((p) => [p.id, { q: joint(`${p.id}_slide`).qposadr, v: joint(`${p.id}_slide`).dofadr, brake: 0 }]),
    );
    this.kit = kit;
    this.reset("Lab loaded");
    this.balanceK = plank ? this.measureStiffness(plank.id) : 0;
  }

  /**
   * k = m·g·h for the plank and everything on it: m from the plank's subtree
   * mass, h from its pin (the hinge anchor) down to the subtree's centre of
   * mass, read from MuJoCo at the level, locked rest pose.
   */
  private measureStiffness(plankId: string): number {
    const m = this.mujoco;
    const body = this.propBodies.get(plankId)!;
    const jnt = m.mj_name2id(this.model, m.mjtObj.mjOBJ_JOINT.value, `${plankId}_hinge`);
    const mass = this.model.body_subtreemass[body] as number;
    const comZ = this.data.subtree_com[body * 3 + 2] as number;
    const pinZ = this.data.xanchor[jnt * 3 + 2] as number;
    return mass * 9.81 * (pinZ - comZ);
  }

  private onRobot(id: BotId, e: RobotEvent) {
    if (e.type === "task-done") {
      this.results.set(id, { ok: e.ok, summary: e.summary });
      this.listener({ type: "task-done", duck: id, task: e.task, ok: e.ok, summary: e.summary });
    } else if (e.type === "fell" || e.type === "recovered") this.listener({ type: e.type, duck: id });
    else if (e.type === "respawn") this.pendingReset = e.reason;
  }

  /** Swap the subject kit. Applied between control steps. */
  setKit(kit: LabKit) {
    this.pendingKit = kit;
  }

  reset(reason = "Reset") {
    for (const r of this.robots) r.reset();
    this.apparatus.cancel();
    this.experiment = null;
    this.crew = null;
    this.experimentPhase = "";
    this.lastExperiment = null;
    this.results.clear();
    this.mujoco.mj_resetDataKeyframe(this.model, this.data, this.standKey);
    this.mujoco.mj_forward(this.model, this.data);
    if (this.pin) this.pin.state = "locked";
    for (const r of this.rails.values()) r.brake = this.data.qpos[r.q];
    this.ledger.clear();
    this.touching = new Map(BOTS.map((id) => [id, new Map()]));
    this.lastApparatusContact = -Infinity;
    this.listener({ type: "reset", reason });
  }

  // ── Robots ────────────────────────────────────────────────────────────
  robot(id: BotId = "pip"): Robot {
    return this.byId.get(id)!;
  }
  /** Pip's task runner (the duck Claude speaks for). */
  get tasks(): TaskRunner {
    return this.robot("pip").tasks;
  }
  get manual() {
    return this.robot("pip").manual;
  }
  set manual(v: { vx: number; wz: number }) {
    this.robot("pip").manual = v;
  }

  /** Start a one-shot or posture skill. Returns a refusal reason, or null. */
  trigger(skill: Skill, id: BotId = "pip"): string | null {
    return this.robot(id).trigger(skill);
  }

  /**
   * Start a bounded task. Returns a refusal reason, or null. A weight is
   * always moved by the robot that owns it; plank tasks belong to the lab.
   */
  runTask(task: DuckTask, id: BotId = "pip"): string | null {
    if (task.kind === "release_plank" || task.kind === "lock_plank") {
      if (this.experiment) return "The experiment is running. Stop it first.";
      if (task.kind === "release_plank" && [...this.rails.values()].some((r) => r.brake === null))
        return "Wait until the robots have finished moving the weights.";
      return this.apparatus.start(task, this.world("pip"));
    }
    if (task.kind === "set_balance") {
      if (this.experiment) return "The experiment is already running.";
      const exp = new BalanceExperiment(task);
      const refusal = exp.plan(this.ports());
      if (refusal) return refusal;
      for (const r of this.robots) r.tasks.cancel();
      this.results.clear();
      this.experiment = exp;
      this.experimentPhase = exp.phase;
      return null;
    }
    if (task.kind === "build_squares") {
      if (this.crew || this.experiment) return "The robots are already busy with a plan.";
      if (this.kit.id !== "pythagoras") return "Open the Pythagoras lesson first.";
      for (const r of this.robots) r.tasks.cancel();
      this.results.clear();
      // Largest first, each from its own open side. Pip takes the 5×5 while
      // Nova takes the 4×4 at the opposite corner; then Pip brings the 3×3.
      const push = (target: string): DuckTask => ({ kind: "push", target, toward: "slot" });
      this.crew = new CrewPlan(task, [[{ id: "pip", task: push("square-5") }, { id: "nova", task: push("square-4") }], [{ id: "pip", task: push("square-3") }]], () => {
        const props = this.propPositions();
        const filled = this.kit.slots.filter((s) => slotFilled(props.get(s.forProp) ?? [99, 99], s));
        const all = filled.length === this.kit.slots.length;
        return { ok: all, summary: all ? "All three squares are on the triangle: 9 + 16 = 25." : `${filled.length} of ${this.kit.slots.length} squares are on their sides.` };
      });
      return null;
    }
    const owner = task.kind === "place_weight" ? MOMENTS.weights.find((w) => w.id === task.target)?.owner ?? id : id;
    return this.startOn(owner, task);
  }

  private startOn(id: BotId, task: DuckTask): string | null {
    const robot = this.robot(id);
    const moves = ["move", "turn", "go_to", "push", "place_weight", "kick", "peck", "roll"].includes(task.kind);
    if (moves && robot.mode === "sitstand") return "The duck is sitting. Ask it to stand up first.";
    if (robot.recovery) return "The duck is getting back on its feet.";
    if (robot.tasks.active && robot.tasks.active !== task) {
      const old = robot.tasks.active;
      robot.tasks.cancel();
      this.listener({ type: "task-done", duck: id, task: old, ok: false, summary: "Replaced by a new task." });
    }
    return robot.tasks.start(task, this.world(id));
  }

  /** Cancel every robot's task and the experiment (Stop). */
  stopAll() {
    for (const r of this.robots) {
      r.tasks.cancel();
      r.manual = { vx: 0, wz: 0 };
    }
    this.apparatus.cancel();
    const plan = this.experiment ?? this.crew;
    if (plan) {
      this.experiment = null;
      this.crew = null;
      this.listener({ type: "task-done", duck: "lab", task: plan.task, ok: false, summary: "Stopped." });
    }
  }

  private ports(): ExperimentPorts {
    return {
      world: (id) => this.world(id),
      start: (id, task) => this.startOn(id, task),
      busy: (id) => this.robot(id).tasks.active !== null || this.robot(id).recovery !== null,
      clearFor: () => this.data.time - this.lastApparatusContact,
      stiffness: () => this.balanceK,
    };
  }

  // ── Loop ──────────────────────────────────────────────────────────────
  // Real-time 50 Hz loop on its own timer, independent of rendering, React
  // and any model latency. It catches up at most 5 steps, then drops time
  // (a slow or backgrounded tab slows the sim instead of exploding it).
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const tick = async () => {
      if (!this.running) return;
      const now = performance.now();
      this.acc = Math.min(this.acc + (now - last) / 1000, CTRL_DT * 5);
      last = now;
      try {
        if (this.pendingKit) {
          const kit = this.pendingKit;
          this.pendingKit = null;
          await this.compile(kit);
          this.acc = 0;
          last = performance.now();
        }
        while (this.running && this.acc >= CTRL_DT) {
          this.acc -= CTRL_DT;
          await this.controlStep();
        }
      } catch (e) {
        console.error("[duck] control step failed", e);
        this.reset("Recovered from a simulation error");
      }
      setTimeout(tick, 4);
    };
    void tick();
  }

  stop() {
    this.running = false;
  }

  world(id: BotId = "pip"): WorldView {
    const robot = this.robot(id);
    const props = new Map<string, Vec2>();
    const xpos = this.data.xpos;
    for (const [pid, b] of this.propBodies) props.set(pid, [xpos[b * 3], xpos[b * 3 + 1]]);
    const balance = this.balanceView();
    return {
      id,
      duck: robot.pose(),
      speed: robot.speed(),
      others: this.robots.filter((r) => r.id !== id).map((r) => ({ id: r.id, pose: r.pose() })),
      props,
      kit: this.kit,
      touching: this.touching.get(id) ?? new Map(),
      ...(balance ? { balance } : {}),
    };
  }

  private balanceView(): BalanceView | null {
    if (!this.pin) return null;
    const q = this.data.qpos;
    return {
      pin: this.pin.state,
      angle: q[this.pin.q],
      rails: new Map([...this.rails].map(([id, r]) => [id, q[r.q] as number])),
    };
  }

  /** Apply the tasks' balance instructions, and clamp any weight nobody is pushing. */
  private holdBalance(steps: Instruction[]) {
    const q = this.data.qpos;
    for (const step of steps) {
      if (step && "brake" in step && step.brake) {
        const r = this.rails.get(step.brake.id);
        if (r) r.brake = step.brake.at;
      }
    }
    const pushing = new Set(
      this.robots.map((r) => r.tasks.active).flatMap((t) => (t?.kind === "place_weight" ? [t.target] : [])),
    );
    for (const [id, r] of this.rails) if (r.brake === null && !pushing.has(id)) r.brake = q[r.q];
    for (const step of steps) {
      if (this.pin && step?.pin === "release") {
        // The weights are clamped where they stand before the plank is let go.
        for (const r of this.rails.values()) r.brake = q[r.q];
        this.pin.state = "free";
      }
      if (this.pin && step?.pin === "lock" && this.pin.state === "free") this.pin.state = "levelling";
    }
  }

  private hold() {
    const { qpos, qvel } = this.data;
    const pin = this.pin;
    if (pin && pin.state !== "free") {
      const a = qpos[pin.q];
      if (pin.state === "levelling") {
        // The pin drives the plank back to level at a steady rate, then locks it.
        qpos[pin.q] = Math.abs(a) < 0.006 ? 0 : a - Math.sign(a) * 0.0008;
        if (qpos[pin.q] === 0) pin.state = "locked";
      } else qpos[pin.q] = 0;
      qvel[pin.v] = 0;
    }
    // A clamp holds its carriage exactly where it is; it never moves one.
    for (const r of this.rails.values()) {
      if (r.brake === null) continue;
      qpos[r.q] = r.brake;
      qvel[r.v] = 0;
    }
    // Once a tile is seated, give it a gentle spring toward its slot while
    // another tile is being pushed. This counters incidental contact without
    // teleporting the tile or constraining the active push target.
    const activePushes = new Set(this.robots.flatMap((r) => {
      const task = r.tasks.active;
      return task?.kind === "push" ? [task.target] : [];
    }));
    const pushing = activePushes.size > 0;
    const applied = this.data.xfrc_applied as Float64Array;
    for (const [id, hold] of this.slotHolds) {
      const offset = hold.body * 6;
      applied[offset] = 0;
      applied[offset + 1] = 0;
      if (!pushing || activePushes.has(id)) continue;
      const pos = this.data.xpos as Float64Array;
      const vel = this.data.qvel as Float64Array;
      const dx = hold.slot.pos[0] - pos[hold.body * 3]!;
      const dy = hold.slot.pos[1] - pos[hold.body * 3 + 1]!;
      if (!slotFilled([pos[hold.body * 3]!, pos[hold.body * 3 + 1]!], hold.slot)) continue;
      const fx = Math.max(-1.2, Math.min(1.2, 3 * dx - 0.35 * vel[hold.dof]!));
      const fy = Math.max(-1.2, Math.min(1.2, 3 * dy - 0.35 * vel[hold.dof + 1]!));
      applied[offset] = fx;
      applied[offset + 1] = fy;
    }
  }

  /** Every-substep contact ledger: robot ↔ prop and robot ↔ robot, with force and penetration. */
  private audit() {
    const { mujoco, model, data } = this;
    const n = data.ncon;
    if (!n) return;
    const contacts = data.contact;
    const now = data.time;
    const dt = model.opt.timestep;
    for (let i = 0; i < n; i++) {
      const c = contacts.get(i);
      const b1 = this.geomBody[c.geom1]!;
      const b2 = this.geomBody[c.geom2]!;
      const dist = c.dist as number;
      c.delete?.();
      const d1 = this.duckOfBody.get(b1);
      const d2 = this.duckOfBody.get(b2);
      if (!d1 && !d2) continue;
      if (d1 && d2 && d1 === d2) continue; // a robot's own linkage
      const duck = (d1 ?? d2)!;
      const other = d1 && d2 ? (d1 === duck ? d2 : d1) : this.propOfBody.get(d1 ? b2 : b1);
      if (!other) continue; // the floor and walls
      mujoco.mj_contactForce(model, data, i, this.force);
      const f = (this.force.GetView() as Float64Array)[0]!;
      if (f <= 1e-7) continue;
      const key = d1 && d2 ? "pip↔nova" : `${duck}↔${other}`;
      const rec = this.ledger.get(key) ?? { first: now, last: now, samples: 0, impulseNs: 0, peakN: 0, maxPenetrationM: 0 };
      rec.last = now;
      rec.samples++;
      rec.impulseNs += f * dt;
      rec.peakN = Math.max(rec.peakN, f);
      rec.maxPenetrationM = Math.max(rec.maxPenetrationM, Math.max(0, -dist));
      this.ledger.set(key, rec);
      const t = this.touching.get(duck)!;
      t.set(other, Math.max(t.get(other) ?? 0, f));
      if (d1 && d2) this.touching.get(other as BotId)!.set(duck, f);
      if (APPARATUS.has(other)) this.lastApparatusContact = now;
    }
  }

  private async controlStep() {
    const t0 = performance.now();
    const { mujoco, model, data } = this;
    // 1. Tasks and manual input → each robot's twist; collect apparatus instructions.
    const steps: Instruction[] = [];
    for (const r of this.robots) steps.push(r.advance(() => r.tasks.step(this.world(r.id), CTRL_DT)));
    const plankTask = this.apparatus.active;
    const plank = plankTask ? this.apparatus.step(this.world("pip"), CTRL_DT) : null;
    if (plankTask && plank) {
      steps.push(plank);
      if (plank.done) this.listener({ type: "task-done", duck: "lab", task: plankTask, ok: plank.done.ok, summary: plank.done.summary });
    }
    if (this.experiment) {
      const exp = this.experiment;
      const s = exp.step(this.ports(), CTRL_DT, this.results);
      this.experimentPhase = s.phase;
      steps.push(s);
      if (s.done) {
        this.experiment = null;
        this.lastExperiment = s.done;
        this.listener({ type: "experiment", result: s.done });
        this.listener({ type: "task-done", duck: "lab", task: exp.task, ok: s.done.ok, summary: s.done.summary });
      }
    }
    if (this.crew) {
      const plan = this.crew;
      const s = plan.step(this.ports(), this.results);
      this.experimentPhase = s.phase;
      if (s.done) {
        this.crew = null;
        this.listener({ type: "task-done", duck: "lab", task: plan.task, ok: s.done.ok, summary: s.done.summary });
      }
    }
    this.holdBalance(steps);

    // 2. Policies: one inference per robot, each from its own observation buffer.
    const t1 = performance.now();
    for (const r of this.robots) {
      const policy = r.policy();
      if (!policy) continue;
      const session = this.sessions[policy];
      const input = new this.ort.Tensor("float32", r.buildObs(), [1, OBS_SIZE]);
      const out = await session.run({ [session.inputNames[0]!]: input });
      r.act(out[session.outputNames[0]!]!.data as Float32Array);
    }
    const t2 = performance.now();

    // 3. Physics: 4 × 5 ms substeps, holds before each, contacts audited after each.
    for (const t of this.touching.values()) t.clear();
    let auditMs = 0;
    for (let s = 0; s < DECIMATION; s++) {
      this.hold();
      mujoco.mj_step(model, data);
      const a = performance.now();
      this.audit();
      auditMs += performance.now() - a;
    }
    const t3 = performance.now();
    this.stepCount++;
    for (const r of this.robots) if (!r.afterStep()) return this.reset("Physics reset");
    if (this.pendingReset) {
      const reason = this.pendingReset;
      this.pendingReset = null;
      this.reset(reason);
    }
    // Exponential averages for the profiler readout.
    const k = 0.05;
    const p = this.perf;
    p.stepMs += k * (performance.now() - t0 - p.stepMs);
    p.inferMs += k * (t2 - t1 - p.inferMs);
    p.physicsMs += k * (t3 - t2 - auditMs - p.physicsMs);
    p.auditMs += k * (auditMs - p.auditMs);
    p.steps++;
  }

  // ── Reads for rendering and UI ────────────────────────────────────────
  readJoints(out: Float32Array, id: BotId = "pip"): Float32Array {
    const q = this.data.qpos;
    const r = this.robot(id);
    for (let j = 0; j < NUM_JOINTS; j++) out[j] = q[r.qposAdr[j]!];
    return out;
  }

  readTrunk(out: Pose7, id: BotId = "pip"): Pose7 {
    const q = this.data.qpos;
    const f = this.robot(id).freeQ;
    out.pos[0] = q[f]; out.pos[1] = q[f + 1]; out.pos[2] = q[f + 2];
    out.quat[0] = q[f + 3]; out.quat[1] = q[f + 4]; out.quat[2] = q[f + 5]; out.quat[3] = q[f + 6];
    return out;
  }

  /** Body pose of a prop in MuJoCo coordinates, quat as [w, x, y, z]. */
  readProp(id: string, out: Pose7): Pose7 | null {
    const b = this.propBodies.get(id);
    if (b === undefined || b < 0) return null;
    const xp = this.data.xpos;
    const xq = this.data.xquat;
    out.pos[0] = xp[b * 3]; out.pos[1] = xp[b * 3 + 1]; out.pos[2] = xp[b * 3 + 2];
    for (let k = 0; k < 4; k++) out.quat[k] = xq[b * 4 + k];
    return out;
  }

  propPositions(): Map<string, Vec2> {
    return this.world().props;
  }

  /** Largest robot contact force on a prop in the last control step (N); 0 when untouched. */
  touchForce(propId: string): number {
    let f = 0;
    for (const t of this.touching.values()) f = Math.max(f, t.get(propId) ?? 0);
    return f;
  }

  /** The plank's lock state, for drawing the pin. */
  pinState(): BalanceView["pin"] | null {
    return this.pin?.state ?? null;
  }

  /** The contact ledger since the last reset. */
  contacts(): Record<string, ContactRecord> {
    return Object.fromEntries(this.ledger);
  }

  /** Seconds of physics time since a robot last touched the apparatus. */
  apparatusClearFor(): number {
    return this.data.time - this.lastApparatusContact;
  }

  status(id: BotId = "pip"): SimStatus {
    const now = performance.now();
    const w = this.hzWindow;
    if (now - w.t > 1000) {
      w.hz = Math.round(((this.stepCount - w.steps) * 1000) / (now - w.t));
      w.t = now;
      w.steps = this.stepCount;
    }
    const r = this.robot(id);
    const { duck } = this.world(id);
    return {
      mode: r.recovery ? (r.recovery.state === "fallen" ? "fallen" : "recovering") : r.mode,
      sitting: r.mode === "sitstand" && r.sitFlag === 1,
      task: r.tasks.active ?? this.apparatus.active ?? this.experiment?.task ?? this.crew?.task ?? null,
      phase: r.tasks.phase,
      pose: { x: duck.x, y: duck.y, yawDeg: Math.round((duck.yaw * 180) / Math.PI) },
      hz: w.hz,
      balance: this.balanceView(),
      experiment:
        this.experiment || this.crew || this.lastExperiment
          ? { phase: this.experiment || this.crew ? this.experimentPhase : "DONE", result: this.experiment ? null : this.lastExperiment }
          : null,
    };
  }
}

/** Fail loudly if two robots would read or write the same joint, actuator or sensor. */
export function assertNoCrossTalk(
  robots: { id: string; qposAdr: number[]; dofAdr: number[]; ctrlAdr: number[]; gyroAdr: number; freeQ: number }[],
) {
  const seen = new Map<string, string>();
  for (const r of robots) {
    const own = [
      ...r.qposAdr.map((a) => `qpos ${a}`),
      ...r.dofAdr.map((a) => `qvel ${a}`),
      ...r.ctrlAdr.map((a) => `ctrl ${a}`),
      ...[0, 1, 2].map((k) => `sensor ${r.gyroAdr + k}`),
      ...[0, 1, 2, 3, 4, 5, 6].map((k) => `qpos ${r.freeQ + k}`),
    ];
    for (const key of own) {
      const prev = seen.get(key);
      if (prev && prev !== r.id) throw new Error(`Robots ${prev} and ${r.id} share ${key}.`);
      seen.set(key, r.id);
    }
  }
}
