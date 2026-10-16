// Copies the browser dependencies from node_modules to vendor/ (the PWA has no build step)
// and generates vendor/integrity.json with the SRI hash (sha384) of each file, which the browser checks on load.
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const files = [
  ['node_modules/@e965/xlsx/dist/xlsx.full.min.js', 'vendor/xlsx.full.min.js'],
  // Training PDF: loaded lazily, only when a PDF is generated (js/infrastructure/pdfEntreno.js)
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'vendor/jspdf.umd.min.js'],
  ['node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'vendor/jspdf.plugin.autotable.min.js'],
];
mkdirSync('vendor', { recursive: true });
const integrity = {};
for (const [from, to] of files) {
  if (!existsSync(from)) { console.warn(`vendor: no existe ${from}, omitido`); continue; }
  copyFileSync(from, to);
  integrity[basename(to)] = 'sha384-' + createHash('sha384').update(readFileSync(to)).digest('base64');
  console.log(`vendor: ${from} -> ${to}`);
}
if (Object.keys(integrity).length) {
  writeFileSync('vendor/integrity.json', JSON.stringify(integrity, null, 2) + '\n');
  console.log('vendor: vendor/integrity.json');
}
