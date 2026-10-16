import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

// Renders the Home view with an injected clock (default: the real one, which is what the demo data is relative to).
async function pintar(ahora) {
  const mod = await importApp('js/views/inicio.js');
  await mod.render(c.container, [], { store: c.store, auth: c.auth, ui: c.ui, ahora });
  await tick();
  return c.container;
}
// Wednesday of the current week at 18:00: the demo has sessions on it for the Promocion (17:30) and Infantil-Junior (19:30) groups.
const miercoles18 = () => {
  const d = new Date(); d.setHours(18, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 2);
  return () => new Date(d);
};
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hrefs = (root) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

test('inicio con datos de demostración: siete tarjetas, un solo h1 y estilos por hoja de estilos', async () => {
  const root = await pintar();
  assert.equal(root.querySelectorAll('h1').length, 1);
  assert.equal(root.querySelectorAll('.ini-grid > .ini-card').length, 7, 'sin huecos: 3+3+(1+2)... 7 tarjetas');
  const titulos = [...root.querySelectorAll('.ini-card > .card-head h2')].map((h) => h.textContent);
  assert.deepEqual(titulos, ['Hoy', 'Asistencia hoy', 'Alertas de cargas', 'Acciones rápidas', 'Carga semanal del club', 'Avisos recientes', 'Próximo evento de la temporada']);
  assert.equal(document.querySelectorAll('style').length, 0, 'ninguna vista inyecta <style>');
  assert.ok(document.head.querySelector('link[data-view-css="inicio"]'));
  assert.doesNotMatch(root.textContent, /undefined|NaN|\[object|home\.[a-z]/);
  const sinAvisos = [...root.querySelectorAll('.ini-card:not(#ini-avisos)')].map((x) => x.textContent).join(' '); // notes are user content
  assert.doesNotMatch(sinAvisos, /ba[ñn]ador|swimsuit/i);
  assert.equal(root.querySelector('a[href*="banador"]'), null);
  assert.equal(root.querySelector('#primeros-pasos'), null, 'con datos no hay primeros pasos');
});

test('inicio: el banner resume el día y la tarjeta Hoy ofrece pasar lista de la sesión en curso', async () => {
  const root = await pintar(miercoles18());
  assert.match(root.querySelector('.ini-headline').textContent, /^Hoy: \d+ sesiones? · \d+ nadadores? esperados?/);
  const sesiones = root.querySelectorAll('#ini-hoy .ini-sesion');
  assert.ok(sesiones.length >= 2);
  assert.ok(sesiones[0].classList.contains('ini-sesion--en-curso'), 'a las 18:00 la sesión de las 17:30 está en curso');
  assert.match(sesiones[0].textContent, /En curso/);
  assert.match(sesiones[sesiones.length - 1].textContent, /Pendiente/);
  const lista = root.querySelector('#ini-hoy a.btn--primary');
  assert.equal(lista.textContent.trim(), 'Pasar lista');
  const e = c.store.list('Entrenamientos').find((x) => x.hora === '17:30' && x.fecha === isoDe(miercoles18()()));
  assert.equal(lista.getAttribute('href'), `#/asistencia/${e.id}`);
});

test('inicio: los contadores de asistencia coinciden con el módulo Asistencia', async () => {
  const { nadadoresDeSesion, resumenSesion } = await importApp('js/domain/asistencia.js');
  const root = await pintar(miercoles18());
  const hoy = [...root.querySelectorAll('#ini-hoy .ini-sesion')].length;
  assert.ok(hoy >= 2);
  const fecha = isoDe(miercoles18()());
  const sesiones = c.store.list('Entrenamientos').filter((s) => s.fecha === fecha);
  let pres = 0, aus = 0, just = 0, sin = 0, esp = 0;
  for (const s of sesiones) {
    const nads = nadadoresDeSesion(s, c.store.list('Nadadores'));
    const r = resumenSesion(nads, c.store.list('Asistencia').filter((a) => a.entrenamientoId === s.id));
    pres += r.presente; aus += r.ausente; just += r.justificado; sin += r.sinMarcar; esp += r.total;
  }
  const leg = [...root.querySelectorAll('#ini-asistencia .ini-leg li')].map((li) => [li.querySelector('.ini-leg-et').textContent, Number(li.querySelector('strong').textContent)]);
  assert.deepEqual(leg, [['Presentes', pres], ['Ausentes', aus], ['Justificados', just], ['Sin confirmar', sin]]);
  assert.match(root.querySelector('#ini-asistencia svg.ini-donut').getAttribute('aria-label'), new RegExp(`${pres} presentes de ${esp} esperados`));
  assert.equal(root.querySelectorAll('#ini-asistencia .ini-asis-sesiones li').length, sesiones.length);
});

test('inicio: gráfico semanal accesible (role=img + tabla) y alertas con el componente .alert', async () => {
  const root = await pintar(miercoles18());
  const svg = root.querySelector('#ini-grafico svg.ini-svg');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.ok(svg.getAttribute('aria-labelledby'));
  assert.equal(root.querySelectorAll('#ini-grafico table.sr-only tbody tr').length, 7);
  assert.ok(root.querySelectorAll('#ini-grafico .ini-future').length >= 4, 'los días por llegar se dibujan vacíos, no como cero');
  assert.ok(root.querySelector('#ini-grafico [role="region"][tabindex="0"]'), 'desplazable con teclado en móvil');
  const textosEje = [...svg.querySelectorAll('.ini-axis')].map((x) => x.textContent);
  assert.ok(textosEje.some((x) => /^\d+k?$|^\d+[.,]5k$/.test(x)), 'marcas redondas: ' + textosEje.join(','));
  const alertas = [...root.querySelectorAll('#ini-alertas .alert')];
  assert.ok(alertas.length > 0);
  for (const a of alertas) {
    assert.ok(a.querySelector('svg.icon'), 'icono en cada alerta');
    assert.match(a.textContent, /(Faltan|Exceso de) [\d.]+ m|Todas las cargas|Aún no hay/);
  }
  assert.doesNotMatch(document.documentElement.outerHTML, /#f29900/i, 'no fixed warning-orange text');
});

test('inicio: las acciones rápidas llevan a la tarea y la tarjeta de avisos muestra destinatario y fecha relativa', async () => {
  const root = await pintar(miercoles18());
  const acc = [...root.querySelectorAll('#ini-acciones a.ini-accion')];
  assert.deepEqual(acc.map((a) => a.textContent.trim()), ['Pasar lista', 'Registrar carga', 'Nueva marca', 'Nuevo aviso']);
  assert.deepEqual(acc.slice(1).map((a) => a.getAttribute('href')), ['#/cargas/nueva', '#/marcas/nueva', '#/comunicaciones/nueva']);
  location.hash = '';
  acc[1].click();
  await tick();
  assert.equal(location.hash, '#/cargas/nueva');
  const avisos = root.querySelectorAll('#ini-avisos .ini-aviso');
  assert.ok(avisos.length >= 1 && avisos.length <= 4);
  for (const a of avisos) {
    assert.ok(a.querySelector('.badge'), 'chip de destinatario');
    assert.ok(a.querySelector('time[datetime]'), 'fecha relativa');
    assert.ok(a.querySelector('.ini-aviso-texto').textContent.length > 0, 'vista previa');
  }
  assert.equal(root.querySelector('#ini-evento .ini-evento-nombre') !== null || root.querySelector('#ini-evento .empty') !== null, true);
});

test('inicio con el club vacío: cada tarjeta es un estado vacío con una acción y aparecen los primeros pasos', async () => {
  c = await fresh({ demo: false });
  const root = await pintar();
  const tarjetas = [...root.querySelectorAll('.ini-grid > .ini-card')];
  assert.equal(tarjetas.length, 7);
  for (const t of tarjetas.filter((x) => x.id !== 'ini-acciones')) {
    assert.ok(t.querySelector('.empty'), `${t.id} sin estado vacío`);
    assert.ok(t.querySelector('.empty a.btn[href^="#/"]'), `${t.id} sin llamada a la acción`);
  }
  const pp = root.querySelector('#primeros-pasos');
  assert.ok(pp);
  assert.deepEqual(hrefs(pp).filter((h) => h.startsWith('#/')), ['#/grupos', '#/nadadores', '#/planificacion/piscina', '#/entrenamientos']);
  assert.match(pp.textContent, /0 de 4 pasos hechos/);
  assert.equal(root.querySelector('.ini-headline').textContent, 'Hoy no hay sesiones y no hay ninguna programada.');
  assert.doesNotMatch(root.textContent, /undefined|NaN|\[object|home\.[a-z]/);
});

test('primeros pasos: se marcan solos al completarse y se pueden ocultar (por club)', async () => {
  c = await fresh({ demo: false });
  c.store.upsert('Grupos', { nombre: 'Alevín', categoria: 'Alevín', entrenador: '' });
  let root = await pintar();
  let pp = root.querySelector('#primeros-pasos');
  assert.match(pp.textContent, /1 de 4 pasos hechos/);
  assert.equal(pp.querySelectorAll('li.pp-hecho').length, 1);
  assert.equal(pp.querySelector('li.pp-hecho .sr-only').textContent.trim(), '(hecho)');
  pp.querySelector('#pp-ocultar').click();
  await tick();
  assert.equal(root.querySelector('#primeros-pasos'), null);
  root = await pintar();
  assert.equal(root.querySelector('#primeros-pasos'), null, 'sigue oculta al volver a pintar');
});

test('inicio se traduce a inglés e italiano sin claves sueltas', async () => {
  const { setLang } = await importApp('js/i18n.js');
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
    assert.deepEqual([...root.querySelectorAll('#ini-acciones a')].map((a) => a.textContent.trim()), ['Take attendance', 'Log load', 'New mark', 'New note']);
  } finally { setLang('es', { persist: false }); }
});

test('las hojas de estilo de inicio y acceso solo usan tokens (sin colores fijos)', async () => {
  const { readFileSync } = await import('node:fs');
  const { ROOT } = await import('../helpers/env.js');
  for (const f of ['css/views/inicio.css', 'css/views/acceso.css']) {
    const css = readFileSync(`${ROOT}/${f}`, 'utf8');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i, f);
  }
});
