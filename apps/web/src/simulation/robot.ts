import type { BotId, DuckTask } from "@kestrel/contracts";
import {
  CMD_SIZE,
  CTRL_DT,
  DEFAULT_POSE,
  FALL_DEBOUNCE_STEPS,
  FALL_SETTLE_STEPS,
  JOINT_NAMES,
  KICK_STEPS,
  NUM_JOINTS,
  OBS_SIZE,
  PECK_END_PHASE,
  PECK_PERIOD_S,
  POST_KICK_LOCK_STEPS,
  RECOVER_GIVEUP_STEPS,
  RECOVER_UPRIGHT_STEPS,
  ROLL_MAX_STEPS,
  type PolicyId,
} from "./constants";
import { TaskRunner, type DuckPose, type Skill, type TaskStep } from "./tasks";

// One Microduck's control interface into the shared MuJoCo world, after
// ROSClaw Duckverse's DuckRuntime (Apache-2.0): every address is resolved
// through the duck's name prefix, and each duck owns its observation buffer,
// previous action, command, mode state and task runner. Nothing here reads or
// writes another duck's joints, actuators or sensors.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DuckMode = "walk" | "sitstand" | "kickL" | "kickR" | "roll" | "peck";
export type RobotEvent =
  | { type: "task-done"; task: DuckTask; ok: boolean; summary: string }
  | { type: "fell" }
  | { type: "recovered" }
  | { type: "respawn"; reason: string };

export class Robot {
  readonly prefix: string;
  readonly qposAdr: number[];
  readonly dofAdr: number[];
  /** Actuator ids, in policy (JOINT_NAMES) order: this duck's slice of data.ctrl. */
  readonly ctrlAdr: number[];
  readonly freeQ: number;
  readonly freeV: number;
  readonly gyroAdr: number;
  readonly trunkId: number;
  /** Body ids of this duck's whole tree, for contact attribution. */
  readonly bodies: Set<number>;

  readonly obs = new Float32Array(OBS_SIZE);
  readonly cmd = new Float32Array(CMD_SIZE);
  readonly lastAction = new Float32Array(NUM_JOINTS);
  /** Command the policy receives this step: [vx, vy, wz]. */
  readonly twist = new Float32Array(3);

  mode: DuckMode = "walk";
  sitFlag = 0;
  modeSteps = 0;
  pendingStand = -1; // steps until sitstand hands back to walk
  pendingSit = -1; // steps until the sit flag is raised
  postKickLock = 0;
  rollTipped = false;
  recovery: null | { state: "fallen" | "recovering"; steps: number; upright: number } = null;
  fallDebounce = 0;
  fallenSteps = 0;
  falls = 0;

  readonly tasks = new TaskRunner();
  /** Keyboard/manual twist. Any nonzero input cancels a running task. */
  manual = { vx: 0, wz: 0 };

  constructor(
    readonly id: BotId,
    private readonly mujoco: any,
    private readonly model: any,
    private readonly data: any,
    private readonly emit: (e: RobotEvent) => void,
  ) {
    const m = mujoco;
    this.prefix = `${id}/`;
    const p = this.prefix;
    const ACT = m.mjtObj.mjOBJ_ACTUATOR.value;
    const BODY = m.mjtObj.mjOBJ_BODY.value;
    // Joint addresses come through each actuator's transmission, the
    // namespaced-model indexing Duckverse found necessary.
    this.ctrlAdr = JOINT_NAMES.map((n) => m.mj_name2id(model, ACT, p + n));
    if (this.ctrlAdr.some((a) => a < 0)) throw new Error(`${id}: missing actuators`);
    const trn = model.actuator_trnid;
    const jnt = this.ctrlAdr.map((a) => trn[2 * a]);
    this.qposAdr = jnt.map((j) => model.jnt_qposadr[j]);
    this.dofAdr = jnt.map((j) => model.jnt_dofadr[j]);
    const free = model.jnt(`${p}trunk_base_freejoint`);
    this.freeQ = free.qposadr;
    this.freeV = free.dofadr;
    this.gyroAdr = model.sensor(`${p}imu_ang_vel`).adr;
    this.trunkId = m.mj_name2id(model, BODY, `${p}trunk_base`);
    this.bodies = new Set();
    const parent = model.body_parentid;
    for (let b = 0; b < model.nbody; b++) {
      for (let a = b; a > 0; a = parent[a]) if (a === this.trunkId) { this.bodies.add(b); break; }
    }
  }

  pose(): DuckPose {
    const q = this.data.qpos;
    const f = this.freeQ;
    return { x: q[f], y: q[f + 1], yaw: yawOf(q[f + 3], q[f + 4], q[f + 5], q[f + 6]) };
  }

  /** Planar speed of the trunk, m/s. */
  speed(): number {
    const v = this.data.qvel;
    return Math.hypot(v[this.freeV], v[this.freeV + 1]);
  }

  reset() {
    this.tasks.cancel();
    this.mode = "walk";
    this.sitFlag = 0;
    this.pendingSit = this.pendingStand = -1;
    this.postKickLock = 0;
    this.recovery = null;
    this.fallDebounce = this.fallenSteps = 0;
    this.lastAction.fill(0);
    this.twist.fill(0);
  }

