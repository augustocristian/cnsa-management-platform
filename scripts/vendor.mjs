// Copia las dependencias de navegador desde node_modules a vendor/ (la PWA no tiene build).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const files = [
  ['node_modules/@e965/xlsx/dist/xlsx.full.min.js', 'vendor/xlsx.full.min.js'],
  // PDF de entreno: se cargan de forma diferida sólo al generar un PDF (js/infrastructure/pdfEntreno.js)
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'vendor/jspdf.umd.min.js'],
  ['node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'vendor/jspdf.plugin.autotable.min.js'],
];
mkdirSync('vendor', { recursive: true });
for (const [from, to] of files) {
  if (!existsSync(from)) { console.warn(`vendor: no existe ${from}, omitido`); continue; }
  copyFileSync(from, to);
  console.log(`vendor: ${from} -> ${to}`);
}
