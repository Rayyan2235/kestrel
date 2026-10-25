// Microduck physics for the lab: the upstream MuJoCo WASM model and trained ONNX
// walking policy (pollen-robotics/microduck-simulator @ ad9d41a, Apache-2.0),
// stepped exactly like its game.js control loop: 50 Hz policy, 4 × 5 ms
// physics substeps, 61-D observation, 14 position targets. Adapted for Kestrel:
// every duck lives in ONE shared MuJoCo world (the robot tree duplicated with a
// name prefix per bot) together with the floor balance, so the bots can bump each
// other and push the same carriages. Upstream's arena, ball, props and terrain
// are left out.
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { Quaternion, Vector3 } from "three";
import type { BotId } from "@kestrel/contracts";
import { geometryToBinaryStl, loadGlbGeometries, MODEL_DIR } from "../vendor/microduck/duck.js";
import { ACTION_SCALE, CMD_SIZE, DECIMATION, DEFAULT_POSE, JOINT_NAMES, NUM_JOINTS, OBS_SIZE, TIMESTEP } from "../vendor/microduck/constants.js";
import { apparatusXml, BALANCE, type Side } from "./balance";

/**
 * Coordinate conversion between the lab renderer and MuJoCo.
 * Scene: metres, y up, heading 0 faces +z (see BALANCE_FIXTURE).
 * MuJoCo: metres, z up, yaw 0 faces +x (the duck's forward axis).
 * scene = SCALE × (px, pz, −py); heading = yaw + π/2.
 */
export const SCALE = 4;
export const toPhysicsXY = (x: number, z: number) => ({ px: x / SCALE, py: -z / SCALE });
export const toSceneXZ = (px: number, py: number) => ({ x: px * SCALE, z: -py * SCALE });
export const headingToYaw = (heading: number) => wrap(heading - Math.PI / 2);
export const yawToHeading = (yaw: number) => wrap(yaw + Math.PI / 2);
export const POLICY_URL = "/microduck/policies/BEST_alpha_walking.onnx";
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const HEAD_ALPHA = 0.2;

type Mujoco = any; // official @mujoco/mujoco embind module
type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>> };

async function buildPhysicsXml(bots: readonly BotId[], spawns: Record<BotId, { px: number; py: number; yaw: number }>) {
  const src = await (await fetch(`${MODEL_DIR}/robot_allcollisions.xml`)).text();
  const doc = new DOMParser().parseFromString(src, "text/xml");
  // Visual geoms do not affect dynamics (upstream strips them the same way).
  for (const g of [...doc.querySelectorAll('geom[class="visual"]')]) g.remove();
  const used = new Set([...doc.querySelectorAll("geom[mesh]")].map((g) => g.getAttribute("mesh")));
  for (const m of [...doc.querySelectorAll("asset > mesh")]) {
    const name = m.getAttribute("name") ?? m.getAttribute("file")!.replace(/\.stl$/i, "");
    if (!used.has(name)) m.remove();
  }
  const root = doc.documentElement;
  const world = doc.querySelector("worldbody")!;
  const actuator = doc.querySelector("actuator")!;
  const sensor = doc.querySelector("sensor")!;
  const robot = [...world.children].find((c) => c.tagName === "body" && c.getAttribute("name") === "trunk_base")!;
  const actuators = [...actuator.children];
  const sensors = [...sensor.children];
  robot.remove();
  actuators.forEach((a) => a.remove());
  sensors.forEach((s) => s.remove());
  // One copy of the robot per bot: every name in its tree gets the bot's prefix.
  const pose = new Map(JOINT_NAMES.map((n, i) => [n, DEFAULT_POSE[i]]));
  const qpos: string[] = [];
  for (const id of bots) {
    const p = `${id}_`;
    const copy = robot.cloneNode(true) as Element;
    for (const el of [copy, ...copy.querySelectorAll("[name]")]) el.setAttribute("name", p + el.getAttribute("name"));
    world.appendChild(copy);
    for (const a of actuators) {
      const c = a.cloneNode(true) as Element;
      c.setAttribute("name", p + c.getAttribute("name"));
      c.setAttribute("joint", p + c.getAttribute("joint"));
      actuator.appendChild(c);
    }
    for (const s of sensors) {
      const c = s.cloneNode(true) as Element;
      for (const attr of ["name", "site", "objname", "body"]) if (c.hasAttribute(attr)) c.setAttribute(attr, p + c.getAttribute(attr));
      sensor.appendChild(c);
    }
    const s = spawns[id];
    const joints = [...copy.querySelectorAll("joint")].map((j) => pose.get(j.getAttribute("name")!.slice(p.length)) ?? 0);
    qpos.push(`${s.px} ${s.py} 0.12 ${Math.cos(s.yaw / 2)} 0 0 ${Math.sin(s.yaw / 2)} ${joints.join(" ")}`);
  }
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  root.appendChild(el("option", { timestep: String(TIMESTEP) }));
  world.appendChild(el("geom", { name: "floor", type: "plane", size: "0 0 0.05", pos: "0 0 0" }));
  // The floor balance: a hinged beam with two carriages on slide joints.
  const apparatus = new DOMParser().parseFromString(`<root>${apparatusXml()}</root>`, "text/xml").documentElement;
  for (const node of [...apparatus.children]) {
    const imported = doc.importNode(node, true);
    if (imported.tagName === "contact") root.appendChild(imported);
    else world.appendChild(imported);
  }
  qpos.push(BALANCE.restQpos.join(" "));
  const kf = doc.createElement("keyframe");
  kf.appendChild(el("key", { name: "STAND", qpos: qpos.join(" "), ctrl: bots.map(() => Array.from(DEFAULT_POSE).join(" ")).join(" ") }));
  root.appendChild(kf);
  const meshFiles = [...doc.querySelectorAll("asset > mesh")].map((m) => m.getAttribute("file")!);
  return { xml: new XMLSerializer().serializeToString(doc), meshFiles };
}

