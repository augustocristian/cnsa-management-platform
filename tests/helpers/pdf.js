// Utilidades de prueba para PDFs generados por jsPDF: número de páginas y texto, sin dependencias externas.
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { ROOT } from './env.js';
import path from 'node:path';

// Librería PDF para Node (jsPDF + autotable) con la misma forma que la que inyecta el navegador.
export function libNode() {
  const require = createRequire(path.join(ROOT, 'package.json'));
  const { jsPDF } = require('jspdf');
  const { autoTable } = require('jspdf-autotable');
  return { jsPDF, autoTable };
}

const latin1 = (buf) => Buffer.from(buf).toString('latin1');

// -> { cabecera: '%PDF-1.3', paginas, textosPorPagina: [..], texto }
export function infoPdf(bytes) {
  const buf = Buffer.from(bytes);
  const crudo = latin1(buf);
  const cabecera = crudo.slice(0, 8);
  const paginas = (crudo.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  const textos = [];
  let i = 0;
  while ((i = crudo.indexOf('stream', i)) >= 0) {
    if (crudo.slice(i - 3, i) === 'end') { i += 6; continue; }
    let ini = i + 6;
    if (crudo[ini] === '\r') ini++;
    if (crudo[ini] === '\n') ini++;
    const fin = crudo.indexOf('endstream', ini);
    if (fin < 0) break;
    let data = buf.subarray(ini, fin);
    try { data = inflateSync(data); } catch (e) { /* sin comprimir */ }
    const s = latin1(data);
    if (/\bBT\b/.test(s)) {
      // Cada página es un flujo de contenido: texto de los operadores Tj en orden
      const trozos = [];
      for (const m of s.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) trozos.push(m[1]);
      textos.push(trozos.map((x) => x.replace(/\\([()\\])/g, '$1')).join('\n'));
    }
    i = fin + 9;
  }
  return { cabecera, paginas, textosPorPagina: textos, texto: textos.join('\n') };
}
