import { roomProps, type DuckTask, type LabKit, type Vec2 } from "@kestrel/contracts";
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import {
  CMD_SIZE,
  CTRL_DT,
  DECIMATION,
  DEFAULT_POSE,
  FALL_DEBOUNCE_STEPS,
  FALL_SETTLE_STEPS,
  JOINT_NAMES,
  KICK_STEPS,
  NUM_JOINTS,
  OBS_SIZE,
  PECK_END_PHASE,
  PECK_PERIOD_S,
  POLICIES,
  POST_KICK_LOCK_STEPS,
  RECOVER_GIVEUP_STEPS,
  RECOVER_UPRIGHT_STEPS,
  ROBOT_DIR,
  ROLL_MAX_STEPS,
  type PolicyId,
} from "./constants";
import { buildSceneXml } from "./mjcf";
import { TaskRunner, type BalanceView, type Skill, type TaskStep, type WorldView } from "./tasks";

// Browser-side Microduck runtime: MuJoCo WASM physics stepping the MJCF the
// policies were trained on, ONNX policies at 50 Hz. It runs outside React
// renders and never waits on network or model calls. Ported and trimmed
// from pollen-robotics/microduck-simulator (Apache-2.0, rev ad9d41a).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mujoco = any;
type Ort = typeof import("onnxruntime-web");
type Session = import("onnxruntime-web").InferenceSession;

export type DuckMode = "walk" | "sitstand" | "kickL" | "kickR" | "roll" | "peck";
export type SimEvent =
  | { type: "task-done"; task: DuckTask; ok: boolean; summary: string }
  | { type: "reset"; reason: string }
  | { type: "fell" }
  | { type: "recovered" };

export type SimStatus = {
  mode: DuckMode | "recovering" | "fallen";
  sitting: boolean;
  task: DuckTask | null;
  pose: { x: number; y: number; yawDeg: number };
  hz: number;
  balance: BalanceView | null;
};

type Pose7 = { pos: [number, number, number]; quat: [number, number, number, number] };

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

export class DuckSim {
  private model: any = null;
  private data: any = null;
  private vfs: any;
  private qposAdr: number[] = [];
  private dofAdr: number[] = [];
  private gyroAdr = 0;
  private trunkId = 0;
  private standKey = 0;
  private propBodies = new Map<string, number>();
  // Kinematic holds for the Moments balance, applied before every physics
  // substep: a lock pin on the plank's hinge and a brake on each weight's
  // rail. A brake is only off while the duck is pushing that weight.
  private pin: { q: number; v: number; state: BalanceView["pin"] } | null = null;
  private rails = new Map<string, { q: number; v: number; brake: number | null }>();

  private readonly obs = new Float32Array(OBS_SIZE);
  private readonly cmd = new Float32Array(CMD_SIZE);
  private readonly lastAction = new Float32Array(NUM_JOINTS);
  private currentTwist: [number, number] = [0, 0];

  private mode: DuckMode = "walk";
  private sitFlag = 0;
  private modeSteps = 0;
  private pendingStand = -1; // steps until sitstand hands back to walk
  private pendingSit = -1; // steps until the sit flag is raised
  private postKickLock = 0;
  private rollTipped = false;
  private recovery: null | { state: "fallen" | "recovering"; steps: number; upright: number } = null;
  private fallDebounce = 0;
  private fallenSteps = 0;

  private acc = 0;
  private pendingKit: LabKit | null = null;
  private stepCount = 0;
  private hzWindow = { t: performance.now(), steps: 0, hz: 0 };

