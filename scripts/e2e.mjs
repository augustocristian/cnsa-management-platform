// Ejecuta las pruebas E2E (Cucumber) en escritorio y después en móvil (VIEWPORT=movil).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const bin = join(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
const extra = process.argv.slice(2);
let fallo = false;
for (const viewport of ['escritorio', 'movil']) {
  console.log(`\n=== E2E (${viewport}) ===`);
  const r = spawnSync(process.execPath, [bin, ...extra], { stdio: 'inherit', env: { ...process.env, VIEWPORT: viewport } });
  if (r.status !== 0) fallo = true;
}
process.exit(fallo ? 1 : 0);
