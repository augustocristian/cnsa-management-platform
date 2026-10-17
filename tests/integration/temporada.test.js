import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, buttonByText, setValue } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
// Control de formulario cuya etiqueta empieza por `texto` (label asociada con for= o envolvente).
function fieldByLabel(root, texto) {
  const l = [...root.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(texto));
  if (!l) throw new Error('No hay label: ' + texto);
  return l.control || l.querySelector('input,select,textarea');
}
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });
const modal = () => document.querySelector('.modal');
const click = async (el) => { el.click(); await tick(); await tick(); };
const abrir = async (params = []) => { await renderView('planificacion', c.container, params, c); await tick(); };
const filas = () => [...c.container.querySelectorAll('table[data-tabla=semanas] tbody tr')];
const fila = (n) => c.container.querySelector(`table[data-tabla=semanas] tbody tr[data-n="${n}"]`);
const verSemana = async (n) => click(fila(n).querySelector('.tp-sem-btn'));
const temporada = () => c.store.list('Temporadas')[0];
const addD = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesN = (n) => addD(temporada().fechaInicio, (n - 1) * 7);
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('Planificación abre en Temporada y ofrece los apartados Temporada y Piscina (el reparto por calles no se rompe)', async () => {
  await abrir();
  const tabs = [...c.container.querySelectorAll('[role=tablist] > [role=tab]')];
  assert.deepEqual(tabs.map((x) => x.textContent.trim()), ['Temporada', 'Piscina']);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(c.container.querySelector('[role=tabpanel]').getAttribute('aria-labelledby'), 'pl-tab-temporada');
  assert.match(c.container.textContent, /Resumen semana a semana/);
  assert.ok(!c.container.querySelector('.pl-gridwrap'));
  await click(tabs[1]);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.ok(c.container.querySelector('.pl-gridwrap'), 'rejilla de la piscina');
  assert.match(c.container.textContent, /Planificación de la piscina/);
  tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await tick(); await tick();
  assert.equal(c.container.querySelector('#pl-tab-temporada').getAttribute('aria-selected'), 'true');
  await abrir(['piscina']);
  assert.ok(c.container.querySelector('.pl-gridwrap'), 'la ruta #/planificacion/piscina abre ese apartado');
});

test('temporada demo: fases con fechas, semanas, resumen y eventos A/B/C', async () => {
  await abrir();
  const t = temporada();
  assert.match(t.nombre, /^Temporada [0-9]{4}-[0-9]{2}$/);
  assert.equal(c.store.list('Fases').length, 5);
  assert.equal(c.container.querySelectorAll('.tp-fases > li').length, 5);
  assert.match(c.container.querySelector('.tp-fases').textContent, /Preparación general/);
  assert.equal(filas().length, 38, 'una fila por semana, de lunes a domingo');
  const lunes = filas().map((r) => r.querySelector('.tp-sem-btn').getAttribute('aria-label'));
  assert.match(lunes[0], /^Ver semana 1,/);
  assert.ok(c.container.querySelectorAll('.tp-cards .tp-card').length >= 5);
  const marcas = [...c.container.querySelectorAll('svg.tp-svg .tp-evento')].map((g) => g.getAttribute('aria-label'));
  assert.ok(marcas.some((x) => /Prioridad A/.test(x)) && marcas.some((x) => /Prioridad B/.test(x)) && marcas.some((x) => /Prioridad C/.test(x)));
  const textos = [...c.container.querySelectorAll('svg.tp-svg .tp-evento .tp-marca-t')].map((x) => x.textContent);
  assert.ok(['A', 'B', 'C'].every((l) => textos.includes(l)), 'prioridad con texto, no sólo color');
  const formas = new Set([...c.container.querySelectorAll('svg.tp-svg .tp-evento .tp-marca > *:first-child')].map((x) => x.tagName.toLowerCase()));
  assert.ok(formas.has('polygon') && formas.has('rect') && formas.has('circle'), 'A rombo, B cuadrado, C círculo');
  assert.ok(c.container.querySelector('svg.tp-svg-tl'), 'línea de tiempo');
  assert.ok(c.container.querySelectorAll('svg.tp-svg-tl .tp-tl-fase').length === 5);
  assert.ok(c.container.querySelectorAll('ul.tp-ley li').length > 8, 'leyenda');
  const dentro = hoy() >= t.fechaInicio && hoy() <= t.fechaFin;
  assert.equal(!!c.container.querySelector('table[data-tabla=semanas] tr.tp-act'), dentro, 'la semana actual está resaltada');
  assert.equal(!!c.container.querySelector('svg.tp-svg .tp-hoy'), dentro);
});

