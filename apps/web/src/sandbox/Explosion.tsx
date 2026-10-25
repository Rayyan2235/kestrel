import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Seconds the whole burst lasts. */
export const BLAST_LIFE = 1.4;
const SPARKS = 40;
const SMOKE = 8;
const GRAVITY = 9.81;
const SPARK_COLORS = ["#fff3a3", "#ffd23f", "#ff9f1c", "#ff5d2e"];

function boomTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.translate(256, 128);
  g.rotate(-0.08);
  // Comic starburst behind the word.
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 92 : 124;
    const a = (i / 24) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r * 1.8, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = "#ff5d2e";
  g.fill();
  g.font = "900 112px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 18;
  g.strokeStyle = "#7c1d06";
  g.strokeText("BOOM!", 0, 6);
  g.fillStyle = "#ffe14d";
  g.fillText("BOOM!", 0, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/**
 * A cartoon explosion where Pip and Nova clashed. Purely visual: the robots
 * are not damaged, and the physics is untouched. `at` is in MuJoCo
 * coordinates (z up), with z the clash height above the floor.
 */
export function Explosion({ at, reducedMotion }: { at: [number, number, number]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const flashMat = useRef<THREE.MeshBasicMaterial>(null);
  const fire = useRef<THREE.Mesh>(null);
  const fireMat = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const smoke = useRef<THREE.InstancedMesh>(null);
  const smokeMat = useRef<THREE.MeshBasicMaterial>(null);
  const boom = useRef<THREE.Sprite>(null);
  const boomMat = useRef<THREE.SpriteMaterial>(null);
  const start = useRef<number | null>(null);
  const tex = useMemo(boomTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () => ({
      sparks: Array.from({ length: SPARKS }, () => {
        const a = Math.random() * Math.PI * 2;
        const up = 0.35 + Math.random() * 0.65;
        const speed = 1.4 + Math.random() * 1.8;
        const flat = Math.sqrt(1 - up * up);
        return { v: [Math.cos(a) * flat * speed, Math.sin(a) * flat * speed, up * speed] as const, size: 0.012 + Math.random() * 0.016 };
      }),
      smoke: Array.from({ length: SMOKE }, (_, i) => {
        const a = (i / SMOKE) * Math.PI * 2 + Math.random() * 0.5;
        return { dir: [Math.cos(a), Math.sin(a)] as const, rise: 0.12 + Math.random() * 0.1, size: 0.05 + Math.random() * 0.03 };
      }),
    }),
    [],
  );
  useEffect(() => {
    if (!sparks.current) return;
    seeds.sparks.forEach((_, i) => sparks.current!.setColorAt(i, new THREE.Color(SPARK_COLORS[i % SPARK_COLORS.length])));
    if (sparks.current.instanceColor) sparks.current.instanceColor.needsUpdate = true;
    // Colours added after the first compile need the shader rebuilt.
    (sparks.current.material as THREE.Material).needsUpdate = true;
  }, [seeds]);

  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    if (!group.current) return;
    if (t > BLAST_LIFE) {
      group.current.visible = false;
      return;
    }
    // The word pops past full size, settles, then fades.
    const pop = t < 0.18 ? easeOut(t / 0.18) * 1.25 : 1.25 - 0.25 * easeOut((t - 0.18) / 0.2);
    boom.current?.scale.set(0.62 * pop, 0.31 * pop, 1);
    boom.current?.position.set(0, 0, 0.22 + 0.06 * t);
    if (boomMat.current) boomMat.current.opacity = Math.max(0, Math.min(1, (BLAST_LIFE - t) / 0.4));
    if (reducedMotion) return;

    flash.current?.scale.setScalar(0.05 + 0.3 * easeOut(t / 0.1));
    if (flashMat.current) flashMat.current.opacity = Math.max(0, 1 - t / 0.3);
    fire.current?.scale.setScalar(0.06 + 0.22 * easeOut(t / 0.45));
    if (fireMat.current) fireMat.current.opacity = Math.max(0, 0.95 * (1 - t / 0.8));
    ring.current?.scale.setScalar(0.06 + 0.8 * easeOut(t / 0.55));
    if (ringMat.current) ringMat.current.opacity = Math.max(0, 0.85 * (1 - t / 0.55));

    const floor = -at[2] + 0.005;
    if (sparks.current) {
      seeds.sparks.forEach((s, i) => {
        const z = Math.max(floor, s.v[2] * t - 0.5 * GRAVITY * t * t);
        dummy.position.set(s.v[0] * t, s.v[1] * t, z);
        dummy.scale.setScalar(s.size * Math.max(0, 1 - t / BLAST_LIFE));
        dummy.updateMatrix();
        sparks.current!.setMatrixAt(i, dummy.matrix);
      });
      sparks.current.instanceMatrix.needsUpdate = true;
    }
    if (smoke.current) {
      seeds.smoke.forEach((s, i) => {
        const k = easeOut(t / BLAST_LIFE);
        dummy.position.set(s.dir[0] * 0.12 * k, s.dir[1] * 0.12 * k, s.rise * k);
        dummy.scale.setScalar(s.size * (0.4 + k));
        dummy.updateMatrix();
        smoke.current!.setMatrixAt(i, dummy.matrix);
      });
      smoke.current.instanceMatrix.needsUpdate = true;
      if (smokeMat.current) smokeMat.current.opacity = 0.55 * Math.max(0, 1 - t / BLAST_LIFE) * Math.min(1, t / 0.15);
    }
  });

  return (
    <group ref={group} position={at}>
      <sprite ref={boom} renderOrder={12}>
        <spriteMaterial ref={boomMat} map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      {!reducedMotion && (
        <>
          <mesh ref={flash} renderOrder={11}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshBasicMaterial ref={flashMat} color="#fff8d6" transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh ref={fire} renderOrder={10}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial ref={fireMat} color="#ff8a2a" transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh ref={ring} position={[0, 0, -at[2] + 0.004]} renderOrder={9}>
            <ringGeometry args={[0.82, 1, 48]} />
            <meshBasicMaterial ref={ringMat} color="#ffe2a8" transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={smoke} args={[undefined, undefined, SMOKE]} frustumCulled={false}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshBasicMaterial ref={smokeMat} color="#b8b2aa" transparent depthWrite={false} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}
