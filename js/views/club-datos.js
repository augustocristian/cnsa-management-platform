// Settings cards about data: Drive connection status and copies, preferences sync, and switching club.
// The connection itself is managed from the header menu; here the person only sees its status. In demo mode nothing is
// written to Drive, so the Drive-only actions are disabled with an explanation.
import { h, toast } from '../ui.js';
import { t } from '../i18n.js';
import { preferencias } from '../preferencias.js';
import { servicioCategorias } from './categorias-panel.js';
import { confirmarImportacion, textoErrorImportacion } from './datos-integridad.js';

const TONO = { sincronizado: 'ok', pendiente: 'warn', error: 'danger', offline: 'neutral', demo: 'info' };

// Visible state of the connection: 'demo' or the store status.
const estadoDe = (store) => (store.mode === 'demo' ? 'demo' : (['sincronizado', 'pendiente', 'error', 'offline'].includes(store.status) ? store.status : 'sincronizado'));

function pintarEstado(el, store) {
  const e = estadoDe(store);
  el.className = `badge badge--${TONO[e]}`;
  el.textContent = t('shell.drive.' + e);
  return el;
}

// Button that is disabled in demo mode when it needs Drive; `nota` is the id of the text that explains why.
const boton = (props, texto, soloDrive, demo, nota = 'clb-demo-nota') =>
  h('button', { type: 'button', ...props, disabled: soloDrive && demo ? true : null, 'aria-describedby': soloDrive && demo ? nota : null }, texto);

// ctx: {store, desconectar?, conexion?}. svc: clubService. recargar(): redraws Settings. -> Node
export function tarjetaDatos(ctx, svc, recargar) {
  const { store } = ctx;
  const demo = svc.esDemo();
  const estado = pintarEstado(h('span', { id: 'clb-estado' }), store);
  if (store.on) { const off = store.on(() => { if (estado.isConnected) pintarEstado(estado, store); else off(); }); }

  const sincronizar = boton({ class: 'btn btn--primary', onclick: async () => {
    try { await store.sync(); toast(t('club.sincronizado')); } catch (e) { toast.error(t('club.errSync', { msg: e.message })); }
  } }, t('club.sincronizar'), true, demo);
  const exportar = boton({ class: 'btn', onclick: async () => { try { await store.exportXlsx(); } catch (e) { toast.error(t('club.errExport', { msg: e.message })); } } }, t('club.exportar'));
  const guardarXlsx = boton({ class: 'btn', id: 'clb-guardar-xlsx', onclick: async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try { toast(t('club.xlsxGuardado', { nombre: (await store.guardarXlsxEnDrive()).name })); } catch (e) { toast.error(t('club.errExport', { msg: e.message })); }
    b.disabled = false;
  } }, t('club.guardarXlsx'), true, demo);

  // Import: a hidden file input driven by a translated button.
  const archivo = h('input', { type: 'file', accept: '.xlsx', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  const importar = boton({ class: 'btn', onclick: () => archivo.click() }, t('club.importar'));
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    try {
      const previa = await store.previsualizarXlsx(f); // per-sheet counts; nothing changes until confirmed
      if (!(await confirmarImportacion(previa))) { archivo.value = ''; return; }
      await store.importXlsx(previa); // a backup is saved to cnl/backups first
      servicioCategorias(ctx).alAbrirClub();
      toast(t('club.importado'));
      await recargar();
    } catch (e) { toast.error(t('club.errImport', { msg: textoErrorImportacion(e) })); }
    archivo.value = '';
  });

  const ubicacion = svc.ubicacion();
  const enlaces = [];
  if (!demo && ubicacion.ficheroUrl) {
    enlaces.push(h('a', { class: 'btn', id: 'clb-abrir-fichero', href: ubicacion.ficheroUrl, target: '_blank', rel: 'noopener noreferrer' }, t('club.abrirFichero')));
    enlaces.push(h('button', { type: 'button', class: 'btn', id: 'clb-abrir-carpeta', onclick: async () => {
      try { window.open(await svc.urlCarpeta(), '_blank', 'noopener'); } catch (e) { toast.error(e.message || String(e)); }
    } }, t('club.abrirCarpeta')));
  }
  // Connection actions are offered when the shell provides them (they also live in the header menu).
  const conexion = demo
    ? [ctx.conexion && h('button', { type: 'button', class: 'btn btn--primary', onclick: () => ctx.conexion.conectarDesdeDemo() }, t('shell.demo.conectar')),
      ctx.conexion && h('button', { type: 'button', class: 'btn', onclick: () => ctx.conexion.salirDeDemo() }, t('shell.demo.salir'))]
    : [ctx.desconectar && h('button', { type: 'button', class: 'btn', id: 'clb-desconectar', onclick: () => ctx.desconectar() }, t('shell.desconectar'))];

  return h('section', { class: 'card clb-card', 'aria-labelledby': 'clb-datos-t' },
    h('div', { class: 'card-head' }, h('h2', { id: 'clb-datos-t' }, t('club.datos')), estado),
    demo ? h('div', { class: 'alert alert--info', id: 'clb-demo-nota' }, h('p', null, t('club.demo-nota')))
      : h('p', null, t('club.dondeTexto', { nombre: ubicacion.nombre })),
    h('div', { class: 'clb-botones' }, sincronizar, exportar, guardarXlsx, importar, archivo),
    enlaces.length ? h('div', { class: 'clb-botones' }, enlaces) : null,
    conexion.filter(Boolean).length ? h('div', { class: 'clb-botones' }, conexion.filter(Boolean)) : null);
}