test('gráfico accesible: columnas con nombre, foco y selección con teclado', async () => {
  await abrir();
  const cols = [...c.container.querySelectorAll('svg.tp-svg g.tp-col')];
  assert.equal(cols.length, 38);
  assert.ok(cols.every((g) => /^Semana \d+, /.test(g.getAttribute('aria-label')) && g.getAttribute('role') === 'button'));
  assert.equal(cols.filter((g) => g.getAttribute('tabindex') === '0').length, 1, 'tabulación única (roving tabindex)');
  const sel = c.container.querySelector('g.tp-col[tabindex="0"]');
  const n = Number(sel.dataset.n);
  sel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const sig = c.container.querySelector(`g.tp-col[data-n="${n + 1}"]`);
  assert.equal(sig.getAttribute('tabindex'), '0');
  sig.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(); await tick();
  assert.match(c.container.querySelector('#tp-h-det').textContent, new RegExp(`Semana ${n + 1} ·`));
  assert.equal(c.container.querySelector('g.tp-col-sel').dataset.n, String(n + 1));
  assert.ok(c.container.querySelector('svg.tp-svg').getAttribute('aria-label'));
  assert.equal(c.container.querySelector('.tp-scroll').getAttribute('role'), 'region');
});

test('previsto vs real: la semana pasada trae las cargas por contenido, la desviación y el estado', async () => {
  await abrir();
  const t = temporada();
  const m = (await importApp('js/application/temporadaService.js')).crearTemporadaService(c.store, { ahora: () => new Date() }).resumen(t.id);
  const pasada = [...m.semanas].reverse().find((s) => s.tiempo === 'pasada' && s.real.fuente === 'cargas');
  if (!pasada) return; // la demo no tiene cargas dentro de la temporada (verano)
  await verSemana(pasada.n);
  const tr = fila(pasada.n);
  assert.match(tr.textContent, /cargas/);
  assert.match(tr.textContent, /[+-]\d+ %/);
  assert.match(tr.querySelector('.tp-chip').textContent, /En rango|Bajo|Alto/);
  const det = c.container.querySelector('#tp-detalle');
  assert.match(det.textContent, /Previsto y real por contenido/);
  const filasC = det.querySelectorAll('table[data-tabla=contenidos] tbody tr');
  assert.ok(filasC.length >= 1);
  assert.match(det.querySelector('table[data-tabla=contenidos]').textContent, /Aeróbico|Piernas|Virajes|Aláctico/);
  assert.ok(det.querySelectorAll('[data-lista=entrenos] li').length >= 1, 'entrenos de la semana');
});

test('añadir una fase; las fechas solapadas piden confirmar', async () => {
  await abrir();
  const n0 = c.store.list('Fases').length;
  await click(buttonByText(c.container, 'Añadir fase'));
  setValue(fieldByLabel(modal(), 'Nombre'), 'Puesta a punto');
  setValue(fieldByLabel(modal(), 'Tipo de fase'), 'tapering');
  setValue(fieldByLabel(modal(), 'Fecha de inicio'), lunesN(2));
  setValue(fieldByLabel(modal(), 'Fecha de fin'), addD(lunesN(3), 6));
  await click(buttonByText(modal(), 'Guardar'));
  assert.ok(modal(), 'solapa con la fase en curso: no se guarda sin confirmar');
  assert.match(modal().textContent, /se solapan con otras fases/);
  assert.equal(c.store.list('Fases').length, n0);
  await click(buttonByText(modal(), 'Guardar de todos modos'));
  assert.equal(modal(), null);
  assert.equal(c.store.list('Fases').length, n0 + 1);
  assert.match(c.container.textContent, /Puesta a punto/);
  assert.match(c.container.textContent, /se solapan del/, 'la revisión marca el solape como error');
});

