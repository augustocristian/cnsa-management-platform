// Times (personal bests) view: filters (swimmer, event, pool, swimsuit), evolution chart, personal bests and paginated history.
// Presentation only: rules are in domain/marcas.js, domain/tiempos.js, domain/banadores.js and the services.
import { h, empty, toast } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tDate, locale } from '../i18n.js';
import { crearMarcasService } from '../application/marcasService.js';
import * as D from '../domain/marcas.js';
import { fmtTiempo } from '../domain/tiempos.js';
import { esActivo } from '../domain/nadadores.js';
import { nombreCompleto, ordenarPorApellidos } from '../domain/nombres.js';
import { banadorDeMarca } from '../domain/banadores.js';
import { abrirCatalogoBanadores, crearServicio as crearServicioBanadores, etiquetaBanadorTraducida, etiquetaTipoBanador } from './banadores-catalogo.js';
import { abrirRegistro } from './marcas-registro.js';
import { graficoEvolucion } from './marcas-grafico.js';
import { pruebaLabel } from './marcas-util.js';

// Filters survive navigation inside the session (per club): { clubId, filtros, recuerdo }.
let memoria = null;
const FILTROS_VACIOS = { nadadorId: '', prueba: '', piscina: '', tipo: '', marca: '', modelo: '' };

