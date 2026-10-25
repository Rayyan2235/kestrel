import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAMERA_OFFSET } from "../simulation/constants";

// Leafy canopies after Bruno Simon's folio-2025 `World/Foliage.js` (MIT):
// a cluster is many alpha-cut leaf cards scattered through a sphere, every card
// turned toward the fixed camera, with normals bent 85% toward the sphere's
// own normal so the whole clump shades like one soft volume. The leaf texture
// and all code here are original; no Folio asset is used.

/** One cluster: 80 cards in a unit sphere, denser toward the surface. */
function clusterGeometry(seed: number) {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 80; i++) {
    const card = new THREE.PlaneGeometry(0.8, 0.8);
    const at = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(1 - Math.pow(random(), 3), Math.PI * random(), Math.PI * 2 * random()),
    );
    card.rotateZ(random() * Math.PI * 2);
    card.translate(at.x, at.y, at.z);
    const out = at.clone().normalize();
    const p = card.attributes.position!;
    const normals = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const n = new THREE.Vector3(p.getX(v), p.getY(v), p.getZ(v)).lerp(out, 0.85).normalize();
      normals.set([n.x, n.y, n.z], v * 3);
    }
    card.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    cards.push(card);
  }
  const merged = mergeGeometries(cards)!;
  cards.forEach((c) => c.dispose());
  return merged;
}

/** A clump of pointed leaves with soft falloff, alpha-cut in the material. */
function leafTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = "lighten";
  let s = 91;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 22; i++) {
    const x = 16 + random() * 96,
      y = 16 + random() * 96;
    g.save();
    g.translate(x, y);
    g.rotate(random() * Math.PI);
    g.scale(1, 0.5);
    const r = 11 + random() * 7;
    const leaf = g.createRadialGradient(0, 0, 0, 0, 0, r);
    leaf.addColorStop(0, "#fff");
    leaf.addColorStop(1, "#000");
    g.fillStyle = leaf;
    g.beginPath();
    // A lens shape: pointed at both ends like a real leaf.
    g.moveTo(-r, 0);
    g.quadraticCurveTo(0, -r, r, 0);
    g.quadraticCurveTo(0, r, -r, 0);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

export type Canopy = { at: [number, number, number]; radius: number; color: string };

/**
 * Every canopy in the scene as one instanced mesh, in MuJoCo coordinates.
 * Wind sways the cards a few millimetres; reduced motion holds them still.
 */
export function Foliage({ canopies, reducedMotion }: { canopies: Canopy[]; reducedMotion: boolean }) {
  const { mesh, material, geometry, texture, time } = useMemo(() => {
    const geometry = clusterGeometry(1234);
    const texture = leafTexture();
    const time = { value: 0 };
    const material = new THREE.MeshStandardMaterial({
      alphaMap: texture,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.85,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWind;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float phase = instanceMatrix[3].x * 3.1 + instanceMatrix[3].y * 2.3;
          transformed.x += sin(uWind * 1.7 + phase + position.y * 2.0) * 0.035;
          transformed.y += cos(uWind * 1.3 + phase + position.x * 2.0) * 0.025;`,
        );
    };
    // The fixed camera direction, expressed in MuJoCo axes (z up).
    const toward = new THREE.Vector3(CAMERA_OFFSET[0], -CAMERA_OFFSET[2], CAMERA_OFFSET[1]).normalize();
    const mesh = new THREE.InstancedMesh(geometry, material, canopies.length);
    const o = new THREE.Object3D();
    let s = 7;
    const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    canopies.forEach((c, i) => {
      const spin = Math.PI * 2 * random();
      o.up.set(Math.sin(spin), 0, Math.cos(spin));
      o.position.set(...c.at);
      o.lookAt(o.position.clone().add(toward));
      o.scale.setScalar(c.radius);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(c.color).offsetHSL(0, 0, (random() - 0.5) * 0.06));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, material, geometry, texture, time };
  }, [canopies]);
  useEffect(
    () => () => {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    [mesh, geometry, material, texture],
  );
  useFrame((_, dt) => {
    if (!reducedMotion) time.value += dt;
  });
  return <primitive object={mesh} />;
}

/** A bark-coloured map: vertical fissures over a warm brown. */
export function barkTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a6142";
  g.fillRect(0, 0, 64, 256);
  let s = 17;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = random() < 0.5 ? "rgba(60,38,24,.55)" : "rgba(170,130,95,.35)";
    g.lineWidth = 1 + random() * 2;
    const x = random() * 64;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 32) g.lineTo(x + (random() - 0.5) * 6, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Low-power stand-in for <Foliage>: one solid low-poly ball per canopy, a
 * single draw call with no alpha-cut cards. Software WebGL (headless CI,
 * GPU-less machines) rasterises every leaf card on the CPU, so the full
 * canopies there cost more than the rest of the scene together.
 */
export function SimpleCanopies({ canopies }: { canopies: Canopy[] }) {
  const mesh = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, canopies.length);
    const o = new THREE.Object3D();
    canopies.forEach((c, i) => {
      o.position.set(...c.at);
      o.scale.setScalar(c.radius);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(c.color));
    });
    return mesh;
  }, [canopies]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}
