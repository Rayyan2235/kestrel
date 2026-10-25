import { useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { palette } from "./palette";

const RADIUS = 6.5;

function groundTexture() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = palette.ground;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = palette.groundLine;
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(size / 2, 0);
  g.lineTo(size / 2, size);
  g.moveTo(0, size / 2);
  g.lineTo(size, size / 2);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(RADIUS, RADIUS);
  t.anisotropy = 8;
  return t;
}

/** An open lab floor: one soft plate, no walls, so the apparatus and crew read first. */
export function Room() {
  const grid = useMemo(groundTexture, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[RADIUS, 96]} />
        <meshStandardMaterial map={grid} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.09, 0]} receiveShadow>
        <cylinderGeometry args={[RADIUS, RADIUS - 0.05, 0.18, 96]} />
        <meshStandardMaterial color={palette.groundEdge} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.19, 0]}>
        <cylinderGeometry args={[RADIUS - 0.05, RADIUS - 0.3, 0.04, 96]} />
        <meshStandardMaterial color={palette.noirSoft} roughness={0.6} />
      </mesh>
    </group>
  );
}
