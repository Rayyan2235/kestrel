// Original, deterministic static ambient-occlusion bake for Kestrel's room.
// Cosine-weighted hemisphere rays against the fixed room/furniture envelopes.
// Moving robots and apparatus are deliberately excluded; their shadows are live.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
const N = 256,
  samples = 48;
const boxes = [
  [
    [-1.55, -1.55, 0],
    [-1.5, 1.55, 1.2],
  ],
  [
    [-1.5, 1.5, 0],
    [1.5, 1.55, 1.2],
  ],
  [
    [-0.1, 1.19, 0],
    [0.8, 1.41, 0.16],
  ],
  [
    [-1.41, -1.1, 0],
    [-1.19, -0.4, 0.3],
  ],
  [
    [-1.38, 1.07, 0],
    [-1.12, 1.33, 0.18],
  ],
];
function hit(o, d, box) {
  let lo = 0.002,
    hi = 0.65;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < box[0][a] || o[a] > box[1][a]) return false;
      continue;
    }
    const t1 = (box[0][a] - o[a]) / d[a],
      t2 = (box[1][a] - o[a]) / d[a];
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (hi < lo) return false;
  }
  return true;
}
const directions = Array.from({ length: samples }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / samples),
    a = i * 2.399963229728653;
  return [Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - r * r)];
});
function crc(b) {
  let c = -1;
  for (const x of b) {
    c ^= x;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    b = Buffer.concat([t, data]),
    h = Buffer.alloc(4),
    c = Buffer.alloc(4);
  h.writeUInt32BE(data.length);
  c.writeUInt32BE(crc(b));
  return Buffer.concat([h, b, c]);
}
function png(data) {
  const h = Buffer.alloc(13);
  h.writeUInt32BE(N);
  h.writeUInt32BE(N, 4);
  h[8] = 8;
  h[9] = 2;
  const raw = Buffer.alloc(N * (1 + N * 3));
  for (let y = 0; y < N; y++)
    data.copy(raw, y * (1 + N * 3) + 1, y * N * 3, (y + 1) * N * 3);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
mkdirSync("apps/web/public/workshop", { recursive: true });
for (const surface of ["floor", "back", "left"]) {
  const data = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N,
        v = 1 - (y + 0.5) / N;
      const p =
        surface === "floor"
          ? [u * 3 - 1.5, v * 3 - 1.5, 0.003]
          : surface === "back"
            ? [u * 3 - 1.5, 1.497, v * 1.2]
            : [-1.497, u * 3 - 1.5, v * 1.2];
      let blocked = 0;
      for (const dir of directions) {
        const d =
          surface === "floor"
            ? dir
            : surface === "back"
              ? [dir[0], -dir[2], dir[1]]
              : [dir[2], dir[0], dir[1]];
        if (boxes.some((b) => hit(p, d, b))) blocked++;
      }
      const shade = Math.round(255 * (1 - (0.66 * blocked) / samples));
      const off = (y * N + x) * 3;
      data[off] = data[off + 1] = data[off + 2] = shade;
    }
  writeFileSync(`apps/web/public/workshop/${surface}-ao.png`, png(data));
  console.log(`Baked ${surface}: ${N}² × ${samples} rays`);
}
