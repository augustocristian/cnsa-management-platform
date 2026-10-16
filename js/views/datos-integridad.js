// UI pieces for data integrity and GDPR used by several views: Excel import preview,
// validation messages, the data-protection footer (Settings) and the access/erasure actions of a swimmer (profile).
import { h, sheet, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

// Import error (codes from store.importXlsx / previsualizarXlsx) -> translated text
export function textoErrorImportacion(e) {
  const clave = { 'import-demasiado-grande': 'dat.import.err-tamano', 'import-demasiadas-filas': 'dat.import.err-filas', 'import-sin-copia': 'dat.import.err-copia' }[e && e.code];
  return clave ? t(clave) : (e && e.message) || String(e);
}

// Row validation error (code 'validacion') -> translated text
export function textoValidacion(e) {
  const partes = ((e && e.errores) || []).map((x) => `${x.campo}: ${t('dat.val.' + x.codigo)}`);
  return t('dat.val.titulo') + (partes.length ? ' (' + partes.join('; ') + ')' : '');
}

const avisoPeligro = (texto) => h('div', { class: 'alert alert--warn', role: 'alert' }, icon('aviso', { size: 18 }), h('p', null, texto));

// Import preview: per-sheet count against the current data + warnings. -> Promise<boolean> (import and replace?)
export function confirmarImportacion(prev) {
  return new Promise((resolve) => {
    let ok = false;
    const filas = prev.hojas.filter((x) => x.filas || x.actuales).map((x) =>
      h('tr', null, h('td', null, x.nombre), h('td', { class: 'num' }, String(x.filas)), h('td', { class: 'num' }, String(x.actuales))));
    const body = h('div', { id: 'import-previa' },
      h('p', null, t('dat.import.texto')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('dat.import.hoja')), h('th', { scope: 'col', class: 'num' }, t('dat.import.nuevas')), h('th', { scope: 'col', class: 'num' }, t('dat.import.actuales')))),
        h('tbody', null, filas))),
      prev.duplicados.length ? avisoPeligro(t('dat.import.duplicados', { n: prev.duplicados.length })) : null,
      prev.invalidas ? avisoPeligro(t('dat.import.invalidas', { n: prev.invalidas })) : null);
    sheet({
      title: t('dat.import.titulo'),
      body,
      onClose: () => resolve(ok),
      actions: [
        { label: t('common.cancelar'), autofocus: true },
        { label: t('dat.import.confirmar'), danger: true, onClick: () => { ok = true; } },
      ],
    });
  });
}

// Data-protection card for Settings (GDPR rights and a notice about old Drive versions). The only place with this text.
export function pieRgpd() {
  return h('section', { class: 'card clb-card', id: 'clb-rgpd', 'aria-labelledby': 'clb-rgpd-t' },
    h('h2', { id: 'clb-rgpd-t' }, t('dat.rgpd.titulo')),
    h('p', null, t('dat.rgpd.texto')),
    h('p', null, t('dat.rgpd.derechos')),
    h('p', { class: 'muted' }, t('dat.rgpd.revisiones')));
}

const nombreDe = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();

// Buttons of a swimmer's profile: export all their data (access/portability) and delete them with everything (erasure).
// In demo mode nothing was ever written to Drive, so the Drive copies are not touched and a note says so.
export function accionesRgpd(n, ctx) {
  const { store } = ctx;
  const demo = store.mode === 'demo';
  const exportar = h('button', {
    type: 'button', class: 'btn', id: 'nad-exportar-datos',
    onclick: () => { try { store.exportNadador(n.id); } catch (e) { toast.error(e.message || String(e)); } },
  }, t('dat.nad.exportar'));
  const purgar = h('button', {
    type: 'button', class: 'btn btn--danger', id: 'nad-purgar',
    onclick: async () => {
      if (!(await confirmDialog(t('dat.nad.purgar-confirmar', { nombre: nombreDe(n) }), { danger: true, okLabel: t('dat.nad.purgar') }))) return;
      purgar.disabled = true;
      try {
        const r = await store.purgarNadador(n.id, { borrarEnDrive: !demo });
        toast(t('dat.nad.purgado', { nombre: nombreDe(n), n: r.filas }));
        if (demo) { /* demo data lives only on this device */ } else if (!r.sincronizado) toast.error(t('dat.nad.purgado-pendiente'), 9000);
        else if (r.avisoRevisiones) toast(t('dat.nad.purgado-revisiones', { n: r.revisionesBorradas }), 9000);
        location.hash = '#/nadadores';
      } catch (e) {
        purgar.disabled = false;
        toast.error(e.message || String(e));
      }
    },
  }, t('dat.nad.purgar'));
  return [exportar, purgar, demo ? h('p', { class: 'hint full' }, t('dat.nad.demo-nota')) : null];
}
