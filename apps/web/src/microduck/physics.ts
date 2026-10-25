// Microduck physics for the lab: the upstream MuJoCo WASM model and trained ONNX
// walking policy (pollen-robotics/microduck-simulator @ ad9d41a, Apache-2.0),
// stepped exactly like its game.js control loop: 50 Hz policy, 4 × 5 ms
// physics substeps, 61-D observation, 14 position targets. Adapted for Kestrel:
// several ducks share one compiled model (one MjData each), and the arena,
// ball, props and terrain of the upstream playground are left out.
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { Quaternion, Vector3 } from "three";
import { BALANCE_FIXTURE } from "@kestrel/contracts";
import { geometryToBinaryStl, loadGlbGeometries, MODEL_DIR } from "../vendor/microduck/duck.js";
import {
  ACTION_SCALE,
  CMD_SIZE,
  DECIMATION,
  DEFAULT_POSE,
  JOINT_NAMES,
  NUM_JOINTS,
  OBS_SIZE,
  TIMESTEP,
  VEL_ANG,
  VEL_FWD,
} from "../vendor/microduck/constants.js";

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

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Steering law from upstream controls/waypoint.js (turn gain, cos falloff), with a
// tighter arrival radius because a docking spot is a point, not a click.
const TURN_GAIN = 2.2;
const ARRIVE = 0.025;
const NEAR = 0.07;
const PIVOT = 0.6;
const HEAD_ALPHA = 0.2;

type Mujoco = any; // official @mujoco/mujoco embind module
type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>> };

async function buildPhysicsXml() {
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
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const world = doc.querySelector("worldbody")!;
  root.appendChild(el("option", { timestep: String(TIMESTEP) }));
  world.appendChild(el("geom", { name: "floor", type: "plane", size: "0 0 0.05", pos: "0 0 0" }));
  // The bench as a static collider, so a duck cannot walk through the apparatus.
  const s = BALANCE_FIXTURE.station;
  const c = toPhysicsXY(s.position[0], s.position[2]);
  world.appendChild(
    el("geom", {
      name: "bench",
      type: "box",
      pos: `${c.px} ${c.py} ${s.topY / 2 / SCALE}`,
      size: `${s.footprint[0] / 2 / SCALE} ${s.footprint[1] / 2 / SCALE} ${s.topY / 2 / SCALE}`,
    }),
  );
  const pose = new Map(JOINT_NAMES.map((n, i) => [n, DEFAULT_POSE[i]]));
  const joints = [...doc.querySelectorAll("body > joint")].map((j) => pose.get(j.getAttribute("name")!) ?? 0).join(" ");
  const kf = doc.createElement("keyframe");
  kf.appendChild(el("key", { name: "STAND", qpos: `0 0 0.12 1 0 0 0 ${joints}`, ctrl: Array.from(DEFAULT_POSE).join(" ") }));
  root.appendChild(kf);
  const meshFiles = [...doc.querySelectorAll("asset > mesh")].map((m) => m.getAttribute("file")!);
  return { xml: new XMLSerializer().serializeToString(doc), meshFiles };
}

export type DuckTarget = { px: number; py: number; yaw: number; head: { neck: number; pitch: number; yaw: number } };

export class Duck {
  readonly data: any;
  readonly lastAction = new Float32Array(NUM_JOINTS);
  private readonly obs = new Float32Array(OBS_SIZE);
  private readonly cmd = new Float32Array(CMD_SIZE);
  readonly twist = new Float32Array(3);
  private readonly headSmooth = new Float32Array(4);
  private readonly q = new Quaternion();
  private readonly g = new Vector3();
  falls = 0;

  constructor(private readonly world: MicroduckWorld) {
    this.data = new world.mujoco.MjData(world.model);
  }

  reset(px: number, py: number, yaw: number) {
    const { mujoco, model, keyId } = this.world;
    mujoco.mj_resetDataKeyframe(model, this.data, keyId);
    const qpos = this.data.qpos;
    qpos[0] = px;
    qpos[1] = py;
    qpos[2] = 0.12;
    qpos[3] = Math.cos(yaw / 2);
    qpos[4] = 0;
    qpos[5] = 0;
    qpos[6] = Math.sin(yaw / 2);
    mujoco.mj_forward(model, this.data);
    this.lastAction.fill(0);
    this.twist.fill(0);
    this.headSmooth.fill(0);
  }

