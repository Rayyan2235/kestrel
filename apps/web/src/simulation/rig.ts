import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { JOINT_NAMES, ROBOT_DIR } from "./constants";

// Render rig built from kinematics.json (the MJCF body tree) and the
// microduck GLB. Physics never reads it: joints are posed from MuJoCo qpos
// every frame. Port of microduck-simulator's duck.js (Apache-2.0).

type KinBody = {
  name: string;
  parent: string | null;
  pos: [number, number, number];
  quat: [number, number, number, number];
  joint?: { name: string; type?: string; axis: [number, number, number]; range?: [number, number] };
  geoms: { type?: string; mesh?: string; pos?: number[]; quat?: number[]; color?: number[] }[];
};

export type DuckRig = {
  placer: THREE.Group;
  trunk: THREE.Group;
  joints: Map<string, { body: THREE.Object3D; axis: THREE.Vector3; base: THREE.Quaternion; range: [number, number] | null }>;
};

/** Shell meshes recoloured per bot, so each companion keeps an identity colour. */
const SHELLS = new Set(["left_shell.stl", "right_shell.stl", "top_head_shell.stl"]);

let geometries: Promise<Map<string, THREE.BufferGeometry>> | null = null;
let kinematics: Promise<KinBody[]> | null = null;

function loadGeometries() {
  geometries ??= new GLTFLoader().loadAsync(`${ROBOT_DIR}/microduck.glb`).then((gltf) => {
    const map = new Map<string, THREE.BufferGeometry>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (o.userData.meshFile as string) || o.name || mesh.geometry.name;
      if (!name || map.has(name)) return;
      // Creased normals on a millimetre grid, as upstream does.
      const g = mesh.geometry.clone();
      g.deleteAttribute("normal");
      g.scale(1000, 1000, 1000);
      const display = toCreasedNormals(g, Math.PI / 5);
      display.scale(1e-3, 1e-3, 1e-3);
      map.set(name, display);
      if (o.name && o.name !== name) map.set(o.name, display);
    });
    return map;
  });
  return geometries;
}

function loadKinematics() {
  kinematics ??= fetch(`${ROBOT_DIR}/kinematics.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Robot kinematics failed to load (${r.status}).`);
      return r.json();
    })
    .then((k: { bodies: KinBody[] }) => k.bodies);
  return kinematics;
}

export async function buildDuckRig(tint?: string): Promise<DuckRig> {
  const [bodiesSpec, geoms] = await Promise.all([loadKinematics(), loadGeometries()]);
  const placer = new THREE.Group();
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2; // MuJoCo +z up → three.js +y up
  placer.add(root);

  const bodies = new Map<string, THREE.Group>();
  for (const b of bodiesSpec) {
    const g = new THREE.Group();
    g.name = b.name;
    g.position.set(...b.pos);
    g.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
    bodies.set(b.name, g);
  }
  for (const b of bodiesSpec) {
    const g = bodies.get(b.name)!;
    (b.parent && bodies.get(b.parent) ? bodies.get(b.parent)! : root).add(g);
  }

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (rgb: number[]) => {
    const key = rgb.map((v) => v.toFixed(3)).join(",");
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), roughness: 0.55 });
      materials.set(key, m);
    }
    return m;
  };
  const tinted = tint ? new THREE.MeshStandardMaterial({ color: tint, roughness: 0.5 }) : null;

  const seen = new Set<string>();
  for (const b of bodiesSpec) {
    const g = bodies.get(b.name)!;
    for (const geom of b.geoms) {
      if ((geom.type && geom.type !== "mesh") || !geom.mesh) continue;
      const key = `${b.name}|${geom.mesh}|${geom.pos}|${geom.quat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const geometry = geoms.get(geom.mesh);
      if (!geometry) continue;
      const rgb = geom.color ?? [0.85, 0.85, 0.85];
      const mesh = new THREE.Mesh(geometry, tinted && SHELLS.has(geom.mesh) ? tinted : material(rgb));
      mesh.castShadow = true;
      if (geom.pos) mesh.position.set(geom.pos[0]!, geom.pos[1]!, geom.pos[2]!);
      if (geom.quat) mesh.quaternion.set(geom.quat[1]!, geom.quat[2]!, geom.quat[3]!, geom.quat[0]!);
      g.add(mesh);
    }
  }

  const joints: DuckRig["joints"] = new Map();
  for (const b of bodiesSpec) {
    if (!b.joint || (b.joint.type && b.joint.type !== "hinge")) continue;
    const g = bodies.get(b.name)!;
    joints.set(b.joint.name, {
      body: g,
      axis: new THREE.Vector3(...b.joint.axis).normalize(),
      base: g.quaternion.clone(),
      range: b.joint.range ?? null,
    });
  }
  return { placer, trunk: bodies.get("trunk_base")!, joints };
}

const _q = new THREE.Quaternion();
/** Pose the rig from MuJoCo trunk position, [w, x, y, z] quaternion and joint angles. */
export function poseDuckRig(
  rig: DuckRig,
  pos: ArrayLike<number>,
  quat: ArrayLike<number>,
  angles: ArrayLike<number>,
) {
  rig.trunk.position.set(pos[0]!, pos[1]!, pos[2]!);
  rig.trunk.quaternion.set(quat[1]!, quat[2]!, quat[3]!, quat[0]!);
  for (let j = 0; j < JOINT_NAMES.length; j++) {
    const joint = rig.joints.get(JOINT_NAMES[j]!);
    if (!joint) continue;
    let a = angles[j]!;
    if (joint.range) a = Math.min(joint.range[1], Math.max(joint.range[0], a));
    joint.body.quaternion.copy(joint.base).multiply(_q.setFromAxisAngle(joint.axis, a));
  }
}