  get idle() {
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

  setMode(mode: DuckMode) {
    this.mode = mode;
    this.modeSteps = 0;
    // The upstream runtime keeps action history across one-shots; it only
    // clears it on posture changes.
    if (mode === "walk" || mode === "sitstand") this.lastAction.fill(0);
  }

  /** Manual input or the running task's step; gated by mode. Returns the task step. */
  advance(step: () => TaskStep | null): TaskStep | null {
    const manual = this.manual.vx !== 0 || this.manual.wz !== 0;
    let out: [number, number] = [0, 0];
    let taken: TaskStep | null = null;
    if (manual) {
      const task = this.tasks.active;
      if (task) {
        this.tasks.cancel();
        this.emit({ type: "task-done", task, ok: false, summary: "Interrupted by manual control." });
      }
      out = [this.manual.vx, this.manual.wz];
    } else {
      const task = this.tasks.active;
      const s = task ? step() : null;
      if (task && s) {
        out = [s.vx, s.wz];
        taken = s;
        if (s.done) {
          const refusal = s.trigger ? this.trigger(s.trigger) : null;
          this.emit({ type: "task-done", task, ok: !refusal && s.done.ok, summary: refusal ?? s.done.summary });
        }
      }
    }
    const gated = this.recovery || this.mode !== "walk" || this.postKickLock > 0 || this.pendingStand >= 0;
    this.twist[0] = gated ? 0 : out[0];
    this.twist[1] = 0; // the walking policy ignores lateral commands (measured)
    this.twist[2] = gated ? 0 : out[1];
    return taken;
  }

  gravityZ(): number {
    const xq = this.data.xquat;
    const i = this.trunkId * 4;
    return projectedGravity(xq[i], xq[i + 1], xq[i + 2], xq[i + 3])[2];
  }

  /** 61-D observation: [gyro, projected gravity, joint pos − default, joint vel, last action, command]. */
  buildObs(): Float32Array {
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
      cmd[0] = this.twist[0]!;
      cmd[1] = this.twist[1]!;
      cmd[2] = this.twist[2]!;
    }
    for (let c = 0; c < CMD_SIZE; c++) obs[i++] = cmd[c]!;
    return obs;
  }

  /** Which policy runs this step, or null while the fall settles (no inference). */
  policy(): PolicyId | null {
    if (this.recovery?.state === "fallen") return null;
    if (this.recovery?.state === "recovering") return "stand";
    return this.mode;
  }

  /** Write this duck's position targets: ctrl = DEFAULT_POSE + action (action scale 1). */
  act(action: ArrayLike<number>) {
    for (let j = 0; j < NUM_JOINTS; j++) if (!Number.isFinite(action[j]!)) return;
    const ctrl = this.data.ctrl;
    for (let j = 0; j < NUM_JOINTS; j++) {
      this.lastAction[j] = action[j]!;
      ctrl[this.ctrlAdr[j]!] = DEFAULT_POSE[j]! + action[j]!;
    }
  }

  /** Mode timers, falls and recovery after the physics substeps. Returns false if non-finite. */
  afterStep(): boolean {
    this.modeSteps++;
    const z = this.data.qpos[this.freeQ + 2];
    const gz = this.gravityZ();
    if (!Number.isFinite(z) || !Number.isFinite(gz)) return false;
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
          this.emit({ type: "recovered" });
        } else if (r.steps >= RECOVER_GIVEUP_STEPS) this.emit({ type: "respawn", reason: "Could not get up, so the lab reset" });
      }
    } else if (fallen && this.mode === "walk" && this.postKickLock === 0) {
      if (++this.fallDebounce >= FALL_DEBOUNCE_STEPS) {
        this.fallDebounce = 0;
        this.falls++;
        if (this.tasks.active) {
          const task = this.tasks.active;
          this.tasks.cancel();
          this.emit({ type: "task-done", task, ok: false, summary: "The duck fell over." });
        }
        this.recovery = { state: "fallen", steps: 0, upright: 0 };
        this.emit({ type: "fell" });
      }
    } else if (fallen && this.mode !== "roll") {
      if (++this.fallenSteps > 50) this.emit({ type: "respawn", reason: "The duck tipped over, so the lab reset" });
    } else {
      this.fallDebounce = 0;
      this.fallenSteps = 0;
    }

    if ((this.mode === "kickL" || this.mode === "kickR") && this.modeSteps >= KICK_STEPS) {
      this.mode = "walk";
      this.postKickLock = POST_KICK_LOCK_STEPS;
    }
    if (this.mode === "peck" && (this.modeSteps * CTRL_DT) / PECK_PERIOD_S >= PECK_END_PHASE) this.setMode("walk");
    if (this.mode === "roll") {
      if (gz > -0.3) this.rollTipped = true;
      const upright = gz < -0.85;
      if ((this.rollTipped && upright && this.modeSteps >= 40) || this.modeSteps >= ROLL_MAX_STEPS) {
        this.setMode("walk");
        if (!upright) this.emit({ type: "respawn", reason: "The roll didn't land, so the lab reset" });
      }
    }
    return true;
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
