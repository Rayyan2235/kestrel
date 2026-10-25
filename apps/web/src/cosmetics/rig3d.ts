import * as THREE from "three";
import type { BotLook } from "@kestrel/contracts";
import type { DuckRig } from "../simulation/rig";
import { itemById } from "./catalog.js";

/**
 * Workshop looks on the real 3D robots. Render-only: it recolours the shell
 * material and parents small procedural props to the head and trunk visual
 * nodes. It never touches the MJCF, physics, joints or the policy.
 */
export type RigDressing = {
  shells: THREE.MeshStandardMaterial[];
  baseColor: string;
  head: THREE.Object3D | null;
  trunk: THREE.Object3D;
  /** Head top and trunk back, in each node's local frame, plus a size scale. */
  headTop: THREE.Vector3;
  backPoint: THREE.Vector3;
  size: number;
  headUp: THREE.Quaternion;
  trunkUp: THREE.Quaternion;
};

const HEAD_NODES = ["bearing_roll", "head_roll", "jaw_soft", "head_yaw"];
const ACCESSORY = "kestrel-accessory";

/** Measures the rig once, before it is posed, so props sit on the head and back. */
export function dressingFor(rig: DuckRig, baseColor: string): RigDressing {
  rig.placer.updateMatrixWorld(true);
  const base = new THREE.Color(baseColor);
  const shells = new Set<THREE.MeshStandardMaterial>();
  rig.placer.traverse((o) => {
    const m = (o as THREE.Mesh).material as
      THREE.MeshStandardMaterial | undefined;
    if (m && "color" in m && m.color.equals(base)) shells.add(m);
  });
  const head =
    HEAD_NODES.map((n) => rig.placer.getObjectByName(n)).find(Boolean) ?? null;
  const box = new THREE.Box3().setFromObject(head ?? rig.trunk);
  // Measured in the placer's frame, which is three.js +Y up (the rig root turns MuJoCo +Z up).
  const top = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.max.y,
    (box.min.z + box.max.z) / 2,
  );
  const body = new THREE.Box3().setFromObject(rig.trunk);
  const back = new THREE.Vector3(
    body.min.x,
    (body.min.y + body.max.y) / 2,
    (body.min.z + body.max.z) / 2,
  );
  const size = Math.max(0.01, box.max.y - box.min.y);
  // Props are modelled +Y up, like the placer frame: undo each node's own rotation.
  const local = (node: THREE.Object3D) =>
    node.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    shells: [...shells],
    baseColor,
    head,
    trunk: rig.trunk,
    headTop: head
      ? head.worldToLocal(top.clone())
      : rig.trunk.worldToLocal(top.clone()),
    backPoint: rig.trunk.worldToLocal(back),
    size,
    headUp: local(head ?? rig.trunk),
    trunkUp: local(rig.trunk),
  };
}

const mat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

function antenna(size: number, color: string): THREE.Object3D {
  const g = new THREE.Group();
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.04, size * 0.04, size * 0.6, 8),
    mat("#2b2b30"),
  );
  stalk.position.y = size * 0.3;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.12, 12, 8),
    mat(color),
  );
  ball.position.y = size * 0.65;
  g.add(stalk, ball);
  return g;
}

function partyHat(size: number, color: string): THREE.Object3D {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.28, size * 0.6, 16),
    mat(color),
  );
  cone.position.y = size * 0.3;
  return cone;
}

function backpack(size: number, color: string): THREE.Object3D {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.35, size * 0.55, size * 0.6),
    mat(color),
  );
  box.position.x = -size * 0.18;
  return box;
}

/** Applies a look to one rig: shell colour, head prop, back prop. Idempotent. */
export function applyLook(d: RigDressing, look: BotLook): void {
  const shell = itemById(look.shell)?.color ?? d.baseColor;
  for (const m of d.shells) m.color.set(shell);
  for (const node of [d.head, d.trunk]) {
    for (const old of node?.children.filter((c) =>
      c.name.startsWith(ACCESSORY),
    ) ?? []) {
      node!.remove(old);
    }
  }
  const accent = itemById(look.accent)?.color ?? "#f59e0b";
  const hat =
    look.head === "antenna"
      ? antenna(d.size, accent)
      : look.head === "partyhat"
        ? partyHat(d.size, accent)
        : null;
  if (hat) {
    hat.name = `${ACCESSORY}-${look.head}`;
    hat.position.add(d.headTop);
    hat.quaternion.copy(d.headUp);
    (d.head ?? d.trunk).add(hat);
  }
  if (look.back === "backpack") {
    const pack = backpack(d.size, accent);
    pack.name = `${ACCESSORY}-backpack`;
    pack.position.add(d.backPoint);
    pack.quaternion.copy(d.trunkUp);
    d.trunk.add(pack);
  }
}

/** What a rig shows, for the browser test hook. */
export const describeLook = (d: RigDressing) => {
  const nodes: string[] = [];
  for (const node of [d.head, d.trunk])
    for (const c of node?.children ?? [])
      if (c.name.startsWith(ACCESSORY))
        nodes.push(c.name.slice(ACCESSORY.length + 1));
  return { shell: `#${d.shells[0]?.color.getHexString() ?? ""}`, nodes };
};