  pose() {
    const q = this.data.qpos;
    const yaw = Math.atan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] * q[5] + q[6] * q[6]));
    return { px: q[0] as number, py: q[1] as number, pz: q[2] as number, yaw };
  }

  /**
   * Twist toward the target, given the way upstream's keyboard gives it: full
   * forward speed and full turn rate. The walking policy ignores small commands
   * (a training deadband), so proportional crawling would stall. Pivot when the
   * heading is far off, walk with a steering correction otherwise, and give a
   * short forward nudge if the body has not moved for a second.
   */
  steer(target: DuckTarget) {
    const { px, py, yaw } = this.pose();
    const dx = target.px - px,
      dy = target.py - py,
      dist = Math.hypot(dx, dy);
    let vx = 0,
      wz = 0;
    if (dist > ARRIVE) {
      const err = wrap(Math.atan2(dy, dx) - yaw);
      // Close to the goal a small overshoot means a large bearing error: line up first.
      if (Math.abs(err) > (dist < NEAR ? PIVOT / 2 : PIVOT)) wz = Math.sign(err) * VEL_ANG;
      else {
        vx = VEL_FWD;
        wz = clamp(err * TURN_GAIN, -VEL_ANG, VEL_ANG);
      }
    } else {
      const err = wrap(target.yaw - yaw);
      if (Math.abs(err) > 0.2) wz = Math.sign(err) * VEL_ANG;
    }
    // Stall guard: a commanded body that has not moved gets a brief forward step.
    const moving = vx !== 0 || wz !== 0;
    const travelled = Math.hypot(px - this.anchor.px, py - this.anchor.py) + Math.abs(wrap(yaw - this.anchor.yaw)) * 0.05;
    if (!moving || travelled > 0.005) {
      this.anchor = { px, py, yaw };
      this.stalled = 0;
    } else if (++this.stalled > 50) {
      this.nudge = 20;
      this.stalled = 0;
    }
    if (this.nudge > 0) {
      this.nudge--;
      vx = VEL_FWD;
    }
    this.twist[0] = vx;
    this.twist[2] = wz;
    const head = [target.head.neck, target.head.pitch, target.head.yaw, 0];
    for (let h = 0; h < 4; h++) this.headSmooth[h] += HEAD_ALPHA * (head[h] - this.headSmooth[h]);
  }
  private anchor = { px: 0, py: 0, yaw: 0 };
  private stalled = 0;
  private nudge = 0;

  private buildObs() {
    const { qposAdr, dofAdr, gyroAdr, trunkId } = this.world;
    const qpos = this.data.qpos,
      qvel = this.data.qvel,
      sens = this.data.sensordata;
    const obs = this.obs;
    let i = 0;
    for (let a = 0; a < 3; a++) obs[i++] = sens[gyroAdr + a];
    const xq = this.data.body(trunkId).xquat; // [w, x, y, z]
    this.q.set(xq[1], xq[2], xq[3], xq[0]).conjugate();
    this.g.set(0, 0, -1).applyQuaternion(this.q);
    obs[i++] = this.g.x;
    obs[i++] = this.g.y;
    obs[i++] = this.g.z;
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qpos[qposAdr[j]] - DEFAULT_POSE[j];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = qvel[dofAdr[j]];
    for (let j = 0; j < NUM_JOINTS; j++) obs[i++] = this.lastAction[j];
    this.cmd.fill(0);
    this.cmd[0] = this.twist[0];
    this.cmd[2] = this.twist[2];
    for (let h = 0; h < 4; h++) this.cmd[3 + h] = this.headSmooth[h];
    for (let c = 0; c < CMD_SIZE; c++) obs[i++] = this.cmd[c];
    return obs;
  }

  async step() {
    const { mujoco, model, session, ort } = this.world;
    const feeds = { [session.inputNames[0]]: new ort.Tensor("float32", this.buildObs(), [1, OBS_SIZE]) };
    const out = await session.run(feeds);
    const act = out[session.outputNames[0]].data;
    let finite = true;
    for (let j = 0; j < NUM_JOINTS; j++) if (!Number.isFinite(act[j])) finite = false;
    if (finite) {
      const ctrl = this.data.ctrl;
      for (let j = 0; j < NUM_JOINTS; j++) {
        this.lastAction[j] = act[j];
        ctrl[j] = DEFAULT_POSE[j] + act[j] * ACTION_SCALE;
      }
    }
    for (let s = 0; s < DECIMATION; s++) mujoco.mj_step(model, this.data);
    // Fell over (trunk low or tipped): stand it back up where it is.
    const { px, py, pz, yaw } = this.pose();
    if (pz < 0.06 || this.g.z > -0.5 || !Number.isFinite(pz)) {
      this.falls++;
      this.reset(px, py, yaw);
    }
  }
}

export class MicroduckWorld {
  private constructor(
    readonly mujoco: Mujoco,
    readonly ort: any,
    readonly model: any,
    readonly session: Session,
    readonly keyId: number,
    readonly qposAdr: number[],
    readonly dofAdr: number[],
    readonly gyroAdr: number,
    readonly trunkId: number,
  ) {}

  static async boot(): Promise<MicroduckWorld> {
    const [{ default: loadMujoco }, ort] = await Promise.all([import("@mujoco/mujoco"), import("onnxruntime-web/wasm")]);
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    ort.env.wasm.numThreads = 1;
    const [mujoco, { xml, meshFiles }, session] = await Promise.all([
      (loadMujoco as (o: unknown) => Promise<Mujoco>)({ locateFile: (p: string) => (p.endsWith(".wasm") ? mujocoWasmUrl : p) }),
      buildPhysicsXml(),
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
    const body = mujoco.mjtObj.mjOBJ_BODY.value,
      key = mujoco.mjtObj.mjOBJ_KEY.value;
    return new MicroduckWorld(
      mujoco,
      ort,
      model,
      session,
      mujoco.mj_name2id(model, key, "STAND"),
      JOINT_NAMES.map((n) => model.jnt(n).qposadr),
      JOINT_NAMES.map((n) => model.jnt(n).dofadr),
      model.sensor("imu_ang_vel").adr,
      mujoco.mj_name2id(model, body, "trunk_base"),
    );
  }

  createDuck() {
    return new Duck(this);
  }

  /** The 50 Hz control loop for every duck, with upstream's catch-up guard. */
  run(ducks: () => Duck[], beforeStep: () => void) {
    let running = true;
    (async () => {
      let next = performance.now();
      while (running) {
        beforeStep();
        for (const duck of ducks()) await duck.step();
        next += TIMESTEP * DECIMATION * 1000;
        const wait = next - performance.now();
        if (wait <= 0) next = performance.now(); // fell behind: don't spiral
        // Always yield a task, so a slow frame never starves input or paint.
        await new Promise((r) => setTimeout(r, Math.max(0, wait)));
      }
    })();
    return () => {
      running = false;
    };
  }
}
