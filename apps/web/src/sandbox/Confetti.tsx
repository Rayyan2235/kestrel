import { useEffect, useRef } from "react";
import styles from "./Sandbox.module.css";

const COLORS = ["#f6c453", "#f29f3d", "#5caca4", "#db8769", "#72aeb4", "#244267", "#ffffff"];
const RUN_MS = 3800;
const FADE_MS = 1000;

/**
 * Two confetti cannons from the bottom corners, fired each time `burst`
 * changes. Skipped when the learner asks for reduced motion.
 */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!burst || !canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pieces = Array.from({ length: 200 }, (_, i) => {
      const left = i % 2 === 0;
      const angle = ((left ? -62 : -118) * Math.PI) / 180 + (Math.random() - 0.5) * 0.6;
      const speed = (12 + Math.random() * 12) * Math.min(1, h / 800);
      return {
        x: left ? 0 : w,
        y: h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.35,
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
        color: COLORS[i % COLORS.length]!,
      };
    });
    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      // Steps are in 60 fps frames, so a slow frame rate falls at the same speed.
      const dt = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.min(1, Math.max(0, (RUN_MS - t) / FADE_MS));
      for (const p of pieces) {
        p.vx *= Math.pow(0.985, dt);
        p.vy = Math.min(p.vy + 0.32 * dt, 4.5);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += p.vspin * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.scale(1, Math.cos(p.spin * 1.7));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < RUN_MS) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, [burst]);
  return <canvas ref={ref} className={styles.confetti} aria-hidden="true" data-testid="confetti" data-burst={burst} />;
}
