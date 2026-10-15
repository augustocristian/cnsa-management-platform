// Node 24 trata `node --test <dir>` como un fichero: este índice carga todos los *.test.js de la carpeta.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(path.join(dir, f)).href);
}
