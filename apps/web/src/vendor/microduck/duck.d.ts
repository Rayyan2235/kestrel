// Types for the vendored upstream duck.js (Apache-2.0).
import type { BufferGeometry, Group, Object3D, Quaternion, Vector3 } from "three";
export const MODEL_DIR: string;
export type Kinematics = { bodies: { name: string; joint?: { name: string; type?: string } }[]; mesh_dir: string };
export type Rig = {
  placer: Group;
  root: Group;
  bodies: Map<string, Group>;
  joints: Map<string, { body: Object3D; axis: Vector3; baseQuat: Quaternion; range: [number, number] | null }>;
};
export function loadKinematics(url: string): Promise<Kinematics>;
export function loadGlbGeometries(): Promise<Map<string, { display: BufferGeometry; welded: BufferGeometry }>>;
export function geometryToBinaryStl(geometry: BufferGeometry): ArrayBuffer;
export function buildRig(k: Kinematics, opts?: { materialForMesh?: unknown }): Promise<Rig>;
export function setJoint(rig: Rig, name: string, angle: number): void;
