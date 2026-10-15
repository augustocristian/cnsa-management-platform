// Comprobación de sintaxis de todos los módulos JS.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'cnl-'));
let n = 0, bad = 0;
const walk = (d) => { for (const f of readdirSync(d)) {
  const p = join(d, f);
  if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== 'vendor' && !f.startsWith('.')) walk(p); }
  else if (/\.js$/.test(f)) {
    const t = join(tmp, `${n++}.mjs`); writeFileSync(t, readFileSync(p));
    try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); }
    catch (e) { bad++; console.error(`ERROR ${p}\n${e.stderr}`); }
  }
} };
walk('js'); try { execFileSync(process.execPath, ['--check', 'sw.js'], { stdio: 'pipe' }); } catch (e) { bad++; console.error(String(e.stderr)); }
console.log(bad ? `${bad} con errores` : `OK (${n} ficheros)`);
process.exit(bad ? 1 : 0);
