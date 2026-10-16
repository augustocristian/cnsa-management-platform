// Acciones de PDF del plan de entreno (descargar, vista previa, imprimir, guardar en Drive): pegamento entre
// el servicio, el generador (carga diferida) y el navegador. Used by the Entrenamientos view and the editor.
import { t, locale } from '../i18n.js';
import { crearEntrenoService } from '../application/entrenoService.js';
import { nombreFichero, nombreFicheroSemana } from '../domain/entreno.js';

export const servicio = (ctx) => crearEntrenoService(ctx.store, {
  club: () => ctx.store.club,
});

const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fechaDe = (f) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

export function nombreSesion(ficha) {
  const f = fechaDe(ficha.sesion.fecha);
  return nombreFichero({
    grupo: ficha.sesion.grupo || ficha.sesion.titulo, fecha: ficha.sesion.fecha,
    dia: f ? new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(f) : '',
  });
}

// Genera el PDF (carga las librerías la primera vez). -> { blob, nombre, paginas }
export async function generar(fichas, nombre) {
  const m = await import('../infrastructure/pdfEntreno.js');
  const r = await m.generarPdfEntreno(fichas);
  return { blob: r.blob, nombre, paginas: r.paginas };
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  const tm = setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (tm && tm.unref) tm.unref(); // en pruebas (Node) no mantiene vivo el proceso
}

// Vista previa en un diálogo propio (iframe con el PDF; en móviles sin visor integrado quedan los enlaces).
export function vistaPrevia(h, { blob, nombre }) {
  const url = URL.createObjectURL(blob);
  const prev = document.activeElement;
  const cerrar = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); URL.revokeObjectURL(url); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
  const ov = h('div', { class: 'enp-ov enp-prev-ov', onmousedown: (e) => { if (e.target === ov) cerrar(); } },
    h('div', { class: 'enp-panel enp-prev', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('entreno.vista-previa') },
      h('div', { class: 'enp-head' },
        h('h2', {}, t('entreno.vista-previa'), h('small', {}, ' ' + nombre)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.cerrar'), onclick: cerrar }, '×')),
      h('iframe', { class: 'enp-frame', src: url, title: t('entreno.vista-previa') + ' ' + nombre }),
      h('div', { class: 'enp-foot' },
        h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, t('entreno.abrir-pestana')),
        h('button', { type: 'button', class: 'btn', onclick: () => descargar(blob, nombre) }, t('entreno.descargar')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: cerrar }, t('common.cerrar')))));
  document.body.appendChild(ov);
  document.addEventListener('keydown', onKey, true);
  ov.querySelector('.btn-primary')?.focus();
  return { cerrar, el: ov };
}

// Imprime el PDF con un iframe oculto; si el navegador no lo permite, lo abre en otra pestaña.
export function imprimir(h, { blob }) {
  const url = URL.createObjectURL(blob);
  const f = h('iframe', { class: 'enp-print', src: url, title: t('entreno.imprimir'), 'aria-hidden': 'true', tabindex: '-1' });
  const quitar = () => { f.remove(); URL.revokeObjectURL(url); };
  f.addEventListener('load', () => {
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, '_blank', 'noopener'); }
  });
  document.body.appendChild(f);
  const tm = setTimeout(quitar, 120000);
  if (tm && tm.unref) tm.unref();
  return f;
}

export function puedeGuardarEnDrive(ctx) {
  return !!(ctx.auth && ctx.auth.user);
}

// Guarda el PDF en cnl/entrenos del Drive del usuario. ctx.drive permite inyectar otro cliente (pruebas).
export async function guardarEnDrive(ctx, { blob, nombre }) {
  const drive = ctx.drive || (await import('../drive.js')).drive;
  const m = await import('../infrastructure/driveEntrenos.js');
  return m.guardarPdfEnDrive({ drive, blob, nombre });
}

// ---------- Atajos de alto nivel ----------
const aviso = (ctx, msg) => (ctx.ui.toast ? ctx.ui.toast(msg) : alert(msg));

async function conEspera(ctx, fn) {
  try { return await fn(); } catch (e) {
    console.error(e);
    aviso(ctx, t('entreno.err-pdf'));
    return null;
  }
}

export async function pdfSesion(ctx, sesionId, { accion = 'descargar', borrador = null } = {}) {
  const svc = servicio(ctx);
  const ficha = svc.ficha(sesionId, borrador);
  if (!ficha) return null;
  return conEspera(ctx, async () => {
    const r = await generar([ficha], nombreSesion(ficha));
    return aplicar(ctx, r, accion);
  });
}

export async function pdfSemana(ctx, { lunes, grupoId = '', grupoNombre = '', accion = 'descargar' }) {
  const svc = servicio(ctx);
  const fichas = svc.fichasSemana(lunes, { grupoId });
  if (!fichas.length) { aviso(ctx, t('entreno.sin-sesiones-pdf')); return null; }
  return conEspera(ctx, async () => {
    const r = await generar(fichas, nombreFicheroSemana({ grupo: grupoNombre, lunes }));
    return aplicar(ctx, r, accion);
  });
}

export function aplicar(ctx, r, accion) {
  if (accion === 'descargar') { descargar(r.blob, r.nombre); aviso(ctx, t('entreno.pdf-listo', { n: r.nombre })); }
  else if (accion === 'previa') vistaPrevia(ctx.ui.h, r);
  else if (accion === 'imprimir') imprimir(ctx.ui.h, r);
  return r;
}

export const hoyIso = () => isoDe(new Date());
