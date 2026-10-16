// Attendance history tab: one row per swimmer with counts and percentage; the name opens the detail of each session.
import { h, empty } from '../ui.js';
import { t, tEstado, tDate, locale } from '../i18n.js';
import { nombreApellidosPrimero } from '../domain/nombres.js';

const dia = (s) => tDate(String(s).slice(0, 10));

// state: { grupoId, abierto }, redraw(): repaints the view
export function historialPanel({ svc, state, redraw }) {
  const grupos = svc.grupos();
  const filas = svc.historial({ grupoId: state.grupoId, locale: locale() });

  const filtro = h('select', { id: 'asi-grupo', onchange: (e) => { state.grupoId = e.target.value; state.abierto = null; redraw(); } },
    h('option', { value: '' }, t('asist.todos-grupos')),
    grupos.map((g) => h('option', { value: g.id, selected: g.id === state.grupoId }, g.nombre)));
  const cabecera = h('div', { class: 'asi-filter field' },
    h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, t('asist.grupo')), filtro));

  if (!filas.length) {
    return h('div', null, cabecera, empty({
      icon: 'nadadores', title: t('asist.sin-nadadores'), action: { label: t('asist.sin-nadadores-accion'), onClick: () => { location.hash = '#/nadadores'; } },
    }));
  }

  const cuerpo = [];
  for (const f of filas) {
    const nombre = nombreApellidosPrimero(f.nadador);
    const abierto = state.abierto === f.nadador.id;
    const detId = `asi-det-${f.nadador.id}`;
    const alternar = () => { state.abierto = abierto ? null : f.nadador.id; redraw(); };
    cuerpo.push(h('tr', { class: 'asi-fila', 'data-nid': f.nadador.id, onclick: alternar },
      h('td', { 'data-label': t('asist.th-nadador') },
        h('button', { type: 'button', class: 'asi-name-btn', 'aria-expanded': String(abierto), 'aria-controls': abierto ? detId : null, 'aria-label': t('asist.ver-detalle', { nombre }), 'data-foco': `h:${f.nadador.id}` }, nombre)),
      h('td', { class: 'num', 'data-label': t('asist.th-pres') }, String(f.presente)),
      h('td', { class: 'num', 'data-label': t('asist.th-aus') }, String(f.ausente)),
      h('td', { class: 'num', 'data-label': t('asist.th-just') }, String(f.justificado)),
      h('td', { class: 'num', 'data-label': t('asist.th-pct') }, f.pct === null ? '—' : h('div', { class: 'asi-pct' },
        h('span', { class: 'num asi-pct-n' }, `${f.pct}%`),
        h('div', { class: 'progress ' + (f.pct >= 75 ? 'progress--ok' : f.pct >= 50 ? 'progress--warn' : 'progress--danger'), role: 'progressbar',
          'aria-label': `${nombre}: ${t('asist.th-pct')}`, 'aria-valuenow': String(f.pct), 'aria-valuemin': '0', 'aria-valuemax': '100', style: `--value:${f.pct}%` }, h('span'))))));
    if (abierto) {
      cuerpo.push(h('tr', { class: 'asi-det', id: detId },
        h('td', { colspan: 5 }, f.detalle.length
          ? h('ul', null, f.detalle.map(({ sesion, registro }) => h('li', null,
            `${dia(sesion.fecha)} · ${sesion.titulo || t('asist.sesion')} · ${tEstado(registro.estado) || registro.estado}${registro.nota ? ` (${registro.nota})` : ''}`)))
          : t('asist.sin-registros'))));
    }
  }

  return h('div', null, cabecera, h('p', { class: 'asi-help' }, t('asist.ayuda-historial')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
      h('thead', null, h('tr', null, ['nadador', 'pres', 'aus', 'just', 'pct'].map((k) => h('th', { class: k === 'nadador' ? null : 'num' }, t('asist.th-' + k))))),
      h('tbody', null, cuerpo))));
}
