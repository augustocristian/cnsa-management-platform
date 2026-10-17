import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

setDefaultTimeout(30_000);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mobile = process.env.VIEWPORT === 'mobile';
let server, browser, baseURL;

function freePort() {
  return new Promise((ok, ko) => {
    const s = createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

BeforeAll(async function () {
  const port = await freePort();
  baseURL = `http://localhost:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('The static server did not start')), 10_000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('http://')) {
        clearTimeout(t);
        ok();
      }
    });
    server.once('exit', (c) => ko(new Error('The server exited with code ' + c)));
  });
  browser = await chromium.launch();
});

AfterAll(async function () {
  await browser?.close();
  if (server) {
    server.removeAllListeners('exit');
    server.kill();
  }
});

Before(async function () {
  const device = mobile ? devices['Pixel 5'] : { viewport: { width: 1280, height: 800 } };
  this.context = await browser.newContext({ ...device, baseURL, locale: 'es-ES', acceptDownloads: true });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(8000);
  this.errors = [];
  this.page.on('console', (m) => {
    if (m.type() === 'error') this.errors.push(`console: ${m.text()}`);
  });
  this.page.on('pageerror', (e) => this.errors.push(`pageerror: ${e}`));
  this.page.on('response', (r) => {
    if (r.url().startsWith(baseURL) && r.status() >= 400) this.errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
});

After(async function ({ result, pickle }) {
  try {
    if (result?.status === Status.FAILED) {
      const png = await this.page.screenshot({ fullPage: true }).catch(() => null);
      if (png) {
        this.attach(png, 'image/png');
        const name = pickle.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
        mkdirSync(resolve(ROOT, 'reports/screenshots'), { recursive: true });
        writeFileSync(resolve(ROOT, `reports/screenshots/${mobile ? 'mobile' : 'desktop'}-${name}.png`), png);
      }
    }
  } finally {
    await this.context?.close();
  }
  if (result?.status === Status.PASSED && this.errors.length) {
    throw new Error('Console or network errors during the scenario:\n' + this.errors.join('\n'));
  }
});