/** One Microduck in the shared world: its addresses, observation and policy step. */
export class Duck {
  readonly lastAction = new Float32Array(NUM_JOINTS);
  readonly twist = new Float32Array(3);
  private readonly obs = new Float32Array(OBS_SIZE);
  private readonly cmd = new Float32Array(CMD_SIZE);
  private readonly headSmooth = new Float32Array(4);
  private readonly headTarget = new Float32Array(4);
  private readonly q = new Quaternion();
  private readonly g = new Vector3();
  readonly qposAdr: number[];
  readonly dofAdr: number[];
  readonly ctrlAdr: number[];
  readonly freeQ: number;
  readonly freeV: number;
  readonly gyroAdr: number;
  readonly trunkId: number;
  falls = 0;

  constructor(
    private readonly world: MicroduckWorld,
    readonly id: BotId,
  ) {
    const { mujoco, model } = world;
    const p = `${id}_`;
    this.qposAdr = JOINT_NAMES.map((n) => model.jnt(p + n).qposadr);
    this.dofAdr = JOINT_NAMES.map((n) => model.jnt(p + n).dofadr);
    this.ctrlAdr = JOINT_NAMES.map((n) => mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR.value, p + n));
    this.freeQ = model.jnt(`${p}trunk_base_freejoint`).qposadr;
    this.freeV = model.jnt(`${p}trunk_base_freejoint`).dofadr;
    this.gyroAdr = model.sensor(`${p}imu_ang_vel`).adr;
    this.trunkId = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY.value, `${p}trunk_base`);
  }

  /** Stand the duck up at (px, py) facing yaw, in its default pose, at rest. */
  place(px: number, py: number, yaw: number) {
    const { data } = this.world;
    const qpos = data.qpos,
      qvel = data.qvel,
      f = this.freeQ;
    qpos[f] = px;
    qpos[f + 1] = py;
    qpos[f + 2] = 0.12;
    qpos[f + 3] = Math.cos(yaw / 2);
    qpos[f + 4] = 0;
    qpos[f + 5] = 0;
    qpos[f + 6] = Math.sin(yaw / 2);
    for (let i = 0; i < 6; i++) qvel[this.freeV + i] = 0;
    for (let j = 0; j < NUM_JOINTS; j++) {
      qpos[this.qposAdr[j]] = DEFAULT_POSE[j];
      qvel[this.dofAdr[j]] = 0;
      data.ctrl[this.ctrlAdr[j]] = DEFAULT_POSE[j];
    }
    this.lastAction.fill(0);
    this.twist.fill(0);
    this.headSmooth.fill(0);
  }

  pose() {
    const q = this.world.data.qpos,
      f = this.freeQ;
    const yaw = Math.atan2(2 * (q[f + 3] * q[f + 6] + q[f + 4] * q[f + 5]), 1 - 2 * (q[f + 5] * q[f + 5] + q[f + 6] * q[f + 6]));
    return { px: q[f] as number, py: q[f + 1] as number, pz: q[f + 2] as number, yaw };
  }

  /** The twist the policy tracks, as [vx, wz], and head command slots [neck, pitch, yaw]. */
  command(vx: number, wz: number, head: readonly [number, number, number] = [0, 0, 0]) {
    this.twist[0] = vx;
    this.twist[2] = wz;
    this.headTarget[0] = head[0];
    this.headTarget[1] = head[1];
    this.headTarget[2] = head[2];
  }

  private buildObs() {
    const { data } = this.world;
    const qpos = data.qpos,
      qvel = data.qvel,
      sens = data.sensordata;
    const obs = this.obs;
    let i = 0;
    for (let a = 0; a < 3; a++) obs[i++] = sens[this.gyroAdr + a];
    const xq = data.body(this.trunkId).xquat; // [w, x, y, z]
    this.q.set(xq[1], xq[2], xq[3], xq[0]).conjugate();
    this.g.set(0, 0, -1).applyQuaternion(this.q);
    obs[i++] = this.g.x;
    obs[i++] = this.g.y;
    obs[i++] = this.g.z;
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qpos[this.qposAdr[j]] - DEFAULT_POSE[j];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qvel[this.dofAdr[j]];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = this.lastAction[j];
    for (let h = 0; h < 4; h++) this.headSmooth[h] += HEAD_ALPHA * (this.headTarget[h] - this.headSmooth[h]);
    this.cmd.fill(0);
    this.cmd[0] = this.twist[0];
    this.cmd[2] = this.twist[2];
    for (let h = 0; h < 4; h++) this.cmd[3 + h] = this.headSmooth[h];
    for (let c = 0; c < CMD_SIZE; c++) obs[i++] = this.cmd[c];
    return obs;
  }

  /** Run the policy once and write this duck's 14 position targets. */
  async act() {
    const { session, ort, data } = this.world;
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", this.buildObs(), [1, OBS_SIZE]) };
    const act = (await session.run(feeds))[session.outputNames[0]].data;
    for (let j = 0; j < NUM_JOINTS; j++) if (!Number.isFinite(act[j])) return;
    const ctrl = data.ctrl;
    for (let j = 0; j < NUM_JOINTS; j++) {
      this.lastAction[j] = act[j];
      ctrl[this.ctrlAdr[j]] = DEFAULT_POSE[j] + act[j] * ACTION_SCALE;
    }
  }

  /** Fell over (trunk low or tipped): stand it back up where it is. */
  recoverIfFallen() {
    const { px, py, pz, yaw } = this.pose();
    if (pz < 0.06 || this.g.z > -0.5 || !Number.isFinite(pz)) {
      this.falls++;
      this.place(px, py, yaw);
      return true;
    }
    return false;
  }
}