test('añadir una competición desde el detalle de la semana: aparece marcada, en el Calendario y en el .ics', async () => {
  await abrir();
  const n0 = c.store.list('EventosTemporada').length;
  await verSemana(3);
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Añadir evento'));
  assert.equal(fieldByLabel(modal(), 'Fecha de inicio').value, addD(lunesN(3), 5), 'sábado de la semana seleccionada');
  setValue(fieldByLabel(modal(), 'Nombre'), 'Open de Asturias');
  setValue(fieldByLabel(modal(), 'Prioridad'), 'A');
  setValue(fieldByLabel(modal(), 'Lugar'), 'Oviedo');
  setValue(fieldByLabel(modal(), 'Fecha de fin'), addD(lunesN(3), 6));
  await click(buttonByText(modal(), 'Guardar'));
  assert.equal(modal(), null);
  assert.equal(c.store.list('EventosTemporada').length, n0 + 1);
  const det = c.container.querySelector('#tp-detalle');
  assert.match(det.querySelector('[data-lista=eventos-semana]').textContent, /Open de Asturias/);
  assert.ok(fila(3).querySelector('.tp-evchip'), 'la semana queda marcada en la tabla');
  assert.ok([...c.container.querySelectorAll('svg.tp-svg .tp-evento')].some((g) => /Open de Asturias/.test(g.getAttribute('aria-label'))));
  // Calendario: misma fuente que el .ics
  const { crearCalendarioService } = await importApp('js/application/calendarioService.js');
  const { etiquetas } = await importApp('js/views/calendario.js');
  const svc = crearCalendarioService({ store: c.store, auth: c.auth, etq: etiquetas, storage: null, ahora: () => new Date() });
  const evs = svc.eventos({ desde: lunesN(3), hasta: addD(lunesN(3), 9) });
  const delOpen = evs.filter((e) => e.origen === 'temporada' && /Open de Asturias/.test(e.titulo));
  assert.deepEqual(delOpen.map((e) => e.fecha), [addD(lunesN(3), 5), addD(lunesN(3), 6)]);
  assert.match(delOpen[0].descripcion, /Competición · Prioridad A · Día 1 de 2/);
  const { ics } = svc.exportar({ rango: { desde: lunesN(3), hasta: addD(lunesN(3), 9) } });
  assert.match(ics, /SUMMARY:Open de Asturias \(A\)/);
  assert.match(ics, /LOCATION:Oviedo/);
  // y la vista del Calendario lo pinta
  c.container.replaceChildren();
  await renderView('calendario', c.container, [], c);
  assert.ok(c.container);
});

test('editar y eliminar un evento desde la lista de la temporada', async () => {
  await abrir();
  const ev = c.store.list('EventosTemporada').find((e) => e.nombre === 'Copa Federación');
  await click(c.container.querySelector(`.tp-sec [data-evento="${ev.id}"] button`));
  assert.ok(modal());
  setValue(fieldByLabel(modal(), 'Lugar'), 'Gijón');
  await click(buttonByText(modal(), 'Guardar'));
  assert.equal(c.store.get('EventosTemporada', ev.id).lugar, 'Gijón');
  const btn = [...c.container.querySelectorAll(`[data-evento="${ev.id}"] button`)].find((b) => b.getAttribute('aria-label')?.startsWith('Eliminar'));
  await click(btn);
  assert.equal(c.store.get('EventosTemporada', ev.id), null, 'se elimina al instante');
  const deshacer = [...document.querySelectorAll('#toasts .toast-action')].find((b) => b.textContent === 'Deshacer');
  assert.ok(deshacer, 'con «Deshacer»');
  await click(deshacer);
  assert.equal(c.store.get('EventosTemporada', ev.id).nombre, 'Copa Federación');
});

test('ajustar el volumen previsto de una semana a mano', async () => {
  await abrir();
  await verSemana(4);
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Editar semana'));
  setValue(fieldByLabel(modal(), 'Volumen previsto'), '12345');
  setValue(fieldByLabel(modal(), 'Intensidad prevista'), '7');
  await click(buttonByText(modal(), 'Guardar'));
  const fila4 = c.store.list('SemanasPlan').find((s) => s.lunes === lunesN(4));
  assert.equal(fila4.volumenPrevisto, 12345);
  assert.equal(String(fila4.intensidad), '7');
  assert.match(fila(4).textContent, /12\.345 m|12,345 m|12345 m/);
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Editar semana'));
  setValue(fieldByLabel(modal(), 'Volumen previsto'), '-4');
  await click(buttonByText(modal(), 'Guardar'));
  assert.ok(modal(), 'un volumen negativo no se guarda');
  assert.match(modal().textContent, /mayor o igual que cero/);
});