export async function render(container, params, ctx) {
  useStyles('marcas');
  const { store } = ctx;
  const ahora = ctx.ahora || (() => new Date());
  const svc = ctx.marcas || crearMarcasService(store);
  const banSvc = crearServicioBanadores(ctx);
  const clubId = store.clubRef ? store.clubRef.id : '';
  if (!memoria || memoria.clubId !== clubId) memoria = { clubId, filtros: { ...FILTROS_VACIOS }, recuerdo: {} };
  const state = { pagina: 1, destacar: '' };
  svc.migrarPruebas(); // canonical event names ("100 libre" -> "100 Libre"); no-op when already canonical

  const nombres = () => new Map(store.list('Nadadores').map((n) => [n.id, nombreCompleto(n)]));
  const campo = (etiqueta, control, clase) => h('div', { class: 'field' + (clase ? ' ' + clase : '') }, h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, etiqueta), control));
  const select = (clave, opciones, onChange) => h('select', { onchange: (e) => onChange(e.target.value) }, opciones.map((o) => h('option', { value: o.valor, selected: o.valor === memoria.filtros[clave] }, o.texto)));
  const cambiar = (patch) => { Object.assign(memoria.filtros, patch); state.pagina = 1; draw(); };

  function registrar() {
    const todas = svc.marcas();
    abrirRegistro({
      ctx, svc, banSvc, marcas: todas, hoy: hoyIso(ahora()),
      nadadores: store.list('Nadadores').filter(esActivo),
      recuerdo: { nadadorId: memoria.filtros.nadadorId || memoria.recuerdo.nadadorId || '', piscina: memoria.filtros.piscina || memoria.recuerdo.piscina || '25', prueba: memoria.recuerdo.prueba || '', fecha: memoria.recuerdo.fecha || '' },
      onRegistrada: (m) => { memoria.recuerdo = { nadadorId: m.nadadorId, piscina: String(m.piscina), prueba: m.prueba, fecha: m.fecha }; state.destacar = m.id; draw(); },
      onClose: () => container.querySelector('.mc-add')?.focus(),
    });
  }
  const hoyIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function barraFiltros(todas, nadadores, opBan) {
    const f = memoria.filtros;
    const pruebas = D.opcionesPruebas(todas);
    const todo = (k) => ({ valor: '', texto: t(k) });
    const conN = (o) => `${o.etiqueta || etiquetaTipoBanador(o.valor)} (${o.n})`;
    const tipos = [todo('marcas.f-tipo-todos'), ...opBan.tipos.map((o) => ({ valor: o.valor, texto: conN(o) })),
      ...(opBan.sinBanador > 0 ? [{ valor: 'sin-banador', texto: `${t('marcas.f-tipo-sin')} (${opBan.sinBanador})` }] : [])];
    return h('div', { class: 'filters mc-filters' },
      campo(t('marcas.filtro-nadador'), select('nadadorId', [todo('marcas.todos-nadadores'), ...nadadores.map((n) => ({ valor: n.id, texto: nombreCompleto(n) }))], (v) => cambiar({ nadadorId: v }))),
      campo(t('marcas.filtro-prueba'), select('prueba', [todo('marcas.todas-pruebas'), ...pruebas.map((p) => ({ valor: p.valor, texto: pruebaLabel(p.valor) }))], (v) => cambiar({ prueba: v }))),
      campo(t('marcas.filtro-piscina'), select('piscina', [todo('marcas.piscina-ambas'), ...D.PISCINAS.map((p) => ({ valor: p, texto: t('marcas.piscina-n', { n: p }) }))], (v) => cambiar({ piscina: v }))),
      campo(t('marcas.f-tipo'), select('tipo', tipos, (v) => cambiar({ tipo: v, marca: '', modelo: '' }))),
      campo(t('marcas.f-marca'), select('marca', [todo('marcas.f-todas'), ...opBan.marcas.map((o) => ({ valor: o.valor, texto: conN(o) }))], (v) => cambiar({ marca: v, modelo: '' }))),
      campo(t('marcas.f-modelo'), select('modelo', [todo('marcas.f-todas'), ...opBan.modelos.map((o) => ({ valor: o.valor, texto: `${o.etiqueta} (${o.n})` }))], (v) => cambiar({ modelo: v }))));
  }

  // Active filters as removable chips
  function chips(nad, opBan) {
    const f = memoria.filtros;
    const items = [];
    if (f.nadadorId) items.push(['nadadorId', nad.get(f.nadadorId) || t('marcas.desconocido')]);
    if (f.prueba) items.push(['prueba', pruebaLabel(f.prueba)]);
    if (f.piscina) items.push(['piscina', t('marcas.piscina-n', { n: f.piscina })]);
    if (f.tipo) items.push(['tipo', f.tipo === 'sin-banador' ? t('marcas.f-tipo-sin') : etiquetaTipoBanador(f.tipo)]);
    if (f.marca) items.push(['marca', (opBan.marcas.find((o) => o.valor === f.marca) || {}).etiqueta || f.marca]);
    if (f.modelo) items.push(['modelo', (opBan.modelos.find((o) => o.valor === f.modelo) || {}).etiqueta || f.modelo]);
    if (!items.length) return null;
    return h('div', { class: 'mc-chips', role: 'group', 'aria-label': t('marcas.chips-aria') },
      items.map(([k, texto]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', 'aria-label': t('marcas.chip-quitar', { f: texto }), onclick: () => cambiar({ [k]: '', ...(k === 'tipo' ? { marca: '', modelo: '' } : {}), ...(k === 'marca' ? { modelo: '' } : {}) }) }, texto, icon('cerrar', { size: 14 }))),
      items.length > 1 ? h('button', { type: 'button', class: 'btn btn-sm btn--ghost', onclick: () => cambiar({ ...FILTROS_VACIOS }) }, t('marcas.limpiar-filtros')) : null);
  }

  const celdaBanador = (m, banadores) => { const b = banadorDeMarca(m, banadores); return b ? etiquetaBanadorTraducida(b) : '—'; };
  const pb = () => h('span', { class: 'badge badge--ok mc-pb', title: t('marcas.pb-titulo') }, h('span', { 'aria-hidden': 'true' }, t('marcas.pb')), h('span', { class: 'sr-only' }, t('marcas.pb-titulo')));

  function tablaMejores(filas, nad, banadores) {
    if (!filas.length) return h('p', { class: 'muted' }, t('marcas.sin-marcas'));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', null, h('tr', null, ['prueba', 'piscina', 'nadador', 'mejor', 'banador', 'fecha', 'competicion'].map((k) => h('th', null, t('marcas.th-' + k))))),
      h('tbody', null, filas.map((m) => h('tr', null,
        h('td', { 'data-label': t('marcas.th-prueba') }, pruebaLabel(m.prueba)), h('td', { 'data-label': t('marcas.th-piscina') }, t('marcas.piscina-n', { n: m.piscina })),
        h('td', { 'data-label': t('marcas.th-nadador') }, nad.get(m.nadadorId) || t('marcas.desconocido')),
        h('td', { class: 'mc-time num', 'data-label': t('marcas.th-mejor') }, fmtTiempo(m.tiempoMs)),
        h('td', { class: 'mc-suit', 'data-label': t('marcas.th-banador') }, celdaBanador(m, banadores)),
        h('td', { 'data-label': t('marcas.th-fecha') }, tDate(m.fecha)), h('td', { 'data-label': t('marcas.th-competicion') }, m.competicion || '—'))))));
  }

  function tablaHistorial(lista, nad, banadores, pbIds) {
    const v = D.visibles(lista, state.pagina);
    if (!v.items.length) return h('p', { class: 'muted' }, t('marcas.sin-filtros'));
    const tabla = h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', null, h('tr', null, ['fecha', 'nadador', 'prueba', 'piscina', 'tiempo', 'banador', 'competicion'].map((k) => h('th', null, t('marcas.th-' + k))), h('th', null, h('span', { class: 'sr-only' }, t('marcas.eliminar'))))),
      h('tbody', null, v.items.map((m) => {
        const nombre = nad.get(m.nadadorId) || t('marcas.desconocido');
        return h('tr', { class: m.id === state.destacar ? 'is-new' : null, 'data-id': m.id },
          h('td', { 'data-label': t('marcas.th-fecha') }, tDate(m.fecha)), h('td', { 'data-label': t('marcas.th-nadador') }, nombre),
          h('td', { 'data-label': t('marcas.th-prueba') }, pruebaLabel(m.prueba)), h('td', { 'data-label': t('marcas.th-piscina') }, t('marcas.piscina-n', { n: m.piscina })),
          h('td', { class: 'mc-time num', 'data-label': t('marcas.th-tiempo') }, fmtTiempo(m.tiempoMs), pbIds.has(m.id) ? pb() : null),
          h('td', { class: 'mc-suit', 'data-label': t('marcas.th-banador') }, celdaBanador(m, banadores)),
          h('td', { 'data-label': t('marcas.th-competicion') }, m.competicion || '—'),
          h('td', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-sm btn--ghost btn-icon', 'aria-label': t('marcas.eliminar-aria', { nombre, fecha: tDate(m.fecha) }), onclick: () => {
            const fila = svc.eliminar(m.id);
            toast.undo(t('marcas.eliminada'), () => svc.restaurar(fila));
          } }, icon('borrar', { size: 18 }))));
      }))));
    return h('div', null, tabla, h('div', { class: 'mc-more' }, h('span', null, t('marcas.mostrando', { x: v.items.length, n: v.total })),
      v.hayMas ? h('button', { type: 'button', class: 'btn', onclick: () => { state.pagina += 1; draw(); } }, t('marcas.ver-mas', { n: v.restantes })) : null));
  }

  function draw() {
    const todas = svc.marcas();
    const banadores = banSvc.banadores();
    const nadadores = ordenarPorApellidos(store.list('Nadadores').filter(esActivo), locale());
    const nad = nombres();
    const accionesCabecera = h('div', { class: 'page-head-actions' },
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => abrirCatalogoBanadores(ctx, { onCambio: draw }) }, t('marcas.gestionar-banadores')),
      h('button', { type: 'button', class: 'btn btn--primary mc-add', onclick: registrar }, icon('mas', { size: 18 }), t('marcas.registrar-marca')));
    const cabecera = h('header', { class: 'page-head' }, h('h1', null, t('marcas.titulo')), accionesCabecera);
    const fab = h('button', { type: 'button', class: 'mc-fab', 'aria-label': t('marcas.registrar-marca'), onclick: registrar }, icon('mas', { size: 26 }));
    if (!todas.length) {
      container.replaceChildren(cabecera, empty({ icon: 'trofeo', title: t('marcas.vacio-titulo'), text: t('marcas.vacio-texto'), action: { label: t('marcas.registrar-marca'), onClick: registrar } }), fab);
      return;
    }
    const { filtro, opciones } = D.ajustarFiltroBanador({ tipo: memoria.filtros.tipo, marca: memoria.filtros.marca, modelo: memoria.filtros.modelo }, banadores, todas);
    Object.assign(memoria.filtros, filtro);
    const f = memoria.filtros;
    const base = D.filtrarPorBanador(todas, banadores, filtro);          // suit filter: it also decides which times are PB
    const visibles = D.filtrarMarcas(base, { nadadorId: f.nadadorId, prueba: f.prueba, piscina: f.piscina });
    const pbIds = D.idsMejorMarca(base);
    const serie = D.elegirSerie(base, { nadadorId: f.nadadorId, prueba: f.prueba, piscina: f.piscina });
    const textoBanador = (m) => { const b = banadorDeMarca(m, banadores); return b ? etiquetaBanadorTraducida(b) : ''; };
    const grafico = serie
      ? h('div', null, h('p', { class: 'mc-chart-title' }, t('marcas.evol-de', { nombre: nad.get(serie.nadadorId) || t('marcas.desconocido'), prueba: pruebaLabel(serie.prueba), piscina: serie.piscina || '—' })), graficoEvolucion(serie, { textoBanador }))
      : h('p', { class: 'muted' }, t('marcas.evol-vacio'));
    const card = (titulo, ...hijos) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, titulo)), ...hijos);
    container.replaceChildren(cabecera, barraFiltros(todas, nadadores, opciones), chips(nad, opciones),
      h('div', { class: 'mc-stack' },
        card(t('marcas.evolucion'), grafico),
        card(t('marcas.mejores'), tablaMejores(D.mejoresMarcas(visibles, (id) => nad.get(id) || ''), nad, banadores)),
        card(t('marcas.historial'), tablaHistorial(D.ordenarHistorial(visibles), nad, banadores, pbIds))), fab);
    if (state.destacar) { container.querySelector('tr.is-new')?.scrollIntoView?.({ block: 'nearest' }); state.destacar = ''; }
  }

  draw();
  if (store.on) {
    const off = store.on(() => { if (container.isConnected) draw(); else off(); });
    return off;
  }
  return undefined;
}
