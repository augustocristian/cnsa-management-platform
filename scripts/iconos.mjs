// Generates PNG icons without dependencies (own rasteriser + zlib): node scripts/iconos.mjs
//   icons/apple-touch-icon.png   180x180 opaque, full bleed (iOS applies its own corners)
//   icons/icon-maskable-512.png  512x512 opaque, motif inside the safe zone (central circle of 80 %)
// The motif is the same as icons/icon.svg (swimmer + waves). The "any" icons (icon-192/512.png) already exist.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const FONDO = [26, 115, 232];
const BLANCO = [255, 255, 255];
const AZUL_CLARO = [188, 215, 251];

// ---- Motif geometry on a 512 canvas ----
const quad = (p0, p1, p2, n = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
function ola(y) { // M70 y q46 -40 92 0 t92 0 t92 0 t92 0
  let pts = []; let x = 70; let dy = -40;
  for (let i = 0; i < 4; i++) { pts = pts.concat(quad([x, y], [x + 46, y + dy], [x + 92, y])); x += 92; dy = -dy; }
  return pts;
}
const brazo = quad([110, 270], [190, 200], [270, 232]).concat([[350, 262]]);
const FORMAS = [
  { tipo: 'circulo', c: [332, 176], r: 38, color: BLANCO },
  { tipo: 'trazo', pts: brazo, w: 34, color: BLANCO },
  { tipo: 'trazo', pts: ola(350), w: 26, color: BLANCO },
  { tipo: 'trazo', pts: ola(420), w: 26, color: AZUL_CLARO },
];
const distSeg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};
function color(x, y) { // x,y in 512-canvas coordinates; the last shape covering the point wins
  let c = null;
  for (const f of FORMAS) {
    if (f.tipo === 'circulo') { if (Math.hypot(x - f.c[0], y - f.c[1]) <= f.r) c = f.color; }
    else for (let i = 0; i < f.pts.length - 1; i++) if (distSeg([x, y], f.pts[i], f.pts[i + 1]) <= f.w / 2) { c = f.color; break; }
  }
  return c;
}

// ---- Render with 3x3 supersampling ----
function render(size, escala) {
  const cx = 254, cy = 295.5; // motif centre
  const px = Buffer.alloc(size * size * 3);
  const SS = 3;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let r = 0, g = 0, b = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const u = ((i + (si + .5) / SS) / size) * 512, v = ((j + (sj + .5) / SS) / size) * 512;
      const c = color((u - 256) / escala + cx, (v - 256) / escala + cy) || FONDO;
      r += c[0]; g += c[1]; b += c[2];
    }
    const o = (j * size + i) * 3;
    px[o] = Math.round(r / (SS * SS)); px[o + 1] = Math.round(g / (SS * SS)); px[o + 2] = Math.round(b / (SS * SS));
  }
  return px;
}

// ---- PNG RGB 8 bit ----
const TABLA = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLA[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(cuerpo));
  return Buffer.concat([len, cuerpo, sum]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) rgb.copy(filas, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filas, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('icons/apple-touch-icon.png', png(180, render(180, 1.0)));
writeFileSync('icons/icon-maskable-512.png', png(512, render(512, 0.74)));
console.log('iconos: icons/apple-touch-icon.png, icons/icon-maskable-512.png');
