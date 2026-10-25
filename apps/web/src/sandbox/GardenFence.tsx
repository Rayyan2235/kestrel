import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ROOM_HALF } from "../simulation/constants";
import { Foliage, type Canopy } from "./Foliage";

// A storybook garden fence on MuJoCo's boundary wall: scalloped cream pickets,
// two rails, ball-capped posts, climbing roses on the far sides and a flower
// bed outside. Every inner face sits on the collider line (|x|, |y| = ROOM_HALF),
// so the fence shows exactly where the robots stop. All parts are instanced.

const CREAM = "#fff6e8";
const SEGMENTS = 8;
const POST = 0.035;
const PICKETS = 8;
const PICKET_W = 0.026;
const PICKET_T = 0.008;
const GROUND = -0.02;

type Side = { start: [number, number]; along: [number, number]; far: boolean };
const H = ROOM_HALF;
// Walking anticlockwise keeps `along × up` pointing out of the court on every side.
const SIDES: Side[] = [
  { start: [H, -H], along: [0, 1], far: false },
  { start: [H, H], along: [-1, 0], far: true },
  { start: [-H, H], along: [0, -1], far: true },
  { start: [-H, -H], along: [1, 0], far: false },
];

/** Picket with a pointed top, one unit tall; height comes from instance scale. */
function picketGeometry() {
  const s = new THREE.Shape();
  const w = PICKET_W / 2;
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, 0.88);
  s.quadraticCurveTo(w, 0.95, 0, 1);
  s.quadraticCurveTo(-w, 0.95, -w, 0.88);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: PICKET_T, bevelEnabled: false, curveSegments: 4 });
}

export function GardenFence({ reducedMotion }: { reducedMotion: boolean }) {
  const { meshes, roses, dispose } = useMemo(() => {
    const up = new THREE.Vector3(0, 0, 1);
    const m = new THREE.Matrix4();
    const basis = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    const seg = (2 * H) / SEGMENTS;
    const pickets: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    const blooms: { at: THREE.Vector3; r: number; color: string }[] = [];
    const roses: Canopy[] = [];
    let seed = 88;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const side of SIDES) {
      const along = new THREE.Vector3(side.along[0], side.along[1], 0);
      const out = new THREE.Vector3().crossVectors(along, up);
      basis.makeBasis(along, up, out);
      const at = (d: number, outward: number, z: number) =>
        new THREE.Vector3(side.start[0], side.start[1], z).addScaledVector(along, d).addScaledVector(out, outward);
      for (let k = 0; k < SEGMENTS; k++) {
        const d0 = k * seg;
        // Post at the start of each segment (the next side supplies the last corner).
        const corner = k === 0;
        const tall = corner ? 0.34 : 0.3;
        posts.push(m.clone().makeTranslation(at(d0, POST / 2, GROUND + tall / 2)).multiply(basis).multiply(scale.makeScale(POST, tall, POST)));
        caps.push(new THREE.Matrix4().makeTranslation(at(d0, POST / 2, GROUND + tall + 0.012)).multiply(scale.makeScale(...(corner ? [0.028, 0.028, 0.028] : [0.021, 0.021, 0.021]) as [number, number, number])));
        // Scalloped pickets: tall beside each post, dipping in the middle.
        for (let j = 0; j < PICKETS; j++) {
          const t = (j + 0.5) / PICKETS;
          const height = 0.25 + 0.05 * (1 - Math.sin(Math.PI * t));
          const d = d0 + POST / 2 + PICKET_W / 2 + 0.012 + j * ((seg - POST - PICKET_W - 0.024) / (PICKETS - 1));
          pickets.push(new THREE.Matrix4().makeTranslation(at(d, 0, GROUND)).multiply(basis).multiply(scale.makeScale(1, height, 1)));
        }
        for (const z of [0.06, 0.18]) {
          rails.push(new THREE.Matrix4().makeTranslation(at(d0 + seg / 2, PICKET_T + 0.006, z)).multiply(basis).multiply(scale.makeScale(seg - POST, 0.018, 0.012)));
        }
        // Climbing roses on alternate far-side posts, and a flower bed all round.
        if (side.far && k % 2 === 1) {
          const p = at(d0, POST + 0.03, 0);
          roses.push({ at: [p.x, p.y, 0.16], radius: 0.07, color: "#4a8a3c" }, { at: [p.x, p.y, 0.27], radius: 0.055, color: "#5a9a44" });
          for (let r = 0; r < 7; r++)
            blooms.push({ at: at(d0 + (random() - 0.5) * 0.09, POST + 0.03 + (random() - 0.3) * 0.06, 0.1 + random() * 0.22), r: 0.011 + random() * 0.007, color: random() < 0.6 ? "#f48fb1" : "#e2557a" });
        }
        for (let f = 0; f < 4; f++)
          blooms.push({
            at: at(d0 + random() * seg, 0.07 + random() * 0.05, GROUND + 0.02 + random() * 0.015),
            r: 0.008 + random() * 0.005,
            color: ["#f48fb1", "#ffd166", "#ffffff", "#f2735a"][Math.floor(random() * 4)]!,
          });
      }
    }
    const wood = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.55 });
    const bloomMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    const geometries = { picket: picketGeometry(), box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(1, 14, 10) };
    const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((x, i) => mesh.setMatrixAt(i, x));
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    };
    const flowers = instanced(
      geometries.ball,
      bloomMaterial,
      blooms.map((b) => new THREE.Matrix4().makeTranslation(b.at).multiply(new THREE.Matrix4().makeScale(b.r, b.r, b.r))),
    );
    blooms.forEach((b, i) => flowers.setColorAt(i, new THREE.Color(b.color)));
    flowers.castShadow = false;
    const meshes = [
      instanced(geometries.picket, wood, pickets),
      instanced(geometries.box, wood, rails),
      instanced(geometries.box, wood, posts),
      instanced(geometries.ball, wood, caps),
      flowers,
    ];
    return {
      meshes,
      roses,
      dispose: () => {
        meshes.forEach((x) => x.dispose());
        Object.values(geometries).forEach((g) => g.dispose());
        wood.dispose();
        bloomMaterial.dispose();
      },
    };
  }, []);
  useEffect(() => dispose, [dispose]);
  return (
    <group>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      <Foliage canopies={roses} reducedMotion={reducedMotion} />
    </group>
  );
}
