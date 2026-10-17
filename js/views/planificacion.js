// Planning view: shared page header + two tabs, "Temporada" (default) and "Piscina". Routes: #/planificacion and #/planificacion/piscina.
// This module is only the shell (header, tabs, tab panel); each tab is its own module:
//   Temporada -> views/temporada.js (+ temporada-grafico.js)     Piscina -> views/planificacion-piscina.js (+ rejilla, barra, formulario...)
import { h } from '../ui.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { teclasTabs } from './tabs-teclado.js';
import { renderPiscina } from './planificacion-piscina.js';

export { mensajeConflicto } from './planificacion-textos.js';

const APARTADOS = ['temporada', 'piscina'];
const ICONO = { temporada: 'grafica', piscina: 'planificacion' };
const RUTA = { temporada: '#/planificacion', piscina: '#/planificacion/piscina' };

export async function render(container, params, ctx) {
  useStyles('planificacion');
  let actual = APARTADOS.includes(params && params[0]) ? params[0] : 'temporada';
  let panelOff = null;
  let secuencia = 0; // protects against a slow tab finishing after the user already moved to another one

  const acciones = h('div', { class: 'page-head-actions pl-screen' });
  const panel = h('div', { role: 'tabpanel', class: 'pl-apartado', tabindex: 0 });
  const tabs = new Map();
  const lista = teclasTabs(h('div', { class: 'tabs pl-screen', id: 'pl-apartados', role: 'tablist', 'aria-label': t('plan.apartados') },
    APARTADOS.map((a) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', id: 'pl-tab-' + a, 'aria-controls': 'pl-panel-' + a, onclick: () => mostrar(a) }, icon(ICONO[a], { size: 16 }), ' ', t('plan.apartado.' + a));
      tabs.set(a, b);
      return b;
    })));

  const marcar = () => {
    APARTADOS.forEach((a) => {
      tabs.get(a).setAttribute('aria-selected', a === actual ? 'true' : 'false');
      tabs.get(a).setAttribute('tabindex', a === actual ? '0' : '-1');
    });
    panel.setAttribute('aria-labelledby', 'pl-tab-' + actual);
    panel.id = 'pl-panel-' + actual;
  };

  async function mostrar(a) {
    actual = a;
    const mia = ++secuencia;
    marcar();
    if (typeof panelOff === 'function') panelOff();
    panelOff = null;
    const interior = h('div', { class: 'pl-apartado-in' });
    panel.replaceChildren(interior);
    acciones.replaceChildren();
    try { history.replaceState(null, '', RUTA[a]); } catch (e) { /* no history API (tests) */ }
    const mod = a === 'piscina' ? { render: renderPiscina } : await import('./temporada.js');
    const off = await mod.render(interior, [], { ...ctx, planificacion: { acciones } });
    if (mia !== secuencia) { if (typeof off === 'function') off(); return; }
    panelOff = off;
  }

  container.replaceChildren(
    h('header', { class: 'page-head pl-cabecera' }, h('h1', null, t('nav.planificacion')), acciones),
    lista, panel);
  await mostrar(actual);
  return () => { if (typeof panelOff === 'function') panelOff(); };
}