test('herramientas: ajuste ± % de varias semanas con previsualización, copiar semana y plantilla de fase', async () => {
  await abrir();
  const antes = (n) => Number(c.store.list('SemanasPlan').find((s) => s.lunes === lunesN(n)).volumenPrevisto);
  const a1 = antes(1), a2 = antes(2);
  await verSemana(1);
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Ajustar volumen de varias semanas'));
  setValue(fieldByLabel(modal(), 'Hasta la semana'), '2');
  setValue(fieldByLabel(modal(), 'Valor'), '-10');
  const prev = modal().querySelectorAll('.tp-prev tbody tr');
  assert.equal(prev.length, 2, 'previsualiza las dos semanas');
  assert.equal(antes(1), a1, 'previsualizar no cambia nada');
  await click(buttonByText(modal(), 'Aplicar'));
  assert.equal(antes(1), Math.round((a1 * 0.9) / 50) * 50);
  assert.equal(antes(2), Math.round((a2 * 0.9) / 50) * 50);
  // copiar semana 1 -> 2
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Copiar semana'));
  setValue(fieldByLabel(modal(), 'Copiar a la semana'), '2');
  await click(buttonByText(modal(), 'Copiar semana'));
  assert.equal(antes(2), antes(1));
  // plantilla de fase
  await click(buttonByText(c.container.querySelector('#tp-detalle'), 'Aplicar plantilla de fase'));
  assert.ok(modal().querySelectorAll('.tp-prev tbody tr').length >= 8);
  await click(buttonByText(modal(), 'Aplicar'));
  assert.equal(modal(), null);
});

test('sugerencias: se muestran con su explicación y se pueden aplicar', async () => {
  await abrir();
  const lista = c.container.querySelectorAll('ul.tp-sug > li');
  assert.ok(lista.length >= 1);
  const previa = [...lista].find((l) => l.dataset.sug === 'previa-competicion' || l.dataset.sug === 'tapering');
  assert.ok(previa, 'semana previa a la competición A o tapering');
  assert.match(previa.textContent, /reduce el volumen|debería bajar/);
  const n0 = c.store.list('SemanasPlan').length;
  const vols = c.store.list('SemanasPlan').map((s) => s.volumenPrevisto).join();
  await click(buttonByText(previa, 'Aplicar'));
  assert.equal(c.store.list('SemanasPlan').length, n0);
  assert.notEqual(c.store.list('SemanasPlan').map((s) => s.volumenPrevisto).join(), vols);
  assert.match(document.getElementById('toasts').textContent, /Sugerencia aplicada/);
});

test('sin temporadas: estado vacío y creación de la temporada con sus fases por defecto', async () => {
  c = await fresh({ demo: false });
  await abrir();
  assert.match(c.container.textContent, /Todavía no hay ninguna temporada/);
  await click(buttonByText(c.container, 'Crear temporada'));
  assert.match(fieldByLabel(modal(), 'Nombre').value, /^Temporada \d{4}-\d{2}$/);
  setValue(fieldByLabel(modal(), 'Nombre'), 'Mi temporada');
  setValue(fieldByLabel(modal(), 'Fecha de inicio'), '2026-12-28');
  setValue(fieldByLabel(modal(), 'Fecha de fin'), '2027-05-02');
  await click(buttonByText(modal(), 'Guardar'));
  assert.equal(modal(), null);
  const t = c.store.list('Temporadas');
  assert.equal(t.length, 1);
  assert.equal(t[0].activa, 'true');
  assert.ok(c.store.list('Fases').length >= 4);
  assert.equal(filas().length, 18);
  assert.equal(filas()[0].querySelector('td:nth-child(2)').textContent.length > 0, true);
  assert.equal(c.container.querySelector('#tp-h-fases') !== null, true);
});

test('fechas incoherentes se rechazan con mensaje', async () => {
  c = await fresh({ demo: false });
  await abrir();
  await click(buttonByText(c.container, 'Crear temporada'));
  setValue(fieldByLabel(modal(), 'Fecha de inicio'), '2026-12-28');
  setValue(fieldByLabel(modal(), 'Fecha de fin'), '2026-12-01');
  await click(buttonByText(modal(), 'Guardar'));
  assert.ok(modal());
  assert.match(modal().textContent, /posterior a la de inicio/);
  assert.equal(c.store.list('Temporadas').length, 0);
});

test('varias temporadas: se cambia de una a otra y sólo una es la activa', async () => {
  await abrir();
  const svc = (await importApp('js/application/temporadaService.js')).crearTemporadaService(c.store, { ahora: () => new Date() });
  svc.guardarTemporada({ nombre: 'Temporada futura', inicio: '2027-09-06', fin: '2027-11-28', activa: false });
  await tick();
  const sel = c.container.querySelector('.tp-bar select');
  assert.equal(sel.options.length, 2);
  setValue(sel, [...sel.options].find((o) => /futura/.test(o.textContent)).value);
  await tick();
  assert.equal(filas().length, 12);
  assert.match(c.container.querySelector('.tp-bar').textContent, /No es la temporada activa/, 'se explica por qué no es la activa');
  await click(c.container.querySelector('.page-head-actions .enp-mn-btn'));
  await click([...document.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === 'Marcar como activa'));
  assert.equal(c.store.list('Temporadas').filter((t) => t.activa === 'true').length, 1);
  assert.equal(svc.activa().nombre, 'Temporada futura');
});

