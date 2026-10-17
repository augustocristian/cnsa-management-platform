// Glue between the training views and the rest of the app (the adapters arrive through the context built by the composition root):
//   - servicios(ctx): wires the application services to the store, the PDF adapter and Drive
//   - PDF delivery on the device: share (mobile, Web Share with a file) or download, preview (desktop iframe, new tab on
//     mobile), print, with the warning for empty plans
import { t, locale, tContenido } from '../i18n/i18n.js';
import { h, toast, confirmDialog, sheet } from '../ui.js';
import { crearEntrenoService } from '../../application/entrenoService.js';
import { crearEntrenamientosService } from '../../application/entrenamientosService.js';
import { crearEtiquetasPdf } from '../../application/etiquetasPdf.js';
import { useStyles } from '../styles.js';

import { ahoraDe, genIdDe } from '../contexto.js';
// Drive is only usable when the user is connected to it (not in demo mode). store.mode / auth.isConnected come from the
// connection layer; older contexts only had auth.user.
export function driveConectado(ctx) {
  if (ctx.store && ctx.store.mode) return ctx.store.mode === 'drive';
  if (ctx.auth && typeof ctx.auth.isConnected === 'function') return !!ctx.auth.isConnected();
  return !!(ctx.auth && ctx.auth.user);
}

const nombreDia = (fecha) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  return m ? new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(new Date(+m[1], +m[2] - 1, +m[3])) : '';
};

export function servicios(ctx) {
  const entreno = crearEntrenoService(ctx.store, { genId: genIdDe(ctx), club: () => ctx.store.club });
  const pdf = ctx.pdf; // PDF adapter (composition root): { generar(fichas, etiquetas) }
  const drive =
    driveConectado(ctx) && ctx.guardarPdfEnDrive
      ? { guardar: ({ blob, nombre }) => ctx.guardarPdfEnDrive({ blob, nombre, drive: ctx.drive }) }
      : null;
  const ahora = ahoraDe(ctx);
  const svc = crearEntrenamientosService(ctx.store, { entreno, ahora, pdf, drive, nombreDia });
  return { entreno, svc, ahora };
}

// Labels for the PDF port in the active language.
export function etiquetas(ahora) {
  return crearEtiquetasPdf({
    t,
    locale: locale(),
    ahora: ahora(),
    nombreContenido: (it) =>
      it.tipoId ? tContenido({ id: it.tipoId, nombre: it.contenido, predefinido: it.predefinido }) : it.contenido,
  });
}

// ---------- Device ----------
export const esMovil = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const archivo = (blob, nombre) => new File([blob], nombre, { type: 'application/pdf' });
// Web Share with a file only on touch devices that support it (desktop browsers download instead).
export function puedeCompartir(r) {
  if (
    !esMovil() ||
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function'
  )
    return false;
  try {
    return !!navigator.canShare({ files: [archivo(r.blob, r.nombre)] });
  } catch (e) {
    return false;
  }
}
// Label of the single PDF button: "Share PDF" where sharing a file works, "Download PDF" elsewhere.
export const etiquetaPdf = () => {
  const prueba =
    typeof Blob === 'function' ? { blob: new Blob([''], { type: 'application/pdf' }), nombre: 'a.pdf' } : null;
  return t(prueba && puedeCompartir(prueba) ? 'entreno.pdf-compartir' : 'entreno.pdf-descargar');
};

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  const tm = setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (tm && tm.unref) tm.unref();
}

// The single PDF action: share on mobile when possible, else download.
export async function enviar(r) {
  if (puedeCompartir(r)) {
    try {
      await navigator.share({ files: [archivo(r.blob, r.nombre)], title: r.nombre });
      toast(t('entreno.pdf-compartido', { n: r.nombre }));
      return 'compartido';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
      // any other failure (not allowed, unsupported file): fall back to a download
    }
  }
  descargar(r.blob, r.nombre);
  toast(t('entreno.pdf-listo', { n: r.nombre }));
  return 'descargado';
}

