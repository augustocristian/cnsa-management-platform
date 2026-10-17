// Screens shown before (or instead of) the shell: start/connect, "configuration needed", club picker, first-run wizard,
// error and recovery screens. They only present; decisions live in application/sesionService.js and application/asistenteClub.js.
import { h, toast, sheet, confirmDialog } from '../../ui.js';
import * as ui from '../../ui.js';
import { t } from '../../i18n.js';
import { langSwitch } from '../../lang-switch.js';
import * as router from '../../router.js';
import * as acceso from '../../views/acceso.js';
import { ponerTitulo } from './a11y.js';

let langEl = null;
const langBox = () => (langEl ||= langSwitch());

const raiz = () => document.getElementById('app');

export function centerCard(rt, ...children) {
  ponerTitulo('', '');
  raiz().replaceChildren(h('div', { class: 'auth-wrap' }, h('main', { class: 'card auth-card acc-card-wide' }, h('div', { class: 'auth-lang' }, langBox()), children)));
}

// Tutorial available before connecting (the deployment owner needs it before being able to sign in)
export async function tutorialScreen(rt) {
  const redibujar = () => tutorialScreen(rt);
  redibujar.esTutorial = true; // lets the boot know the hash can leave the tutorial
  rt.redraw = redibujar;
  const box = h('div', { class: 'card auth-card tutorial-standalone' });
  raiz().replaceChildren(h('div', { class: 'auth-wrap' }, box));
  box.append(h('div', { class: 'auth-lang' }, langBox()),
    h('a', { class: 'btn btn-link', href: '#', onclick: (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); rt.start(); } }, t('common.volver')));
  const holder = h('div');
  box.appendChild(holder);
  try {
    const mod = await import('../../views/tutorial.js');
    await mod.render(holder, router.current().params, { store: rt.store, auth: rt.auth, ui });
  } catch (e) { holder.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, e?.message || String(e))); }
}

// "Configuration needed" (no Google Client ID). It is the ONLY place where the demo is offered (modoService.demoDisponible):
// "Try the demo" comes first, the owner setup (tutorial, paste and test the Client ID) below. `demoActiva`: reached from the demo
// banner, so it offers "Back to the demo" instead and connecting closes the demo (rt.modo.connectDrive drops it).
export function configScreen(rt, { demoActiva = false } = {}) {
  rt.redraw = () => configScreen(rt, { demoActiva });
  centerCard(rt, acceso.configNecesaria({
    auth: { connect: ({ clientId } = {}) => rt.modo.connectDrive({ clientId }) },
    onListo: () => { if (demoActiva) { location.hash = ''; location.reload(); } else rt.start(); },
    onDemo: demoActiva ? null : () => rt.conexion.entrarEnDemo(),
    onVolverDemo: demoActiva ? () => rt.start() : null,
  }));
}

// Start screen with a Google Client ID configured: ONLY "Connect Google Drive" (the markup is owned by views/acceso.js).
// `demoCerrada`: a demo left open was closed because a Client ID is configured now; the person is told once.
export function inicioScreen(rt, { demoCerrada = false } = {}) {
  rt.redraw = () => inicioScreen(rt, { demoCerrada });
  centerCard(rt, acceso.login({
    auth: rt.auth,
    onSesion: () => rt.start(),
    onConectar: () => rt.start(),
    aviso: demoCerrada ? t('acceso.demo-cerrada') : null,
  }));
}

export function errorScreen(rt, tituloKey, e, { reintentar } = {}) {
  rt.redraw = null;
  const caducada = e && e.code === 'sesion-caducada';
  centerCard(rt, h('h2', null, t(tituloKey)),
    e && (e.code || e.enlace) ? acceso.errorGoogle(e) : h('p', { class: 'form-error', role: 'alert' }, (e && e.message) || String(e)),
    caducada ? h('button', { class: 'btn btn--primary btn-primary', type: 'button', onclick: () => rt.reconectar().then((ok) => { if (ok) rt.start(); }) }, t('dat.reconectar')) : null,
    h('button', { class: caducada ? 'btn' : 'btn btn--primary btn-primary', type: 'button', onclick: reintentar || (() => rt.start()) }, t('shell.club.reintentar')),
    h('button', { class: 'btn', type: 'button', onclick: () => rt.logout({ confirmar: false }) }, t('shell.desconectar')));
}

// First run (or "Create another club"): wizard. -> { ref, club }
export async function flujoCrearClub(rt, { cancelar } = {}) {
  let creado = null;
  await acceso.asistente({
    mount: (kids) => centerCard(rt, kids),
    redibujar: (fn) => { rt.redraw = fn; },
    cancelar,
    crear: async (datos) => {
      const { crearClub } = await import('../../application/asistenteClub.js');
      creado = await crearClub({ drive: rt.drive, datos });
    },
  });
  return creado;
}

