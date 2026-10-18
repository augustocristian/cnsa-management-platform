// Pure-JS PNG re-encoder used by scripts/capturas.mjs to keep the README screenshots small: reads an 8-bit RGB/RGBA
// PNG, reduces it to a 256-colour palette (median cut over the exact colours, weighted by pixel count) and writes an
// indexed PNG. No native dependencies: only node:zlib. Screenshots of a flat UI lose almost nothing; photographs would.
import { deflateSync, inflateSync } from 'node:zlib';

const FIRMA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, datos) {
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(datos.length, 0);
  cab.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), datos])), 0);
  return Buffer.concat([cab, datos, crc]);
}

// PNG filter predictor (types 1-4) for the left (a), up (b) and up-left (c) bytes.
function prediccion(filtro, a, b, c) {
  if (filtro === 1) return a;
  if (filtro === 2) return b;
  if (filtro === 3) return (a + b) >> 1;
  if (filtro !== 4) return 0;
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Decodes an 8-bit non-interlaced RGB (2) or RGBA (6) PNG into { ancho, alto, canales, pix }.
export function decodificarPng(png) {
  if (!png.subarray(0, 8).equals(FIRMA)) throw new Error('not a PNG');
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const idat = [];
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o);
    const tipo = png.toString('ascii', o + 4, o + 8);
    const datos = png.subarray(o + 8, o + 8 + len);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      if (datos[8] !== 8 || datos[12] !== 0 || ![2, 6].includes(datos[9])) throw new Error('unsupported PNG format');
      canales = datos[9] === 6 ? 4 : 3;
    } else if (tipo === 'IDAT') idat.push(datos);
    o += 12 + len;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const pix = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y++) {
    const f = crudo[y * (fila + 1)];
    const src = y * (fila + 1) + 1;
    const dst = y * fila;
    for (let x = 0; x < fila; x++) {
      const a = x >= canales ? pix[dst + x - canales] : 0;
      const b = y ? pix[dst - fila + x] : 0;
      const c = x >= canales && y ? pix[dst - fila + x - canales] : 0;
      const v = crudo[src + x] + prediccion(f, a, b, c);
      pix[dst + x] = v & 0xff;
    }
  }
  return { ancho, alto, canales, pix };
}

// Median cut over the unique colours. Returns { paleta: [[r,g,b]...], indiceDe: Map(colour -> index) }.
function cuantizar(pix, canales, maxColores = 256) {
  const cuentas = new Map();
  for (let i = 0; i < pix.length; i += canales) {
    const k = (pix[i] << 16) | (pix[i + 1] << 8) | pix[i + 2];
    cuentas.set(k, (cuentas.get(k) || 0) + 1);
  }
  const caja = (items) => {
    const min = [255, 255, 255];
    const max = [0, 0, 0];
    let peso = 0;
    for (const [k, n] of items) {
      const c = [k >> 16, (k >> 8) & 255, k & 255];
      for (let j = 0; j < 3; j++) {
        if (c[j] < min[j]) min[j] = c[j];
        if (c[j] > max[j]) max[j] = c[j];
      }
      peso += n;
    }
    const rango = max.map((m, j) => m - min[j]);
    const canal = rango.indexOf(Math.max(...rango));
    return { items, peso, canal, rango: rango[canal] };
  };
  const cajas = [caja([...cuentas])];
  while (cajas.length < maxColores) {
    let mejor = -1;
    let valor = 0;
    cajas.forEach((c, i) => {
      const v = c.rango * Math.sqrt(c.peso);
      if (c.items.length > 1 && v > valor) {
        valor = v;
        mejor = i;
      }
    });
    if (mejor < 0) break;
    const { items, canal, peso } = cajas[mejor];
    const desplazamiento = 16 - 8 * canal;
    const orden = [...items].sort(
      (a, b) => ((a[0] >> (desplazamiento & 31)) & 255) - ((b[0] >> (desplazamiento & 31)) & 255),
    );
    let acum = 0;
    let corte = 1;
    for (let i = 0; i < orden.length - 1; i++) {
      acum += orden[i][1];
      corte = i + 1;
      if (acum >= peso / 2) break;
    }
    cajas.splice(mejor, 1, caja(orden.slice(0, corte)), caja(orden.slice(corte)));
  }
  const paleta = [];
  const indiceDe = new Map();
  cajas.forEach((c, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [k, n] of c.items) {
      r += (k >> 16) * n;
      g += ((k >> 8) & 255) * n;
      b += (k & 255) * n;
      indiceDe.set(k, i);
    }
    paleta.push([Math.round(r / c.peso), Math.round(g / c.peso), Math.round(b / c.peso)]);
  });
  return { paleta, indiceDe };
}

// Re-encodes a PNG as an indexed (palette) PNG.
export function reducirPng(png) {
  const { ancho, alto, canales, pix } = decodificarPng(png);
  const { paleta, indiceDe } = cuantizar(pix, canales);
  const crudo = Buffer.alloc((ancho + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho + 1)] = 0;
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * canales;
      crudo[y * (ancho + 1) + 1 + x] = indiceDe.get((pix[i] << 16) | (pix[i + 1] << 8) | pix[i + 2]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  return Buffer.concat([
    FIRMA,
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(paleta.flat())),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