/** The floor balance in the shared world: beam lock, carriage brakes and readings. */
export class Balance {
  locked = true;
  /** Carriage brake targets (slide qpos, metres); null while a bot is pushing that carriage. */
  readonly brake: Record<Side, number | null> = { left: BALANCE.restQpos[1], right: BALANCE.restQpos[2] };
  private readonly hingeQ: number;
  private readonly hingeV: number;
  private readonly slideQ: Record<Side, number>;
  private readonly slideV: Record<Side, number>;
  private levelling = false;

  constructor(private readonly world: MicroduckWorld) {
    const { model } = world;
    this.hingeQ = model.jnt("beam_hinge").qposadr;
    this.hingeV = model.jnt("beam_hinge").dofadr;
    this.slideQ = { left: model.jnt("carriage_left_slide").qposadr, right: model.jnt("carriage_right_slide").qposadr };
    this.slideV = { left: model.jnt("carriage_left_slide").dofadr, right: model.jnt("carriage_right_slide").dofadr };
  }

  /** Carriage position along the beam, in lab centimetres from the pivot. */
  carriageCm(side: Side) {
    return Math.abs(this.world.data.qpos[this.slideQ[side]]) * BALANCE.cmPerMetre;
  }
  slide(side: Side) {
    return this.world.data.qpos[this.slideQ[side]] as number;
  }
  /** Beam angle in radians; positive lowers the right end. */
  angle() {
    return this.world.data.qpos[this.hingeQ] as number;
  }
  release() {
    // Weights are clamped where they stand before the beam is let go.
    for (const side of ["left", "right"] as const) this.brake[side] = this.slide(side);
    this.locked = false;
    this.levelling = false;
  }
  lock() {
    this.levelling = true;
  }
  /** Hold the brake target for a side (metres along the beam), or free it for a push. */
  setBrake(side: Side, x: number | null) {
    this.brake[side] = x;
  }

