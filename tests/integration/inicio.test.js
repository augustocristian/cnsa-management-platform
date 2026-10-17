import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh();
    return fn(t);
  });

// Renders the Home view with an injected clock (default: the real one, which is what the demo data is relative to).
async function pintar(ahora) {
  const mod = await importApp('js/presentation/views/inicio.js');
  await mod.render(c.container, [], { ...c.servicios, store: c.store, auth: c.auth, ui: c.ui, ahora });
  await tick();
  return c.container;
}
// Wednesday of the current week at 18:00: the demo has sessions on it for the Promocion (17:30) and Infantil-Junior (19:30) groups.
const miercoles18 = () => {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 2);
  return () => new Date(d);
};
const isoDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hrefs = (root) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

test('home with demo data: seven cards, a single h1 and styles via stylesheet', async () => {
  const root = await pintar();
  assert.equal(root.querySelectorAll('h1').length, 1);
  assert.equal(root.querySelectorAll('.ini-grid > .ini-card').length, 7, 'no gaps: 3+3+(1+2)... 7 cards');
  const titulos = [...root.querySelectorAll('.ini-card > .card-head h2')].map((h) => h.textContent);
  assert.deepEqual(titulos, [
    'Hoy',
    'Asistencia hoy',
    'Alertas de cargas',
    'Acciones rápidas',
    'Carga semanal del club',
    'Avisos recientes',
    'Próximo evento de la temporada',
  ]);
  assert.equal(document.querySelectorAll('style').length, 0, 'no view injects <style>');
  assert.ok(document.head.querySelector('link[data-view-css="inicio"]'));
  assert.doesNotMatch(root.textContent, /undefined|NaN|\[object|home\.[a-z]/);
  const sinAvisos = [...root.querySelectorAll('.ini-card:not(#ini-avisos)')].map((x) => x.textContent).join(' '); // notes are user content
  assert.doesNotMatch(sinAvisos, /ba[ñn]ador|swimsuit/i);
  assert.equal(root.querySelector('a[href*="banador"]'), null);
  assert.equal(root.querySelector('#primeros-pasos'), null, 'with data there is no getting-started card');
});

test('home: the banner summarises the day and the Today card offers taking attendance for the ongoing session', async () => {
  const root = await pintar(miercoles18());
  assert.match(root.querySelector('.ini-headline').textContent, /^Hoy: \d+ sesiones? · \d+ nadadores? esperados?/);
  const sesiones = root.querySelectorAll('#ini-hoy .ini-sesion');
  assert.ok(sesiones.length >= 2);
  assert.ok(sesiones[0].classList.contains('ini-sesion--en-curso'), 'at 18:00 the 17:30 session is ongoing');
  assert.match(sesiones[0].textContent, /En curso/);
  assert.match(sesiones[sesiones.length - 1].textContent, /Pendiente/);
  const lista = root.querySelector('#ini-hoy a.btn--primary');
  assert.equal(lista.textContent.trim(), 'Pasar lista');
  const e = c.store.list('Entrenamientos').find((x) => x.hora === '17:30' && x.fecha === isoDe(miercoles18()()));
  assert.equal(lista.getAttribute('href'), `#/asistencia/${e.id}`);
});

test('home: attendance counters match the Attendance module', async () => {
  const { nadadoresDeSesion, resumenSesion } = await importApp('js/domain/asistencia.js');
  const root = await pintar(miercoles18());
  const hoy = [...root.querySelectorAll('#ini-hoy .ini-sesion')].length;
  assert.ok(hoy >= 2);
  const fecha = isoDe(miercoles18()());
  const sesiones = c.store.list('Entrenamientos').filter((s) => s.fecha === fecha);
  let pres = 0,
    aus = 0,
    just = 0,
    sin = 0,
    esp = 0;
  for (const s of sesiones) {
    const nads = nadadoresDeSesion(s, c.store.list('Nadadores'));
    const r = resumenSesion(
      nads,
      c.store.list('Asistencia').filter((a) => a.entrenamientoId === s.id),
    );
    pres += r.presente;
    aus += r.ausente;
    just += r.justificado;
    sin += r.sinMarcar;
    esp += r.total;
  }
  const leg = [...root.querySelectorAll('#ini-asistencia .ini-leg li')].map((li) => [
    li.querySelector('.ini-leg-et').textContent,
    Number(li.querySelector('strong').textContent),
  ]);
  assert.deepEqual(leg, [
    ['Presentes', pres],
    ['Ausentes', aus],
    ['Justificados', just],
    ['Sin confirmar', sin],
  ]);
  assert.match(
    root.querySelector('#ini-asistencia svg.ini-donut').getAttribute('aria-label'),
    new RegExp(`${pres} presentes de ${esp} esperados`),
  );
  assert.equal(root.querySelectorAll('#ini-asistencia .ini-asis-sesiones li').length, sesiones.length);
});

test('home: accessible weekly chart (role=img + table) and alerts using the .alert component', async () => {
  const root = await pintar(miercoles18());
  const svg = root.querySelector('#ini-grafico svg.ini-svg');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.ok(svg.getAttribute('aria-labelledby'));
  assert.equal(root.querySelectorAll('#ini-grafico table.sr-only tbody tr').length, 7);
  assert.ok(
    root.querySelectorAll('#ini-grafico .ini-future').length >= 4,
    'upcoming days are drawn empty, not as zero',
  );
  assert.ok(root.querySelector('#ini-grafico [role="region"][tabindex="0"]'), 'keyboard-scrollable on mobile');
  const textosEje = [...svg.querySelectorAll('.ini-axis')].map((x) => x.textContent);
  assert.ok(
    textosEje.some((x) => /^\d+k?$|^\d+[.,]5k$/.test(x)),
    'round ticks: ' + textosEje.join(','),
  );
  const alertas = [...root.querySelectorAll('#ini-alertas .alert')];
  assert.ok(alertas.length > 0);
  for (const a of alertas) {
    assert.ok(a.querySelector('svg.icon'), 'icon in every alert');
    assert.match(a.textContent, /(Faltan|Exceso de) [\d.]+ m|Todas las cargas|Aún no hay/);
  }
  assert.doesNotMatch(document.documentElement.outerHTML, /#f29900/i, 'no fixed warning-orange text');
});

test('home: quick actions lead to the task and the notices card shows recipient and relative date', async () => {
  const root = await pintar(miercoles18());
  const acc = [...root.querySelectorAll('#ini-acciones a.ini-accion')];
  assert.deepEqual(
    acc.map((a) => a.textContent.trim()),
    ['Pasar lista', 'Registrar carga', 'Nueva marca', 'Nuevo aviso'],
  );
  assert.deepEqual(
    acc.slice(1).map((a) => a.getAttribute('href')),
    ['#/cargas/nueva', '#/marcas/nueva', '#/comunicaciones/nueva'],
  );
  location.hash = '';
  acc[1].click();
  await tick();
  assert.equal(location.hash, '#/cargas/nueva');
  const avisos = root.querySelectorAll('#ini-avisos .ini-aviso');
  assert.ok(avisos.length >= 1 && avisos.length <= 4);
  for (const a of avisos) {
    assert.ok(a.querySelector('.badge'), 'recipient chip');
    assert.ok(a.querySelector('time[datetime]'), 'relative date');
    assert.ok(a.querySelector('.ini-aviso-texto').textContent.length > 0, 'preview');
  }
  assert.equal(
    root.querySelector('#ini-evento .ini-evento-nombre') !== null || root.querySelector('#ini-evento .empty') !== null,
    true,
  );
});

test('home with an empty club: every card is an empty state with an action and the getting-started steps appear', async () => {
  c = await fresh({ demo: false });
  const root = await pintar();
  const tarjetas = [...root.querySelectorAll('.ini-grid > .ini-card')];
  assert.equal(tarjetas.length, 7);
  for (const t of tarjetas.filter((x) => x.id !== 'ini-acciones')) {
    assert.ok(t.querySelector('.empty'), `${t.id} has no empty state`);
    assert.ok(t.querySelector('.empty a.btn[href^="#/"]'), `${t.id} has no call to action`);
  }
  const pp = root.querySelector('#primeros-pasos');
  assert.ok(pp);
  assert.deepEqual(
    hrefs(pp).filter((h) => h.startsWith('#/')),
    ['#/grupos', '#/nadadores', '#/planificacion/piscina', '#/entrenamientos'],
  );
  assert.match(pp.textContent, /0 de 4 pasos hechos/);
  assert.equal(root.querySelector('.ini-headline').textContent, 'Hoy no hay sesiones y no hay ninguna programada.');
  assert.doesNotMatch(root.textContent, /undefined|NaN|\[object|home\.[a-z]/);
});

test('getting started: steps tick themselves when completed and can be hidden (per club)', async () => {
  c = await fresh({ demo: false });
  c.store.upsert('Grupos', { nombre: 'Alevín', categoria: 'Alevín', entrenador: '' });
  let root = await pintar();
  const pp = root.querySelector('#primeros-pasos');
  assert.match(pp.textContent, /1 de 4 pasos hechos/);
  assert.equal(pp.querySelectorAll('li.pp-hecho').length, 1);
  assert.equal(pp.querySelector('li.pp-hecho .sr-only').textContent.trim(), '(hecho)');
  pp.querySelector('#pp-ocultar').click();
  await tick();
  assert.equal(root.querySelector('#primeros-pasos'), null);
  root = await pintar();
  assert.equal(root.querySelector('#primeros-pasos'), null, 'stays hidden after re-rendering');
});

test('home is translated to English and Italian with no stray keys', async () => {
  const { setLang } = await importApp('js/presentation/i18n/i18n.js');
  try {
    for (const l of ['en', 'it']) {
      setLang(l, { persist: false });
      const root = await pintar(miercoles18());
      assert.doesNotMatch(root.textContent, /home\.[a-z]|undefined|NaN/, l);
      assert.ok(root.querySelector('.ini-headline').textContent.length > 5);
    }
    setLang('en', { persist: false });
    const root = await pintar(miercoles18());
    assert.equal(root.querySelector('#ini-hoy a.btn--primary').textContent.trim(), 'Take attendance');
    assert.deepEqual(
      [...root.querySelectorAll('#ini-acciones a')].map((a) => a.textContent.trim()),
      ['Take attendance', 'Log load', 'New mark', 'New note'],
    );
  } finally {
    setLang('es', { persist: false });
  }
});

test('the home and access stylesheets only use tokens (no fixed colours)', async () => {
  const { readFileSync } = await import('node:fs');
  const { ROOT } = await import('../helpers/env.js');
  for (const f of ['css/views/inicio.css', 'css/views/acceso.css']) {
    const css = readFileSync(`${ROOT}/${f}`, 'utf8');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, f);
  }
});
