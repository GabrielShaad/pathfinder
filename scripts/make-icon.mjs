// Draws the plugin icon (.claude-plugin/icon.png, 512×512): a compass needle on a
// rounded blue square. Pure Node (zlib), 4× supersampled for smooth edges.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const SS = 4;
const BG = [31, 78, 121];
const WHITE = [255, 255, 255];
const ACCENT = [242, 166, 35];

const inRoundedSquare = (x, y) => {
  const r = 110;
  const cx = Math.min(Math.max(x, r), SIZE - r);
  const cy = Math.min(Math.max(y, r), SIZE - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inTriangle = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  const d1 = s(px, py, ax, ay, bx, by);
  const d2 = s(px, py, bx, by, cx, cy);
  const d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Needle pointing up-right, centred.
const c = SIZE / 2;
const angle = Math.PI / 4;
const rot = (dx, dy) => [c + dx * Math.cos(angle) - dy * Math.sin(angle), c + dx * Math.sin(angle) + dy * Math.cos(angle)];
const tip = rot(0, -170);
const tail = rot(0, 170);
const left = rot(-58, 0);
const right = rot(58, 0);

function color(x, y) {
  if (!inRoundedSquare(x, y)) return null;
  const ring = Math.hypot(x - c, y - c);
  if (ring > 188 && ring < 206) return WHITE;
  if (inTriangle(x, y, tip, left, right)) return ACCENT;
  if (inTriangle(x, y, tail, left, right)) return WHITE;
  if (ring < 22) return BG;
  return BG;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const col = color(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (col) {
          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }
    }
    const n = SS * SS;
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    const alpha = a / n;
    raw[offset] = alpha ? Math.round(r / (a / 255)) : 0;
    raw[offset + 1] = alpha ? Math.round(g / (a / 255)) : 0;
    raw[offset + 2] = alpha ? Math.round(b / (a / 255)) : 0;
    raw[offset + 3] = Math.round(alpha);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let k = n;
  for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
  return k >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../.claude-plugin/icon.png", import.meta.url), png);
console.log(`icon.png: ${png.length} bytes`);