// Desktop: dialog with the PDF in an iframe. Mobile browsers do not render a PDF inside an iframe: open it in a new tab.
export function vistaPrevia(r) {
  const url = URL.createObjectURL(r.blob);
  const liberar = () => {
    const tm = setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (tm && tm.unref) tm.unref();
  };
  if (esMovil()) {
    const w = window.open(url, '_blank', 'noopener');
    if (w) toast(t('entreno.pdf-abierto'));
    else
      toast(t('entreno.pdf-bloqueado'), {
        action: { label: t('entreno.abrir-pdf'), onClick: () => window.open(url, '_blank', 'noopener') },
      });
    liberar();
    return null;
  }
  useStyles('entreno-editor');
  return sheet({
    title: t('entreno.vista-previa'),
    className: 'enp-prev',
    onClose: liberar,
    body: h(
      'div',
      { class: 'enp-prev-cuerpo' },
      h('p', { class: 'hint' }, r.nombre),
      h('iframe', { class: 'enp-frame', src: url, title: t('entreno.vista-previa') + ' ' + r.nombre }),
    ),
    actions: [
      {
        label: t('entreno.abrir-pestana'),
        onClick: () => {
          window.open(url, '_blank', 'noopener');
          return false;
        },
      },
      {
        label: t('entreno.descargar'),
        onClick: () => {
          descargar(r.blob, r.nombre);
          return false;
        },
      },
      { label: t('common.cerrar'), primary: true, autofocus: true },
    ],
  });
}

// Prints with a hidden iframe; if the browser does not allow it, opens the PDF in another tab.
export function imprimir(r) {
  const url = URL.createObjectURL(r.blob);
  const f = h('iframe', {
    class: 'enp-print',
    src: url,
    title: t('entreno.imprimir'),
    'aria-hidden': 'true',
    tabindex: '-1',
  });
  const quitar = () => {
    f.remove();
    URL.revokeObjectURL(url);
  };
  f.addEventListener('load', () => {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch (e) {
      window.open(url, '_blank', 'noopener');
    }
  });
  document.body.appendChild(f);
  const tm = setTimeout(quitar, 120000);
  if (tm && tm.unref) tm.unref();
  return f;
}

// ---------- High level actions ----------
// accion: 'enviar' (share/download) | 'previa' | 'imprimir' | 'drive'. Warns before generating an empty plan.
const entrega = (ctx, accion) => (r) => {
  if (accion === 'previa') return vistaPrevia(r);
  if (accion === 'imprimir') return imprimir(r);
  if (accion === 'drive') return guardarEnDrive(ctx, r);
  return enviar(r);
};

async function generarYEntregar(generar, alEntregar, mensajeVacio) {
  try {
    let r = await generar(false);
    if (!r.ok && r.codigo === 'plan-vacio') {
      if (!(await confirmDialog(t(mensajeVacio)))) return null;
      r = await generar(true);
    }
    if (!r.ok) {
      toast.error(t(r.codigo === 'sin-sesiones' ? 'entreno.sin-sesiones-pdf' : 'entreno.err-pdf'));
      return null;
    }
    await alEntregar(r);
    return r;
  } catch (e) {
    console.error(e);
    toast.error(t('entreno.err-pdf'));
    return null;
  }
}

export function pdfSesion(ctx, sesionId, { accion = 'enviar', borrador = null } = {}) {
  const { svc, ahora } = servicios(ctx);
  return generarYEntregar(
    (permitirVacio) => svc.pdfSesion(sesionId, { borrador, etiquetas: etiquetas(ahora), permitirVacio }),
    entrega(ctx, accion),
    'entreno.pdf-vacio-confirmar',
  );
}

export function pdfSemana(ctx, { lunes, grupoId = '', accion = 'enviar' }) {
  const { svc, ahora } = servicios(ctx);
  return generarYEntregar(
    (permitirVacio) => svc.pdfSemana(lunes, { grupoId, etiquetas: etiquetas(ahora), permitirVacio }),
    entrega(ctx, accion),
    'entreno.pdf-vacio-semana-confirmar',
  );
}

// Saves a generated PDF to cnl/entrenos in the user's Drive (only with the Drive connection).
export async function guardarEnDrive(ctx, r) {
  const { svc } = servicios(ctx);
  try {
    const res = await svc.guardarEnDrive({ blob: r.blob, nombre: r.nombre });
    toast(t(res.actualizado ? 'entreno.drive-actualizado' : 'entreno.drive-ok', { n: r.nombre }));
    return res;
  } catch (e) {
    console.error(e);
    toast.error(t('entreno.err-drive'));
    return null;
  }
}
