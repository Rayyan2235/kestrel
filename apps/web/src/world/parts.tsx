import { useMemo, type ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type MeshProps = Omit<ThreeElements["mesh"], "args">;
const geometryCache = new Map<string, RoundedBoxGeometry>();

function roundedBox(w: number, h: number, d: number, r: number) {
  const key = `${w}:${h}:${d}:${r}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
    geometryCache.set(key, geometry);
  }
  return geometry;
}

/** A softly rounded box: the room's basic building block. */
export function RBox({
  size,
  radius = 0.02,
  color,
  roughness = 0.6,
  metalness = 0,
  emissive,
  children,
  ...props
}: MeshProps & {
  size: [number, number, number];
  radius?: number;
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  children?: ReactNode;
}) {
  const geometry = useMemo(
    () => roundedBox(size[0], size[1], size[2], radius),
    [size[0], size[1], size[2], radius],
  );
  return (
    <mesh geometry={geometry} castShadow receiveShadow {...props}>
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.9 : 0}
      />
      {children}
    </mesh>
  );
}

export function Mat({
  color,
  roughness = 0.6,
  metalness = 0,
  transparent,
  opacity,
  emissive,
  emissiveIntensity,
}: {
  color: string;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      transparent={transparent}
      opacity={opacity}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={emissive ? (emissiveIntensity ?? 1) : 0}
    />
  );
}
