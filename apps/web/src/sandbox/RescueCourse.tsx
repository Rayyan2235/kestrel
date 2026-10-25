import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  rescuePoints,
  RESCUE,
  RESCUE_EDGES,
  type RescueBeacon,
  type RescueRoute,
} from "@kestrel/contracts";
function Marker({
  at,
  label,
  color,
}: {
  at: [number, number];
  label: string;
  color: string;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = color;
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = "bold 164px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 128, 136);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [label, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[...at, 0.004]}>
      <mesh>
        <ringGeometry args={[0.1, 0.12, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.23, 0.23]} />
        <meshBasicMaterial map={texture} transparent />
      </mesh>
    </group>
  );
}
export function RescueCourse({ route }: { route: RescueRoute | null }) {
  const points = route ? rescuePoints(route) : [];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {RESCUE_EDGES.map(([from, to]) => {
        const a = RESCUE.beacons[from].at,
          b = RESCUE.beacons[to].at;
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          angle = Math.atan2(dy, dx);
        return (
          <group key={from + to}>
            <mesh
              position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.001]}
              rotation={[0, 0, angle]}
            >
              <planeGeometry args={[Math.hypot(dx, dy), 0.09]} />
              <meshBasicMaterial color="#b0bfc0" />
            </mesh>
            <mesh
              position={[a[0] + dx * 0.58, a[1] + dy * 0.58, 0.002]}
              rotation={[0, 0, angle]}
            >
              <circleGeometry args={[0.065, 3]} />
              <meshBasicMaterial color="#405961" />
            </mesh>
          </group>
        );
      })}
      {points.slice(1).map((p, i) => {
        const a = points[i]!,
          dx = p[0] - a[0],
          dy = p[1] - a[1];
        return (
          <mesh
            key={i}
            position={[(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, 0.003]}
            rotation={[0, 0, Math.atan2(dy, dx)]}
          >
            <planeGeometry args={[Math.hypot(dx, dy), 0.018]} />
            <meshBasicMaterial color="#246d85" />
          </mesh>
        );
      })}
      {(Object.keys(RESCUE.beacons) as RescueBeacon[]).map((id) => (
        <Marker
          key={id}
          at={RESCUE.beacons[id].at}
          label={id}
          color={id === "H" ? "#438567" : "#263b4b"}
        />
      ))}
    </group>
  );
}
