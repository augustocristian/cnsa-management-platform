// Genera las capturas de pantalla reales de la aplicación para el README: docs/screenshots/*.png
//
//   npm run capturas                              todas (escritorio 1366x850 y móvil 390x844)
//   npm run capturas -- --solo=inicio,asistencia  sólo algunas (por id; ver ESCENARIOS)
//   npm run capturas -- --dispositivo=movil       sólo escritorio o sólo móvil
//   npm run capturas -- --concurrencia=2          páginas simultáneas (por defecto 4)
//   npm run capturas -- --salida=ruta/otra        carpeta de salida (por defecto docs/screenshots)
//
// Cómo lo hace: arranca scripts/serve.mjs en un puerto libre y abre la app con Playwright/Chromium usando el Google
// simulado de pruebas (js/infrastructure/fakeGoogle.js, localStorage 'cnl:test') y los datos de demostración
// (store.seedDemo), igual que los E2E. Para que sean reproducibles: reloj fijo (miércoles 14-oct-2026, 10:30 Madrid),
// zona horaria Europe/Madrid, español salvo que el escenario indique otro idioma, movimiento reducido, sin service
// worker, animaciones y cursor desactivados en la captura. Cada escenario va en su propio contexto limpio y se ejecutan
// en paralelo con un límite. Una captura se rechaza (y no se escribe) si hay errores de consola, respuestas 4xx/5xx,
// la vista queda en "Cargando" o el PNG es sospechosamente pequeño; el proceso termina con código 1 si alguna falla.
// El PDF de entreno se genera con la propia app (botón PDF) y su primera página se pinta con pdfjs-dist.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const SOLO = arg('solo', '') ? arg('solo').split(',').map((s) => s.trim()) : null;
const DISP = arg('dispositivo', '');
const CONCURRENCIA = Math.max(1, Number(arg('concurrencia', 4)));
const SALIDA = resolve(RAIZ, arg('salida', 'docs/screenshots'));
const AHORA = new Date('2026-10-14T10:30:00+02:00'); // miércoles; en el demo hay sesiones hoy, semanas pasadas y futuras
const ZONA = 'Europe/Madrid';
const MAX_KB = 250;