  /** Kinematic holds, applied before every substep: the lock pin and the carriage brakes. */
  hold() {
    const { qpos, qvel } = this.world.data;
    if (this.levelling) {
      // The pin drives the beam back to level at a steady rate (gravity keeps
      // pulling it the other way between substeps), then locks it.
      const a = qpos[this.hingeQ];
      qpos[this.hingeQ] = Math.abs(a) < 0.006 ? 0 : a - Math.sign(a) * 0.0008;
      qvel[this.hingeV] = 0;
      if (qpos[this.hingeQ] === 0) {
        this.levelling = false;
        this.locked = true;
      }
    } else if (this.locked) {
      qpos[this.hingeQ] = 0;
      qvel[this.hingeV] = 0;
    }
    for (const side of ["left", "right"] as const) {
      const b = this.brake[side];
      if (b === null) continue;
      const q = qpos[this.slideQ[side]];
      // Ease a carriage back to its notch rather than teleporting it.
      qpos[this.slideQ[side]] = Math.abs(q - b) < 0.0005 ? b : q + (b - q) * 0.25;
      qvel[this.slideV[side]] = 0;
    }
  }
}

export class MicroduckWorld {
  data: any;
  ducks!: Record<BotId, Duck>;
  balance!: Balance;
  private constructor(
    readonly mujoco: Mujoco,
    readonly ort: any,
    readonly model: any,
    readonly session: Session,
    readonly bots: readonly BotId[],
  ) {
    this.data = new mujoco.MjData(model);
  }

  static async boot(bots: readonly BotId[], spawns: Record<BotId, { px: number; py: number; yaw: number }>): Promise<MicroduckWorld> {
    const [{ default: loadMujoco }, ort] = await Promise.all([import("@mujoco/mujoco"), import("onnxruntime-web/wasm")]);
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    ort.env.wasm.numThreads = 1;
    const [mujoco, { xml, meshFiles }, session] = await Promise.all([
      (loadMujoco as (o: unknown) => Promise<Mujoco>)({ locateFile: (p: string) => (p.endsWith(".wasm") ? mujocoWasmUrl : p) }),
      buildPhysicsXml(bots, spawns),
      ort.InferenceSession.create(POLICY_URL, { executionProviders: ["wasm"] }) as Promise<Session>,
    ]);
    // Collision meshes come from the same GLB the renderer uses, rebuilt as STL.
    const geoms = await loadGlbGeometries();
    const vfs = new mujoco.MjVFS();
    for (const f of meshFiles) {
      const entry = geoms.get(f);
      if (!entry) throw new Error(`Microduck mesh missing from GLB: ${f}`);
      vfs.addBuffer(`assets/${f}`, new Uint8Array(geometryToBinaryStl(entry.welded)));
    }
    const model = mujoco.MjModel.from_xml_string(xml, vfs);
    const world = new MicroduckWorld(mujoco, ort, model, session, bots);
    world.ducks = Object.fromEntries(bots.map((id) => [id, new Duck(world, id)])) as Record<BotId, Duck>;
    world.balance = new Balance(world);
    world.reset();
    return world;
  }

  /** Everything back to the keyframe: ducks at their spawns, beam locked, carriages at rest. */
  reset() {
    const { mujoco, model, data } = this;
    mujoco.mj_resetDataKeyframe(model, data, mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY.value, "STAND"));
    for (const id of this.bots) {
      const p = this.ducks[id].pose();
      this.ducks[id].place(p.px, p.py, p.yaw);
    }
    this.balance.locked = true;
    this.balance.brake.left = BALANCE.restQpos[1];
    this.balance.brake.right = BALANCE.restQpos[2];
    mujoco.mj_forward(model, data);
  }

  /** One 50 Hz control step for every duck, then the shared physics substeps. */
  async step() {
    for (const id of this.bots) await this.ducks[id].act();
    for (let s = 0; s < DECIMATION; s++) {
      this.balance.hold();
      this.mujoco.mj_step(this.model, this.data);
    }
    for (const id of this.bots) this.ducks[id].recoverIfFallen();
  }

  /** The 50 Hz control loop, with upstream's catch-up guard; it always yields a task. */
  run(beforeStep: () => void) {
    let running = true;
    (async () => {
      let next = performance.now();
      while (running) {
        beforeStep();
        await this.step();
        next += TIMESTEP * DECIMATION * 1000;
        const wait = next - performance.now();
        if (wait <= 0) next = performance.now(); // fell behind: don't spiral
        await new Promise((r) => setTimeout(r, Math.max(0, wait)));
      }
    })();
    return () => {
      running = false;
    };
  }
}
