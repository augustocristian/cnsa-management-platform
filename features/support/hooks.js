import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

setDefaultTimeout(30_000);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const movil = process.env.VIEWPORT === 'movil';
let servidor, navegador, baseURL;

function puertoLibre() {
  return new Promise((ok, ko) => {
    const s = createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

BeforeAll(async function () {
  const puerto = await puertoLibre();
  baseURL = `http://localhost:${puerto}`;
  servidor = spawn(process.execPath, ['scripts/serve.mjs', String(puerto)], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('El servidor estático no arrancó')), 10_000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); ok(); } });
    servidor.once('exit', (c) => ko(new Error('El servidor terminó con código ' + c)));
  });
  navegador = await chromium.launch();
});

AfterAll(async function () {
  await navegador?.close();
  if (servidor) { servidor.removeAllListeners('exit'); servidor.kill(); }
});

Before(async function () {
  const dispositivo = movil ? devices['Pixel 5'] : { viewport: { width: 1280, height: 800 } };
  this.contexto = await navegador.newContext({ ...dispositivo, baseURL, locale: 'es-ES', acceptDownloads: true });
  this.page = await this.contexto.newPage();
  this.page.setDefaultTimeout(8000);
  this.errores = [];
  this.page.on('console', (m) => { if (m.type() === 'error') this.errores.push(`console: ${m.text()}`); });
  this.page.on('pageerror', (e) => this.errores.push(`pageerror: ${e}`));
  this.page.on('response', (r) => { if (r.url().startsWith(baseURL) && r.status() >= 400) this.errores.push(`HTTP ${r.status()} ${r.url()}`); });
});

After(async function ({ result, pickle }) {
  try {
    if (result?.status === Status.FAILED) {
      const png = await this.page.screenshot({ fullPage: true }).catch(() => null);
      if (png) {
        this.attach(png, 'image/png');
        const nombre = pickle.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
        mkdirSync(resolve(RAIZ, 'reports/screenshots'), { recursive: true });
        writeFileSync(resolve(RAIZ, `reports/screenshots/${movil ? 'movil' : 'escritorio'}-${nombre}.png`), png);
      }
    }
  } finally {
    await this.contexto?.close();
  }
  if (result?.status === Status.PASSED && this.errores.length) {
    throw new Error('Errores de consola o de red durante el escenario:\n' + this.errores.join('\n'));
  }
});
