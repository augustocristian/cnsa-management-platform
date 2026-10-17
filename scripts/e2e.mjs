// Runs the E2E tests (Cucumber) on desktop and then on mobile (VIEWPORT=mobile).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const bin = join(process.cwd(), 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
const extra = process.argv.slice(2);
let failed = false;
for (const viewport of ['desktop', 'mobile']) {
  console.log(`\n=== E2E (${viewport}) ===`);
  const r = spawnSync(process.execPath, [bin, ...extra], { stdio: 'inherit', env: { ...process.env, VIEWPORT: viewport } });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