  readonly tasks = new TaskRunner();
  /** Keyboard/manual twist. Any nonzero input cancels a running task. */
  manual = { vx: 0, wz: 0 };
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
    const scene = buildSceneXml(this.robotXml, kit.props);
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
    this.model = m.MjModel.from_xml_string(scene.xml, this.vfs);
    this.data = new m.MjData(this.model);
    const BODY = m.mjtObj.mjOBJ_BODY.value;
    this.qposAdr = JOINT_NAMES.map((n) => this.model.jnt(n).qposadr);
    this.dofAdr = JOINT_NAMES.map((n) => this.model.jnt(n).dofadr);
    this.gyroAdr = this.model.sensor("imu_ang_vel").adr;
    this.trunkId = m.mj_name2id(this.model, BODY, "trunk_base");
    this.standKey = m.mj_name2id(this.model, m.mjtObj.mjOBJ_KEY.value, "STAND");
    this.propBodies = new Map(kit.props.map((p) => [p.id, m.mj_name2id(this.model, BODY, p.id)]));
    const plank = kit.props.find((p) => p.role === "plank" && p.joint === "hinge");
    const joint = (name: string) => this.model.jnt(name);
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
  }

  /** Swap the subject kit. Applied between control steps. */
  setKit(kit: LabKit) {
    this.pendingKit = kit;
  }

  reset(reason = "Reset") {
    this.tasks.cancel();
    this.mode = "walk";
    this.sitFlag = 0;
    this.pendingSit = this.pendingStand = -1;
    this.postKickLock = 0;
    this.recovery = null;
    this.fallDebounce = this.fallenSteps = 0;
    this.lastAction.fill(0);
    this.mujoco.mj_resetDataKeyframe(this.model, this.data, this.standKey);
    this.mujoco.mj_forward(this.model, this.data);
    if (this.pin) this.pin.state = "locked";
    for (const r of this.rails.values()) r.brake = this.data.qpos[r.q];
    this.listener({ type: "reset", reason });
  }

  // ── Skills ────────────────────────────────────────────────────────────
  private get idle() {
    return this.mode === "walk" && !this.recovery && this.pendingStand < 0;
  }

  /** Start a one-shot or posture skill. Returns a refusal reason, or null. */
  trigger(skill: Skill): string | null {
    if (this.recovery) return "The duck is getting back on its feet.";
    if (skill === "stand") {
      if (this.mode !== "sitstand") return null;
      this.sitFlag = 0;
      this.pendingSit = -1;
      this.pendingStand = 100; // 2 s for the sitstand policy to stand up
      return null;
    }
    if (skill === "sit") {
      if (this.mode === "sitstand") return null;
      if (!this.idle) return "Finish the current move first.";
      this.setMode("sitstand");
      this.sitFlag = 0;
      this.pendingSit = 40; // hold the stand briefly before sitting
      return null;
    }
    if (!this.idle) return this.mode === "sitstand" ? "Stand up first." : "Finish the current move first.";
    this.setMode(skill === "kickL" ? "kickL" : skill === "kickR" ? "kickR" : skill);
    this.rollTipped = false;
    return null;
  }

  private setMode(mode: DuckMode) {
    this.mode = mode;
    this.modeSteps = 0;
    // The upstream runtime keeps action history across one-shots; it only
    // clears it on posture changes.
    if (mode === "walk" || mode === "sitstand") this.lastAction.fill(0);
  }

  /** Start a bounded task. Returns a refusal reason, or null. */
  runTask(task: DuckTask): string | null {
    // The plank is apparatus, not the duck: the learner can release it any time.
    if (task.kind === "release_plank" || task.kind === "lock_plank") return this.tasks.start(task, this.world());
    const moves = ["move", "turn", "go_to", "push", "place_weight", "kick", "peck", "roll"].includes(task.kind);
    if (moves && this.mode === "sitstand") return "The duck is sitting. Ask it to stand up first.";
    if (this.recovery) return "The duck is getting back on its feet.";
    return this.tasks.start(task, this.world());
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

  private world(): WorldView {
    const q = this.data.qpos;
    const props = new Map<string, Vec2>();
    const xpos = this.data.xpos;
    for (const [id, b] of this.propBodies) props.set(id, [xpos[b * 3], xpos[b * 3 + 1]]);
    const balance = this.balanceView();
    return { duck: { x: q[0], y: q[1], yaw: yawOf(q[3], q[4], q[5], q[6]) }, props, kit: this.kit, ...(balance ? { balance } : {}) };
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

  /** Apply a task's balance instructions, and brake any weight nobody is pushing. */
  private holdBalance(step: TaskStep | null) {
    const q = this.data.qpos;
    if (step?.brake) {
      const r = this.rails.get(step.brake.id);
      if (r) r.brake = step.brake.at;
    }
    const task = this.tasks.active;
    const pushing = task?.kind === "place_weight" ? task.target : null;
    for (const [id, r] of this.rails) if (r.brake === null && id !== pushing) r.brake = q[r.q];
    if (this.pin && step?.pin === "release") this.pin.state = "free";
    if (this.pin && step?.pin === "lock" && this.pin.state === "free") this.pin.state = "levelling";
  }

  private hold() {
    const { qpos, qvel } = this.data;
    const pin = this.pin;
    if (pin && pin.state !== "free") {
      const a = qpos[pin.q];
      if (pin.state === "levelling") {
        // The pin drives the plank back to level at a steady rate (gravity
        // pulls it back between substeps), then locks it.
        qpos[pin.q] = Math.abs(a) < 0.006 ? 0 : a - Math.sign(a) * 0.0008;
        if (qpos[pin.q] === 0) pin.state = "locked";
      } else qpos[pin.q] = 0;
      qvel[pin.v] = 0;
    }
    for (const r of this.rails.values()) {
      if (r.brake === null) continue;
      const x = qpos[r.q];
      // Ease a weight onto its mark rather than teleporting it.
      qpos[r.q] = Math.abs(x - r.brake) < 0.0005 ? r.brake : x + (r.brake - x) * 0.25;
      qvel[r.v] = 0;
    }
  }

  private gravityZ(): number {
    const xq = this.data.xquat;
    const i = this.trunkId * 4;
    return projectedGravity(xq[i], xq[i + 1], xq[i + 2], xq[i + 3])[2];
  }

  /** Advance manual input or the running task; gate motion by mode. */
  private twist(): [number, number] {
    const manual = this.manual.vx !== 0 || this.manual.wz !== 0;
    let out: [number, number] = [0, 0];
    let held: TaskStep | null = null;
    if (manual) {
      const task = this.tasks.active;
      if (task) {
        this.tasks.cancel();
        this.listener({ type: "task-done", task, ok: false, summary: "Interrupted by manual control." });
      }
      out = [this.manual.vx, this.manual.wz];
    } else {
      const task = this.tasks.active;
      const step = task ? this.tasks.step(this.world(), CTRL_DT) : null;
      if (task && step) {
        out = [step.vx, step.wz];
        held = step;
        if (step.done) {
          const refusal = step.trigger ? this.trigger(step.trigger) : null;
          this.listener({
            type: "task-done",
            task,
            ok: !refusal && step.done.ok,
            summary: refusal ?? step.done.summary,
          });
        }
      }
    }
    this.holdBalance(held);
    const gated =
      this.recovery || this.mode !== "walk" || this.postKickLock > 0 || this.pendingStand >= 0;
    return gated ? [0, 0] : out;
  }

  private buildObs(): Float32Array {
    const { data, obs, cmd } = this;
    const qpos = data.qpos;
    const qvel = data.qvel;
    const sens = data.sensordata;
    let i = 0;
    for (let a = 0; a < 3; a++) obs[i++] = sens[this.gyroAdr + a];
    const xq = data.xquat;
    const t = this.trunkId * 4;
    const g = projectedGravity(xq[t], xq[t + 1], xq[t + 2], xq[t + 3]);
    obs[i++] = g[0];
    obs[i++] = g[1];
    obs[i++] = g[2];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qpos[this.qposAdr[j]!] - DEFAULT_POSE[j]!;
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qvel[this.dofAdr[j]!];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = this.lastAction[j]!;
    cmd.fill(0);
    if (this.recovery) {
      // The get-up policy runs with an all-zero command.
    } else if (this.mode === "sitstand") cmd[0] = this.sitFlag;
    else if (this.mode === "peck") {
      const a = 2 * Math.PI * ((this.modeSteps * CTRL_DT) / PECK_PERIOD_S);
      cmd[0] = Math.cos(a);
      cmd[1] = Math.sin(a);
    } else if (this.mode === "walk") {
      cmd[0] = this.currentTwist[0];
      cmd[2] = this.currentTwist[1];
    }
    for (let c = 0; c < CMD_SIZE; c++) obs[i++] = cmd[c]!;
    return obs;
  }

  private session(): Session {
    if (this.recovery?.state === "recovering") return this.sessions.stand;
    return this.sessions[this.mode];
  }

  private async controlStep() {
    const { mujoco, model, data } = this;
    this.currentTwist = this.twist();
    if (this.recovery?.state !== "fallen") {
      const session = this.session();
      const input = new this.ort.Tensor("float32", this.buildObs(), [1, OBS_SIZE]);
      const out = await session.run({ [session.inputNames[0]!]: input });
      const act = out[session.outputNames[0]!]!.data as Float32Array;
      if (act.every((v) => Number.isFinite(v))) {
        this.lastAction.set(act);
        const ctrl = data.ctrl;
        for (let j = 0; j < NUM_JOINTS; j++) ctrl[j] = DEFAULT_POSE[j]! + act[j]!;
      }
    }
    for (let s = 0; s < DECIMATION; s++) {
      this.hold();
      mujoco.mj_step(model, data);
    }
    this.modeSteps++;
    this.stepCount++;
    this.afterStep();
  }

  private afterStep() {
    const z = this.data.qpos[2];
    const gz = this.gravityZ();
    if (!Number.isFinite(z) || !Number.isFinite(gz)) return this.reset("Physics reset");
    const fallen = gz > -0.5 || z < 0.02;

    if (this.pendingSit >= 0 && --this.pendingSit < 0 && this.mode === "sitstand") this.sitFlag = 1;
    if (this.pendingStand >= 0 && --this.pendingStand < 0) this.setMode("walk");
    if (this.postKickLock > 0 && this.mode === "walk") this.postKickLock--;

    if (this.recovery) {
      const r = this.recovery;
      r.steps++;
      if (r.state === "fallen" && r.steps >= FALL_SETTLE_STEPS) {
        this.recovery = { state: "recovering", steps: 0, upright: 0 };
        this.lastAction.fill(0);
      } else if (r.state === "recovering") {
        r.upright = gz < -0.85 ? r.upright + 1 : 0;
        if (r.upright >= RECOVER_UPRIGHT_STEPS) {
          this.recovery = null;
          this.setMode("walk");
          this.listener({ type: "recovered" });
        } else if (r.steps >= RECOVER_GIVEUP_STEPS) this.reset("Could not get up, so the duck respawned");
      }
    } else if (fallen && this.mode === "walk" && this.postKickLock === 0) {
      if (++this.fallDebounce >= FALL_DEBOUNCE_STEPS) {
        this.fallDebounce = 0;
        if (this.tasks.active) {
          const task = this.tasks.active;
          this.tasks.cancel();
          this.listener({ type: "task-done", task, ok: false, summary: "The duck fell over." });
        }
        this.recovery = { state: "fallen", steps: 0, upright: 0 };
        this.listener({ type: "fell" });
      }
    } else if (fallen && this.mode !== "roll") {
      if (++this.fallenSteps > 50) this.reset("The duck tipped over, so it respawned");
    } else {
      this.fallDebounce = 0;
      this.fallenSteps = 0;
    }

    if ((this.mode === "kickL" || this.mode === "kickR") && this.modeSteps >= KICK_STEPS) {
      this.mode = "walk";
      this.postKickLock = POST_KICK_LOCK_STEPS;
    }
    if (this.mode === "peck" && (this.modeSteps * CTRL_DT) / PECK_PERIOD_S >= PECK_END_PHASE)
      this.setMode("walk");
    if (this.mode === "roll") {
      if (gz > -0.3) this.rollTipped = true;
      const upright = gz < -0.85;
      if ((this.rollTipped && upright && this.modeSteps >= 40) || this.modeSteps >= ROLL_MAX_STEPS) {
        this.setMode("walk");
        if (!upright) this.reset("The roll didn't land, so the duck respawned");
      }
    }
  }

  // ── Reads for rendering and UI ────────────────────────────────────────
  readJoints(out: Float32Array): Float32Array {
    const q = this.data.qpos;
    for (let j = 0; j < NUM_JOINTS; j++) out[j] = q[this.qposAdr[j]!];
    return out;
  }

  readTrunk(out: Pose7): Pose7 {
    const q = this.data.qpos;
    out.pos[0] = q[0]; out.pos[1] = q[1]; out.pos[2] = q[2];
    out.quat[0] = q[3]; out.quat[1] = q[4]; out.quat[2] = q[5]; out.quat[3] = q[6];
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

  status(): SimStatus {
    const now = performance.now();
    const w = this.hzWindow;
    if (now - w.t > 1000) {
      w.hz = Math.round(((this.stepCount - w.steps) * 1000) / (now - w.t));
      w.t = now;
      w.steps = this.stepCount;
    }
    const { duck } = this.world();
    return {
      mode: this.recovery ? (this.recovery.state === "fallen" ? "fallen" : "recovering") : this.mode,
      sitting: this.mode === "sitstand" && this.sitFlag === 1,
      task: this.tasks.active,
      pose: { x: duck.x, y: duck.y, yawDeg: Math.round((duck.yaw * 180) / Math.PI) },
      hz: w.hz,
      balance: this.balanceView(),
    };
  }
}

/** Heading about +z from a MuJoCo [w, x, y, z] quaternion. */
export function yawOf(w: number, x: number, y: number, z: number): number {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

/** World −z expressed in the body frame of quaternion [w, x, y, z]. */
export function projectedGravity(w: number, x: number, y: number, z: number): [number, number, number] {
  // Rotate v = (0, 0, −1) by the conjugate quaternion.
  const v: [number, number, number] = [0, 0, -1];
  const qx = -x;
  const qy = -y;
  const qz = -z;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + w * tx + (qy * tz - qz * ty),
    v[1] + w * ty + (qz * tx - qx * tz),
    v[2] + w * tz + (qx * ty - qy * tx),
  ];
}
