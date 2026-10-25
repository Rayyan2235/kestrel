import * as THREE from "three";

/** Bright playground colours. Pip (graphite) and Nova (amethyst) keep their own. */
export const PLAY = {
  skyTop: "#7cc4ee",
  skyBottom: "#e9f6fb",
  grass: "#6cb45a",
  soil: "#b98a5e",
  court: "#f2e6cd",
  zone: "#cfeaf0",
  zoneEdge: "#4fb3e8",
  paint: "#ffffff",
  yellow: "#f7c548",
  coral: "#f2735a",
  blue: "#4fb3e8",
  mint: "#5cc9a7",
  pink: "#f59ab6",
  wood: "#d9a066",
  woodDark: "#a8743f",
  metal: "#c7ced6",
  sand: "#f2d59b",
  leaf: "#5fb85a",
  leafLight: "#8fd36f",
  chalkboard: "#2f3e39",
  chalk: "#f5f2e8",
  chalkYellow: "#f7dd7a",
} as const;

/** Deterministic noise so every reload paints the same ground. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(c: HTMLCanvasElement, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

/**
 * Poured EPDM safety rubber: a pale base with the coloured granules real
 * playground surfaces have. Original procedural map, no image assets.
 */
export function courtTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = PLAY.court;
  g.fillRect(0, 0, 512, 512);
  const random = seeded(4021);
  const flecks = ["#e8d6b3", "#fff8ea", PLAY.coral, PLAY.blue, PLAY.yellow, PLAY.mint];
  for (let i = 0; i < 9000; i++) {
    const k = random();
    g.fillStyle = flecks[k < 0.55 ? 0 : k < 0.82 ? 1 : 2 + Math.floor(random() * 4)]!;
    g.globalAlpha = k < 0.82 ? 0.7 : 0.55;
    const s = 1 + random() * 2.2;
    g.fillRect(random() * 512, random() * 512, s, s);
  }
  g.globalAlpha = 1;
  return canvasTexture(c, 4);
}

/** Short lawn: soft tonal patches and blade flecks. */
export function grassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = PLAY.grass;
  g.fillRect(0, 0, 512, 512);
  const random = seeded(977);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = random() < 0.5 ? "rgba(70,140,60,.12)" : "rgba(170,220,120,.12)";
    g.beginPath();
    g.arc(random() * 512, random() * 512, 20 + random() * 60, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 7000; i++) {
    const x = random() * 512,
      y = random() * 512;
    g.strokeStyle = random() < 0.5 ? "rgba(60,128,52,.45)" : "rgba(176,226,128,.5)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 4);
    g.stroke();
  }
  return canvasTexture(c, 8);
}

export function sandTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = PLAY.sand;
  g.fillRect(0, 0, 256, 256);
  const random = seeded(311);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = random() < 0.5 ? "rgba(190,150,90,.35)" : "rgba(255,245,220,.45)";
    g.fillRect(random() * 256, random() * 256, 1.5, 1.5);
  }
  return canvasTexture(c, 2);
}

/** Painted hopscotch: big numerals, legible from the default camera. */
export function hopscotchTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;
  const cells: [number, number, number, number, string][] = [
    [64, 448, 128, 64, "1"],
    [64, 384, 128, 64, "2"],
    [0, 320, 128, 64, "3"],
    [128, 320, 128, 64, "4"],
    [64, 256, 128, 64, "5"],
    [0, 192, 128, 64, "6"],
    [128, 192, 128, 64, "7"],
    [64, 128, 128, 64, "8"],
  ];
  const fills = [PLAY.coral, PLAY.yellow, PLAY.blue, PLAY.mint];
  g.lineWidth = 6;
  g.strokeStyle = PLAY.paint;
  g.font = `800 40px "Plus Jakarta Sans Variable", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  cells.forEach(([x, y, w, h, n], i) => {
    g.fillStyle = fills[i % 4]!;
    g.globalAlpha = 0.85;
    g.fillRect(x + 3, y + 3, w - 6, h - 6);
    g.globalAlpha = 1;
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = PLAY.paint;
    g.fillText(n, x + w / 2, y + h / 2 + 2);
  });
  g.beginPath();
  g.arc(128, 96, 56, Math.PI, 0);
  g.lineTo(184, 128);
  g.lineTo(72, 128);
  g.closePath();
  g.fillStyle = PLAY.pink;
  g.globalAlpha = 0.85;
  g.fill();
  g.globalAlpha = 1;
  g.stroke();
  return canvasTexture(c);
}

/** Daylight sky behind the island: a vertical wash, top blue to pale horizon. */
export function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d")!;
  const gradient = g.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, PLAY.skyTop);
  gradient.addColorStop(1, PLAY.skyBottom);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 2, 256);
  return canvasTexture(c);
}

/** Soft radial contact shade for objects whose real shadow is small. */
export function contactShadeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gradient = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  gradient.addColorStop(0, "rgba(40,60,40,.32)");
  gradient.addColorStop(1, "rgba(40,60,40,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