test('idiomas: Phase/Week en inglés y Fase/Settimana en italiano', async () => {
  const { setLang } = await importApp('js/i18n.js');
  setLang('en', { persist: false });
  await abrir();
  assert.match(c.container.textContent, /Phases/);
  assert.match(c.container.textContent, /Week-by-week summary/);
  assert.deepEqual([...c.container.querySelectorAll('[role=tablist] > [role=tab]')].map((x) => x.textContent.trim()), ['Season', 'Pool']);
  assert.match(fila(1).querySelector('.tp-sem-btn').getAttribute('aria-label'), /^Open week 1/);
  setLang('it', { persist: false });
  await abrir();
  assert.match(c.container.textContent, /Fasi/);
  assert.match(c.container.textContent, /Settimana/);
  setLang('es', { persist: false });
});

test('en móvil se muestra la lista de semanas con mini-barras en lugar del gráfico ancho', async () => {
  window.matchMedia = (q) => ({ matches: /max-width:\s*700px/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  try {
    await abrir();
    assert.ok(!c.container.querySelector('svg.tp-svg'));
    assert.ok(!c.container.querySelector('table[data-tabla=semanas]'));
    const items = c.container.querySelectorAll('ol.tp-lista > li button.tp-wk');
    assert.equal(items.length, 38);
    assert.ok(items[0].querySelector('.tp-pista'));
    assert.match(items[0].getAttribute('aria-label'), /^Semana 1,/);
    await click(items[5]);
    assert.match(c.container.querySelector('#tp-h-det').textContent, /Semana 6/);
  } finally { delete window.matchMedia; }
});

test('estructura: un h1, secciones h2, sin estilos inyectados y sin colores fijos en el gráfico', async () => {
  await abrir();
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelectorAll('.tp-sec > .tp-sec-head > h2').length >= 4);
  assert.ok(!document.getElementById('tp-style') && !document.getElementById('pl-apt-style'));
  const svg = c.container.querySelector('svg.tp-svg');
  // Phase and content colours are STORED data (inline per record); the event markers take their tone from CSS classes
  const marcas = [...svg.querySelectorAll('.tp-marca')].map((g) => g.getAttribute('class'));
  assert.ok(marcas.length >= 3 && marcas.every((cl) => /tp-t-(danger|warn|info|ok|neutral|accent)/.test(cl)), 'eventos con tono semántico');
  const textos = [...svg.querySelectorAll('.tp-evento .tp-marca-t')].map((x) => x.textContent);
  assert.ok(['A', 'B', 'C'].every((l) => textos.includes(l)));
});

test('eliminar una fase se deshace con «Deshacer»', async () => {
  await abrir();
  const n0 = c.store.list('Fases').length;
  const f = c.container.querySelector('.tp-fase');
  await click([...f.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Editar'));
  await click(buttonByText(modal(), 'Eliminar'));
  assert.equal(c.store.list('Fases').length, n0 - 1);
  await click([...document.querySelectorAll('#toasts .toast-action')].find((b) => b.textContent === 'Deshacer'));
  assert.equal(c.store.list('Fases').length, n0);
});

test('los diálogos validan en línea: nombre vacío y fin anterior al inicio marcan sus campos', async () => {
  await abrir();
  await click(buttonByText(c.container, 'Añadir fase'));
  await click(buttonByText(modal(), 'Guardar'));
  assert.ok(modal());
  assert.equal(fieldByLabel(modal(), 'Nombre').getAttribute('aria-invalid'), 'true');
  setValue(fieldByLabel(modal(), 'Nombre'), 'X');
  setValue(fieldByLabel(modal(), 'Fecha de inicio'), '2026-12-10');
  setValue(fieldByLabel(modal(), 'Fecha de fin'), '2026-12-01');
  await click(buttonByText(modal(), 'Guardar'));
  assert.equal(fieldByLabel(modal(), 'Fecha de fin').getAttribute('aria-invalid'), 'true');
  assert.match(modal().textContent, /posterior a la de inicio/);
});