const VISORES = {
  escritorio: { viewport: { width: 1366, height: 850 }, deviceScaleFactor: 1 },
  movil: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEMO = { sesion: true, demo: true };
const VACIO = { sesion: true, demo: false };
const SIN_SESION = { sesion: false, demo: false };

// ---------- Utilidades de página ----------
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const RESUMEN_PLAN = /\d+ m · \d+ min/; // sesiones con plan de entreno: "1800 m · 57 min"
const DIALOGO ='[role="dialog"], .nad-modal, .grp-modal, .ent-modal, .modal'; // diálogos (varía según la vista)

// Espera a que la vista deje de estar en "Cargando", haya terminado la sincronización y se hayan cargado las fuentes.
async function estable(p, { espera = 250 } = {}) {
  await p.locator('#view .loading, .spinner, [aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await p.locator('.status-chip.st-sincronizado').waitFor({ timeout: 4000 }).catch(() => {}); // "Pendiente" -> "Sincronizado"
  await p.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await pausa(espera);
}

async function entrar(p, ruta) {
  await p.goto(`/#/${ruta}`);
  await p.locator('.topbar .brand-name').waitFor({ timeout: 10000 });
  // Aviso de privacidad (se guarda en las preferencias del Drive simulado): se descarta para que no tape la pantalla
  const ok = p.getByRole('button', { name: /^(Entendido|Got it|Capito)$/ });
  if (await ok.count()) await ok.first().click();
  await estable(p);
}

// Lleva un elemento a la parte superior de la ventana (para que la captura enseñe lo importante)
async function arriba(p, selector, margen = 90) {
  const el = p.locator(selector).first();
  await el.waitFor({ timeout: 8000 });
  await el.evaluate((e, m) => { const y = e.getBoundingClientRect().top + window.scrollY - m; window.scrollTo(0, Math.max(0, y)); }, margen);
  await pausa(150);
}
// Desplaza el elemento a la parte superior de su contenedor desplazable (ventana, diálogo...) dejando "margen" px por encima
async function desplazar(p, selector, margen = 0) {
  const el = p.locator(selector).first();
  await el.waitFor({ timeout: 8000 });
  await el.evaluate((e, m) => {
    let c = e.parentElement;
    while (c && !(c.scrollHeight > c.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
    if (!c) { window.scrollTo(0, Math.max(0, e.getBoundingClientRect().top + window.scrollY - m)); return; }
    c.scrollTop += e.getBoundingClientRect().top - c.getBoundingClientRect().top - m;
  }, margen);
  await pausa(150);
}
const clic = async (p, loc) => { await loc.first().waitFor({ timeout: 8000 }); await loc.first().click(); };
const boton = (p, nombre) => p.getByRole('button', { name: nombre });

async function irA(p, ruta) {
  await p.evaluate((x) => { location.hash = '#/' + x; }, ruta);
  await p.locator(`.nav-item[data-route="${ruta.split('/')[0]}"].active`).waitFor({ timeout: 8000 }).catch(() => {});
  await estable(p);
}

// Primera sesión del grupo con plan de entreno (hoy o futura) en la semana visible
async function abrirPlan(p, grupo = 'Promoción') {
  const fila = p.locator('.ent-day .ent-sess')
    .filter({ has: p.locator('.ent-meta .badge:first-child', { hasText: new RegExp(`^${grupo}$`) }) })
    .filter({ hasText: RESUMEN_PLAN }).first();
  await fila.waitFor({ timeout: 8000 });
  await fila.getByRole('button', { name: /^Plan$/ }).click();
  await p.locator('.enp-ov:not(.enp-prev-ov) .enp-panel').waitFor({ timeout: 8000 });
  await estable(p);
}

const EDITOR = '.enp-ov:not(.enp-prev-ov)';
async function resumenAbierto(p) {
  const barra = p.locator(EDITOR + ' .enp-res-bar');
  await barra.waitFor();
  if ((await barra.getAttribute('aria-expanded')) !== 'true') await barra.click();
  await pausa(150);
}

// ---------- PDF: se descarga con la app y se pinta su primera página con pdfjs-dist ----------
async function renderizarPdf(navegador, bytes, ancho = 1200) {
  const base = join(RAIZ, 'node_modules', 'pdfjs-dist');
  const tipos = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };
  const ctx = await navegador.newContext({ viewport: { width: ancho + 40, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route('http://pdf.local/**', async (route) => {
    const ruta = new URL(route.request().url()).pathname;
    try {
      if (ruta === '/') {
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff"><canvas id=c></canvas>
<script type=module>
import * as pdfjs from '/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/build/pdf.worker.mjs';
try {
  const doc = await pdfjs.getDocument({ url: '/doc.pdf', standardFontDataUrl: '/standard_fonts/', wasmUrl: '/wasm/', cMapUrl: '/cmaps/', cMapPacked: true }).promise;
  const pg = await doc.getPage(1);
  const v0 = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: ${ancho} / v0.width });
  const c = document.getElementById('c'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
  window.__pdf = { ok: true, paginas: doc.numPages };
} catch (e) { window.__pdf = { ok: false, error: String(e) }; }
</script>` });
      }
      if (ruta === '/doc.pdf') return route.fulfill({ contentType: 'application/pdf', body: Buffer.from(bytes) });
      const datos = await readFile(join(base, ruta));
      return route.fulfill({ contentType: tipos[extname(ruta)] || 'application/octet-stream', body: datos });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await p.goto('http://pdf.local/');
  await p.waitForFunction(() => window.__pdf, null, { timeout: 20000 });
  const r = await p.evaluate(() => window.__pdf);
  if (!r.ok) throw new Error('pdfjs no pudo pintar el PDF: ' + r.error);
  const png = await p.locator('#c').screenshot({ type: 'png' });
  await ctx.close();
  return png;
}

// ---------- Escenarios ----------
// id: nombre estable (el fichero es <dispositivo>-<id>.png). dispositivos: por defecto ambos.
// opciones: opciones del Google simulado. ruta: hash inicial (sin '#/'). idioma/tema: preferencias del navegador.
// paso(p, ctx): acciones previas a la captura. captura(p, ctx) -> Buffer PNG: sustituye a la captura estándar.
const ESCENARIOS = [
  // --- Primer arranque ---
  { id: 'acceso', titulo: 'Acceso con Google', opciones: SIN_SESION, ruta: '', sinShell: true,
    paso: async (p) => { await p.locator('#app button, #app a.btn').first().waitFor({ timeout: 8000 }); } },
  { id: 'asistente', titulo: 'Asistente de primer arranque: nombre y lema', opciones: VACIO, ruta: '', sinShell: true,
    paso: async (p) => {
      await p.getByLabel('Nombre del club').fill('Club Natación Lugones');
      await p.getByLabel('Lema (opcional)').fill('Pequeño gran club');
    } },
  { id: 'asistente-colores', titulo: 'Asistente de primer arranque: colores y zona horaria', opciones: VACIO, ruta: '', sinShell: true,
    paso: async (p) => {
      await p.getByLabel('Nombre del club').fill('Club Natación Lugones');
      await p.getByLabel('Lema (opcional)').fill('Pequeño gran club');
      await boton(p, 'Siguiente').click();
      await p.getByText('Paso 2 de 2').waitFor();
    } },
  { id: 'primeros-pasos', titulo: 'Club nuevo: primeros pasos y estados vacíos', opciones: VACIO, ruta: '', sinShell: true,
    paso: async (p) => {
      // el club vacío nace del asistente: se completa con el propio asistente
      await p.getByLabel('Nombre del club').fill('Club Natación Lugones');
      await p.getByLabel('Lema (opcional)').fill('Pequeño gran club');
      await boton(p, 'Siguiente').click();
      await boton(p, 'Crear mi club').click();
      await p.locator('.topbar .brand-name').waitFor({ timeout: 10000 });
      const ok = p.getByRole('button', { name: 'Entendido' });
      if (await ok.count()) await ok.first().click();
      await estable(p, { espera: 500 });
    } },

  // --- Inicio ---
  { id: 'inicio', titulo: 'Inicio (panel)', opciones: DEMO, ruta: 'inicio' },

  // --- Nadadores ---
  { id: 'nadadores', titulo: 'Nadadores: listado', opciones: DEMO, ruta: 'nadadores' },
  { id: 'nadador-ficha', titulo: 'Nadadores: ficha con asistencia, cargas y marcas', opciones: DEMO, ruta: 'nadadores/n06' },
  { id: 'nadador-formulario', titulo: 'Nadadores: alta con categoría automática', opciones: DEMO, ruta: 'nadadores',
    paso: async (p) => {
      await boton(p, /Nuevo nadador/).click();
      const m = p.locator(DIALOGO).last();
      await m.waitFor();
      await m.getByLabel(/^Nombre/).first().fill('Sofía');
      await m.getByLabel('Apellidos').fill('Martínez Pérez');
      await m.getByLabel('Fecha de nacimiento').fill('2015-03-20');
      await m.locator('[data-testid="categoria-auto"]').getByText(/Alevín/).waitFor();
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
    } },

  // --- Grupos ---
  { id: 'grupos', titulo: 'Grupos de entrenamiento', opciones: DEMO, ruta: 'grupos' },

  // --- Entrenamientos y plan por sets ---
  { id: 'entrenamientos', titulo: 'Entrenamientos: semana', opciones: DEMO, ruta: 'entrenamientos' },
  { id: 'entreno-editor', titulo: 'Plan de entreno por sets con resumen por contenido y estilo', opciones: DEMO, ruta: 'entrenamientos',
    paso: async (p) => {
      await abrirPlan(p, 'Promoción');
      await resumenAbierto(p);
      await desplazar(p, EDITOR + ' .enp-res-bar', 0);
    } },
  { id: 'entreno-editor-filas', titulo: 'Plan de entreno: filas del set con varios contenidos por ejercicio', opciones: DEMO, ruta: 'entrenamientos',
    paso: async (p) => {
      await abrirPlan(p, 'Promoción');
      await desplazar(p, EDITOR + ' .enp-set', 50);
    } },
  { id: 'entreno-pdf', titulo: 'PDF de entreno generado (primera página)', opciones: DEMO, ruta: 'entrenamientos', dispositivos: ['escritorio'],
    captura: async (p, { navegador }) => {
      const fila = p.locator('.ent-day .ent-sess').filter({ hasText: RESUMEN_PLAN }).first();
      await fila.waitFor();
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), fila.locator('button', { hasText: /^\s*PDF\s*$/ }).first().click()]);
      return renderizarPdf(navegador, await readFile(await dl.path()));
    } },
  // --- Asistencia ---
  { id: 'asistencia', titulo: 'Asistencia: pasar lista', opciones: DEMO, ruta: 'asistencia',
    paso: async (p) => {
      // se toca un nadador sin marcar para que se vea cómo cambia
      const sin = p.locator('#view [class*="att"], #view li, #view button').filter({ hasText: /Sin marcar$/ }).first();
      if (await sin.count()) await sin.click().catch(() => {});
    } },

  // --- Cargas y contenidos ---
  { id: 'cargas', titulo: 'Cargas: metros por contenido frente a objetivos', opciones: DEMO, ruta: 'cargas' },
  { id: 'cargas-contenidos', titulo: 'Cargas: gestor de contenidos de entrenamiento', opciones: DEMO, ruta: 'cargas',
    paso: async (p) => { await boton(p, 'Contenidos de entrenamiento').click(); await p.locator('#cg-gestor *').first().waitFor(); await desplazar(p, '.cg-card:has(#cg-gestor)', 90); } },

  // --- Marcas, comunicaciones ---
  { id: 'marcas', titulo: 'Marcas: mejores marcas', opciones: DEMO, ruta: 'marcas' },
  { id: 'marcas-evolucion', titulo: 'Marcas: evolución de un nadador', opciones: DEMO, ruta: 'marcas',
    paso: async (p) => {
      await p.locator('#view select').first().selectOption({ label: 'Noa Díaz Llano' });
      // la lista de pruebas repite el catálogo y las pruebas con marcas: se elige la entrada que tiene marcas (la última)
      await p.locator('#view select').nth(1).evaluate((sel) => {
        const o = [...sel.options].filter((x) => x.text === '100 Libre').pop();
        sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await estable(p);
      await desplazar(p, '#view h3:has-text("Evolución")', 80);
    } },
  { id: 'comunicaciones', titulo: 'Comunicaciones', opciones: DEMO, ruta: 'comunicaciones' },

  // --- Planificación ---
  { id: 'temporada', titulo: 'Planificación de temporada: resumen, sugerencias y fases', opciones: DEMO, ruta: 'planificacion' },
  { id: 'temporada-grafico', titulo: 'Planificación de temporada: gráfico de evolución de cargas y competiciones', opciones: DEMO, ruta: 'planificacion',
    paso: async (p) => { await desplazar(p, '#tp-h-graf', 70); } },
  { id: 'temporada-semanas', titulo: 'Planificación de temporada: resumen semana a semana', opciones: DEMO, ruta: 'planificacion',
    dispositivos: ['escritorio'],
    paso: async (p) => { await desplazar(p, '#tp-h-tabla', 70); } },
  { id: 'temporada-detalle', titulo: 'Planificación de temporada: detalle de la semana actual (previsto frente a real)', opciones: DEMO, ruta: 'planificacion',
    paso: async (p) => {
      await p.locator('table[data-tabla=semanas] tr.tp-act .tp-sem-btn, button.tp-wk.tp-act').first().click();
      await p.locator('#tp-detalle').waitFor();
      await desplazar(p, '#tp-detalle', 90);
    } },
  { id: 'piscina', titulo: 'Planificación de piscina: calles, horarios y conflictos', opciones: DEMO, ruta: 'planificacion',
    paso: async (p) => {
      await p.locator('#pl-tab-piscina').click(); await estable(p);
      await p.getByRole('button', { name: 'Semana completa' }).click(); await estable(p);
    } },
  { id: 'piscina-conflictos', titulo: 'Planificación de piscina: panel de conflictos', opciones: DEMO, ruta: 'planificacion',
    paso: async (p) => {
      await p.locator('#pl-tab-piscina').click(); await estable(p);
      await p.getByText(/errores · \d+ avisos/).first().click(); await estable(p);
    } },

  // --- Calendario ---
  { id: 'calendario-mes', titulo: 'Calendario: mes', opciones: DEMO, ruta: 'calendario' },
  { id: 'calendario-semana', titulo: 'Calendario: semana', opciones: DEMO, ruta: 'calendario',
    paso: async (p) => { await boton(p, 'Semana').click(); await estable(p); } },
  { id: 'calendario-agenda', titulo: 'Calendario: agenda', opciones: DEMO, ruta: 'calendario',
    paso: async (p) => { await boton(p, 'Agenda').click(); await estable(p); } },
  { id: 'calendario-exportar', titulo: 'Calendario: exportar .ics y sincronizar con Google Calendar', opciones: DEMO, ruta: 'calendario',
    paso: async (p) => { await desplazar(p, 'h3:has-text("Llévate el calendario")', 80); } },

  // --- Configuración ---
  { id: 'club', titulo: 'Configuración: identidad del club', opciones: DEMO, ruta: 'club' },
  { id: 'club-categorias', titulo: 'Configuración: categorías de la temporada', opciones: DEMO, ruta: 'club',
    paso: async (p) => { await desplazar(p, '#catp-titulo', 80); } },
  { id: 'club-drive', titulo: 'Configuración: dónde se guardan los datos en Drive', opciones: DEMO, ruta: 'club',
    paso: async (p) => { await desplazar(p, 'h3:has-text("Dónde se guardan tus datos")', 80); } },

  // --- Tutorial ---
  { id: 'tutorial', titulo: 'Tutorial', opciones: DEMO, ruta: 'tutorial' },

  // --- Idiomas y tema oscuro ---
  { id: 'inicio-en', titulo: 'Inicio en inglés', opciones: DEMO, ruta: 'inicio', idioma: 'en', locale: 'en-GB', dispositivos: ['escritorio'] },
  { id: 'entrenamientos-it', titulo: 'Entrenamientos en italiano', opciones: DEMO, ruta: 'entrenamientos', idioma: 'it', locale: 'it-IT', dispositivos: ['escritorio'] },
  { id: 'temporada-en', titulo: 'Planificación de temporada en inglés', opciones: DEMO, ruta: 'planificacion', idioma: 'en', locale: 'en-GB', dispositivos: ['movil'] },
  { id: 'inicio-oscuro', titulo: 'Inicio en modo oscuro', opciones: DEMO, ruta: 'inicio', tema: 'dark' },
];

// ---------- Ejecución de un escenario ----------
async function ejecutar(navegador, baseURL, esc, disp) {
  const nombre = `${disp}-${esc.id}`;
  const ctx = await navegador.newContext({
    ...VISORES[disp], baseURL, locale: esc.locale || 'es-ES', timezoneId: ZONA, reducedMotion: 'reduce',
    colorScheme: esc.tema === 'dark' ? 'dark' : 'light', serviceWorkers: 'block', acceptDownloads: true,
  });
  const errores = [];
  try {
    await ctx.addInitScript(([o, lang, tema]) => {
      try {
        localStorage.setItem('cnl:test', '1');
        localStorage.setItem('cnl:test:opts', JSON.stringify(o));
        localStorage.setItem('cnl:lang', lang);
        if (tema) localStorage.setItem('cnl:tema', tema);
      } catch (e) { /* ignorar */ }
    }, [esc.opciones || DEMO, esc.idioma || 'es', esc.tema || '']);
    const p = await ctx.newPage();
    p.setDefaultTimeout(10000);
    await p.clock.setFixedTime(AHORA);
    p.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
    p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
    p.on('response', (r) => { if (r.url().startsWith(baseURL) && r.status() >= 400) errores.push(`HTTP ${r.status()} ${r.url()}`); });

    if (esc.sinShell) { await p.goto(`/#/${esc.ruta || ''}`); await estable(p, { espera: 400 }); }
    else await entrar(p, esc.ruta);
    if (esc.paso) await esc.paso(p, { navegador, disp });
    await estable(p);

    await p.mouse.move(1, 1); // sin elementos "hover" por el puntero de la última acción
    let png = esc.captura ? await esc.captura(p, { navegador, disp }) : null;
    if (!png) {
      const cuerpo = (await p.locator('body').innerText()).trim();
      if (cuerpo.length < 20) throw new Error('la pantalla está vacía');
      if (!esc.sinShell && (await p.locator('#view .loading').count())) throw new Error('la vista sigue en "Cargando"');
      png = await p.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', fullPage: !!esc.paginaCompleta });
    }
    if (errores.length) throw new Error('errores en la página:\n  ' + [...new Set(errores)].join('\n  '));
    if (png.length < 6000) throw new Error(`captura sospechosamente pequeña (${png.length} bytes)`);
    writeFileSync(join(SALIDA, `${nombre}.png`), png);
    return { nombre, kb: Math.round(png.length / 1024), ok: true };
  } catch (e) {
    return { nombre, ok: false, error: e.message.split('\n').slice(0, 6).join('\n') };
  } finally { await ctx.close().catch(() => {}); }
}

// ---------- Servidor y bucle principal ----------
const puertoLibre = () => new Promise((ok, ko) => {
  const s = createServer();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const puerto = await puertoLibre();
  const baseURL = `http://localhost:${puerto}`;
  const servidor = spawn(process.execPath, ['scripts/serve.mjs', String(puerto)], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('El servidor estático no arrancó')), 10_000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); ok(); } });
    servidor.once('exit', (c) => ko(new Error('El servidor terminó con código ' + c)));
  });
  const navegador = await chromium.launch();
  let fallos = 0;
  try {
    const tareas = [];
    for (const esc of ESCENARIOS) {
      if (SOLO && !SOLO.includes(esc.id)) continue;
      for (const disp of esc.dispositivos || ['escritorio', 'movil']) {
        if (DISP && DISP !== disp) continue;
        tareas.push([esc, disp]);
      }
    }
    if (!tareas.length) throw new Error('Ningún escenario coincide con los filtros');
    console.log(`Capturando ${tareas.length} pantallas (concurrencia ${CONCURRENCIA}) en ${SALIDA}`);
    const cola = [...tareas];
    const resultados = [];
    const trabajador = async () => {
      for (let t = cola.shift(); t; t = cola.shift()) {
        let r = await ejecutar(navegador, baseURL, t[0], t[1]);
        if (!r.ok) r = await ejecutar(navegador, baseURL, t[0], t[1]); // un reintento por si fue un parpadeo
        resultados.push(r);
        console.log(r.ok ? `  ok   ${r.nombre}.png (${r.kb} KB${r.kb > MAX_KB ? ' - supera ' + MAX_KB + ' KB' : ''})` : `  FALLO ${r.nombre}: ${r.error}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, tareas.length) }, trabajador));
    fallos = resultados.filter((r) => !r.ok).length;
    console.log(`\n${resultados.length - fallos} capturas generadas, ${fallos} con fallo.`);
  } finally {
    await navegador.close();
    servidor.removeAllListeners('exit');
    servidor.kill();
  }
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