// Preferences stored in cnl/preferencias.json (language, tutorial progress, calendar...)
export function tarjetaPreferencias(ctx, svc) {
  const demo = svc.esDemo();
  const estado = h('p', { class: 'muted', id: 'clb-prefs-estado', 'aria-live': 'polite' });
  const pintar = () => { estado.textContent = t('club.prefsEstado', { estado: t('prefs.estado.' + preferencias.estado) }); };
  pintar();
  const off = preferencias.on(() => { if (estado.isConnected) pintar(); else off(); });
  const sincronizar = boton({ class: 'btn', onclick: async () => {
    const r = await preferencias.sincronizar();
    pintar();
    if (r.ok) toast(t('club.prefsSincronizadas')); else toast.error(t('club.errSync', { msg: (r.error && r.error.message) || '' }));
  } }, t('club.prefsSincronizar'), true, demo, 'clb-prefs-demo');
  return h('section', { class: 'card clb-card', 'aria-labelledby': 'clb-prefs-t' },
    h('h2', { id: 'clb-prefs-t' }, t('club.prefsTitulo')), h('p', null, t('club.prefsTexto')), estado,
    demo ? h('p', { class: 'hint', id: 'clb-prefs-demo' }, t('club.solo-drive')) : null, h('div', { class: 'clb-botones' }, sincronizar));
}

// Switch to another club (or create one): forces the club picker on the next start.
export function tarjetaClubes(svc) {
  const demo = svc.esDemo();
  const cambiar = boton({ class: 'btn', id: 'clb-cambiar', onclick: async () => {
    try { sessionStorage.setItem('cnl:elegir', '1'); } catch (e) { /* storage blocked: the picker just will not be forced */ }
    await preferencias.flush();
    location.hash = '';
    location.reload();
  } }, t('club.cambiarClub'), true, demo, 'clb-clubes-demo');
  return h('section', { class: 'card clb-card', 'aria-labelledby': 'clb-clubes-t' },
    h('h2', { id: 'clb-clubes-t' }, t('club.clubesTitulo')),
    demo ? h('p', { class: 'hint', id: 'clb-clubes-demo' }, t('club.solo-drive')) : null,
    h('div', { class: 'clb-botones' }, cambiar));
}
