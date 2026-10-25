import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCREEN_DIRS } from "../simulation/constants";

// Lawn blades after folio-2025 `World/Grass.js` (MIT): one triangle per blade
// on a jittered grid, turned to face the camera, with an up-facing normal so a
// blade shades like the ground it grows from and only its tip moves in the wind.
// Ours is plain WebGL: blades are built once on the CPU (the camera angle is
// fixed) and drawn in a single call. Code is original.

type Rect = [number, number, number, number];

/** Where no grass may grow: the court with its border, and sand or mats. */
function blocked(x: number, y: number, keepOut: Rect[]) {
  return keepOut.some(([cx, cy, hx, hy]) => Math.abs(x - cx) < hx && Math.abs(y - cy) < hy);
}

export function Grass({
  radius,
  keepOut,
  reducedMotion,
}: {
  radius: number;
  keepOut: Rect[];
  reducedMotion: boolean;
}) {
  const { mesh, time } = useMemo(() => {
    const spacing = window.innerWidth < 900 ? 0.034 : 0.024;
    let s = 2025;
    const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const [rx, ry] = SCREEN_DIRS.right;
    const [fx, fy] = SCREEN_DIRS.forward;
    const positions: number[] = [];
    const colors: number[] = [];
    const tips: number[] = [];
    const base = new THREE.Color("#3f7f34");
    const tip = new THREE.Color("#a8d872");
    const c = new THREE.Color();
    for (let gx = -radius; gx <= radius; gx += spacing)
      for (let gy = -radius; gy <= radius; gy += spacing) {
        const x = gx + (random() - 0.5) * spacing;
        const y = gy + (random() - 0.5) * spacing;
        if (Math.hypot(x, y) > radius - 0.05 || blocked(x, y, keepOut)) continue;
        const h = 0.025 + random() * 0.035;
        const w = 0.005 + random() * 0.003;
        const lean = (random() - 0.5) * 0.02;
        const z = -0.021;
        positions.push(
          x - rx * w, y - ry * w, z,
          x + rx * w, y + ry * w, z,
          x + rx * lean + fx * lean, y + ry * lean + fy * lean, z + h,
        );
        const shade = 0.85 + random() * 0.3;
        c.copy(base).multiplyScalar(shade);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        c.copy(tip).offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.1);
        colors.push(c.r, c.g, c.b);
        tips.push(0, 0, 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("tip", new THREE.Float32BufferAttribute(tips, 1));
    const normals = new Float32Array(positions.length);
    for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    const time = { value: 0 };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWind;\nattribute float tip;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float gust = sin(uWind * 1.6 + position.x * 3.0 + position.y * 2.0) + 0.5 * sin(uWind * 2.7 + position.y * 5.0);
          transformed.xy += tip * gust * vec2(0.004, 0.003);`,
        );
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return { mesh, time };
  }, [radius, keepOut]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  useFrame((_, dt) => {
    if (!reducedMotion) time.value += dt;
  });
  return <primitive object={mesh} />;
}