export function selectorClub(rt, clubes) {
  return new Promise((resolve) => {
    const dibujar = () => centerCard(rt, acceso.selector({
      clubes,
      onElegir: (c) => resolve({ ref: c }),
      onCrear: async () => { const r = await flujoCrearClub(rt, { cancelar: () => { dibujar(); rt.redraw = dibujar; } }); resolve(r); },
      onSalir: () => rt.logout({ confirmar: false }),
    }));
    rt.redraw = dibujar;
    dibujar();
  });
}

// Unsynced changes: "download copy / discard / cancel". -> 'salir' | 'cancelar'
export function dialogoSalidaConPendientes(rt) {
  return new Promise((resolve) => {
    let decision = 'cancelar';
    sheet({
      title: t('dat.logout.titulo'),
      body: h('p', null, t('dat.logout.texto')),
      onClose: () => resolve(decision),
      actions: [
        { label: t('dat.logout.cancelar'), autofocus: true },
        { label: t('dat.logout.descargar'), onClick: async () => { try { await rt.store.exportXlsx(); } catch (e) { rt.store.descargarCopia(); } return false; } },
        { label: t('dat.logout.descartar'), danger: true, onClick: () => { decision = 'salir'; } },
      ],
    });
  });
}

// Failure while drawing the shell: nothing was touched; the user can retry or take a copy.
export function pantallaErrorShell(rt, e) {
  rt.redraw = null;
  centerCard(rt, h('h2', null, t('dat.error-shell-titulo')), h('p', null, t('dat.error-shell-texto')),
    h('p', { class: 'form-error', role: 'alert' }, (e && e.message) || String(e)),
    h('button', { class: 'btn btn--primary btn-primary', type: 'button', onclick: () => location.reload() }, t('dat.reintentar')),
    h('button', { class: 'btn', type: 'button', onclick: () => { try { rt.store.descargarCopia(); } catch (err) { toast.error(err.message); } } }, t('dat.descargar-copia')),
    h('button', { class: 'btn', type: 'button', onclick: () => rt.logout({ confirmar: false }) }, t('shell.desconectar')));
}

// Damaged or emptied club file: restore local copy / latest backup / open in Drive / start from scratch. -> resolves once fixed
export function pantallaProblema(rt) {
  const { store, drive } = rt;
  return new Promise((resolve) => {
    const dibujar = () => {
      const p = store.problema;
      if (!p) { resolve(); return; }
      const ref = store.clubRef;
      const accion = async (nombre, confirmKey) => {
        if (nombre === 'copia-local' && !p.tieneCopiaLocal) { toast.error(t('dat.sin-local')); return; }
        if (nombre === 'backup' && !(await store.listarBackups().catch(() => [])).length) { toast.error(t('dat.sin-backup')); return; }
        if (!(await confirmDialog(t(confirmKey), { okLabel: t('common.aceptar') }))) return;
        try { await store.resolverProblema(nombre); } catch (e) { toast.error((e && e.message) || String(e)); }
        dibujar();
      };
      centerCard(rt, h('h2', null, t(p.tipo === 'danado' ? 'dat.danado.titulo' : 'dat.vacio.titulo')),
        h('p', { role: 'alert' }, t(p.tipo === 'danado' ? 'dat.danado.texto' : 'dat.vacio.texto')),
        p.mensaje && p.tipo === 'danado' ? h('p', { class: 'muted' }, p.mensaje) : null,
        h('button', { class: 'btn btn--primary btn-primary', type: 'button', id: 'prob-local', onclick: () => accion('copia-local', 'dat.confirmar-local') }, t('dat.restaurar-local')),
        h('button', { class: 'btn', type: 'button', id: 'prob-backup', onclick: () => accion('backup', 'dat.confirmar-backup') }, t('dat.restaurar-backup')),
        h('a', { class: 'btn', id: 'prob-drive', href: drive.fileUrl(ref.id), target: '_blank', rel: 'noopener noreferrer' }, t('dat.abrir-drive')),
        h('button', { class: 'btn', type: 'button', id: 'prob-vacio', onclick: () => accion('vacio', 'dat.confirmar-vacio') }, t('dat.empezar-vacio')),
        p.tieneCopiaLocal ? h('button', { class: 'btn', type: 'button', onclick: () => store.descargarCopia() }, t('dat.descargar-copia')) : null,
        h('button', { class: 'btn', type: 'button', onclick: () => rt.logout({ confirmar: false }) }, t('shell.desconectar')));
    };
    dibujar();
  });
}
