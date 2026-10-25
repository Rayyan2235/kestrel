import * as THREE from "three";

/** Original procedural material maps, not downloaded image assets. */
export function surfaceTexture(kind: "oak" | "stone" | "plaster" | "floor") {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  let seed = 731;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const image = g.createImageData(1024, 1024);
  const base =
    kind === "stone"
      ? [216, 209, 190]
      : kind === "plaster"
        ? [225, 220, 207]
        : [165, 128, 88];
  for (let y = 0; y < 1024; y++)
    for (let x = 0; x < 1024; x++) {
      const wood = kind === "oak" || kind === "floor";
      const grain = wood
        ? Math.sin(
            y * 0.65 +
              Math.sin(x * 0.009) * 2 +
              Math.sin(x * 0.025 + y * 0.013),
          ) *
            4 +
          Math.sin(y * 0.14 + Math.sin(x * 0.012)) * 5
        : Math.sin(x * 0.012 + Math.sin(y * 0.017)) * 2;
      const variation = (random() - 0.5) * (wood ? 9 : 13) + grain;
      const row = Math.floor(y / 85.34),
        column = Math.floor((x + (row % 2) * 256) / 512);
      const board = kind === "floor" ? Math.sin(row * 31 + column * 7) * 8 : 0;
      const i = (y * 1024 + x) * 4;
      for (let k = 0; k < 3; k++)
        image.data[i + k] = base[k]! + variation + board;
      image.data[i + 3] = 255;
    }
  g.putImageData(image, 0, 0);
  if (kind === "floor") {
    for (let row = 0; row < 12; row++) {
      const y = (row * 1024) / 12;
      g.fillStyle = "rgba(45,36,26,.48)";
      g.fillRect(0, y, 1024, 2);
      g.fillStyle = "rgba(255,241,215,.25)";
      g.fillRect(0, y + 2, 1024, 1);
      for (let x = -(row % 2) * 256; x < 1024; x += 512) {
        g.fillStyle = "rgba(45,36,26,.4)";
        g.fillRect(x, y, 2, 85);
      }
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
export function softShadeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gradient = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(37,39,27,.26)");
  gradient.addColorStop(1, "rgba(37,39,27,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
