// Season tools (dialogs with a live preview): copy a week, apply a phase template, adjust the volume of several weeks.
import { h, sheet, formFields, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { fmtCorta } from './formatos-fecha.js';
import { fmtM } from './temporada-grafico.js';

const opcionesSemana = (m) => m.semanas.map((s) => ({ value: s.n, label: `${t('tp.semana-n', { n: s.n })} · ${fmtCorta(s.lunes)}` }));

// Before/after table of the weeks a tool would change.
export function tablaCambios(cambios) {
  if (!cambios.length) return h('p', { class: 'hint' }, t('tp.herr.sin-cambios'));
  return h('div', { class: 'table-wrap tp-prev' }, h('table', { class: 'table' },
    h('caption', { class: 'sr-only' }, t('tp.herr.previa')),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('tp.semana')), h('th', { scope: 'col' }, t('tp.fechas')), h('th', { scope: 'col', class: 'num' }, t('tp.herr.antes')), h('th', { scope: 'col', class: 'num' }, t('tp.herr.despues')))),
    h('tbody', null, cambios.map((c) => h('tr', null, h('th', { scope: 'row' }, c.n), h('td', null, fmtCorta(c.lunes)),
      h('td', { class: 'num' }, c.antes > 0 ? fmtM(c.antes) : '—'), h('td', { class: 'num' }, c.despues > 0 ? fmtM(c.despues) : '—'))))));
}

// opciones: {svc, m, s (week), fuente, onCopiada(n destino)}
export function abrirCopiar({ svc, m, s, fuente, onCopiada }) {
  const def = [{ name: 'destino', label: t('tp.herr.copiar-a'), type: 'select', options: opcionesSemana(m).filter((o) => o.value !== s.n), full: true }];
  const form = formFields(def, { destino: (m.semanas.find((x) => x.n === s.n + 1) || m.semanas[0]).n });
  form.el.classList.add('tp-form');
  return sheet({
    title: t('tp.herr.copiar-titulo', { n: s.n }), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.copiar-ayuda')), form.el), className: 'tp-sheet',
    actions: [{ label: t('common.cancelar') }, {
      label: t('tp.herr.copiar'), primary: true,
      onClick: () => {
        const destino = Number(form.values().destino);
        if (!svc.copiarSemana(m.temporada.id, s.n, destino, { fuente }).ok) return false;
        toast(t('tp.herr.copiada'));
        onCopiada?.(destino);
        return true;
      },
    }],
  });
}

// opciones: {svc, m, fase0 (phase preselected), onAplicada()}
export function abrirPlantilla({ svc, m, fase0, onAplicada }) {
  if (!m.fases.length) return null;
  const def = [
    { name: 'faseId', label: t('tp.herr.fase'), type: 'select', options: m.fases.map((f) => ({ value: f.id, label: f.nombre })), full: true },
    { name: 'volumenBase', label: t('tp.herr.base'), type: 'number', min: 0, step: 50, full: true },
  ];
  const form = formFields(def, { faseId: (fase0 || m.fases[0]).id, volumenBase: '' });
  form.el.classList.add('tp-form');
  const c = form.inputs;
  const prev = h('div', { 'aria-live': 'polite' });
  let tocado = false;
  const calc = (aplicar) => svc.plantillaFase(m.temporada.id, c.faseId.value, { volumenBase: tocado ? Number(c.volumenBase.value) : undefined, aplicar });
  const refrescar = () => {
    const r = calc(false);
    if (!tocado && r.ok) c.volumenBase.value = r.volumenBase || '';
    const cambios = (r.cambios || []).map((x) => ({ n: x.n, lunes: x.lunes, antes: (m.semanas.find((s) => s.n === x.n) || { plan: {} }).plan.volumen, despues: x.volumen }));
    prev.replaceChildren(r.ok && r.volumenBase === 0 ? h('p', { class: 'hint' }, t('tp.herr.sin-base')) : tablaCambios(cambios));
  };
  c.volumenBase.addEventListener('input', () => { tocado = true; refrescar(); });
  c.faseId.addEventListener('change', () => { tocado = false; refrescar(); });
  refrescar();
  return sheet({
    title: t('tp.herr.plantilla'), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.plantilla-ayuda')), form.el, prev), className: 'tp-sheet',
    actions: [{ label: t('common.cancelar') }, {
      label: t('tp.herr.aplicar'), primary: true,
      onClick: () => { if (!calc(true).ok) return false; toast(t('tp.herr.aplicada')); onAplicada?.(); return true; },
    }],
  });
}

export function abrirAjuste({ svc, m, s, onAplicado }) {
  const ops = opcionesSemana(m);
  const def = [
    { name: 'desde', label: t('tp.herr.desde'), type: 'select', options: ops },
    { name: 'hasta', label: t('tp.herr.hasta'), type: 'select', options: ops },
    { name: 'modo', label: t('tp.herr.modo'), type: 'select', options: [{ value: 'escalar', label: t('tp.herr.modo-escalar') }, { value: 'mover', label: t('tp.herr.modo-mover') }], full: true },
    { name: 'valor', label: t('tp.herr.valor'), type: 'number', step: 1, full: true },
  ];
  const form = formFields(def, { desde: s.n, hasta: Math.min(m.semanas.length, s.n + 3), modo: 'escalar', valor: 10 });
  form.el.classList.add('tp-form');
  const prev = h('div', { 'aria-live': 'polite' });
  const calc = (aplicar) => {
    const v = form.values();
    const desde = Math.min(Number(v.desde), Number(v.hasta)), hasta = Math.max(Number(v.desde), Number(v.hasta));
    return svc.ajustarVolumen(m.temporada.id, { desde, hasta, ...(v.modo === 'mover' ? { mover: Number(v.valor) || 0 } : { pct: Number(v.valor) || 0 }), aplicar });
  };
  const refrescar = () => {
    form.inputs.valor.setAttribute('aria-label', form.inputs.modo.value === 'mover' ? t('tp.herr.valor-semanas') : t('tp.herr.valor-pct'));
    prev.replaceChildren(tablaCambios(calc(false).cambios));
  };
  form.el.addEventListener('input', refrescar);
  form.el.addEventListener('change', refrescar);
  refrescar();
  return sheet({
    title: t('tp.herr.ajustar'), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.ajustar-ayuda')), form.el, prev), className: 'tp-sheet',
    actions: [{ label: t('common.cancelar') }, {
      label: t('tp.herr.aplicar'), primary: true,
      onClick: () => { const r = calc(true); if (!r.cambios.length) return false; toast(t('tp.herr.ajustado', { n: r.cambios.length })); onAplicado?.(); return true; },
    }],
  });
}
