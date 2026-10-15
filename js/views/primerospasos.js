// Tarjeta "Primeros pasos" del panel de inicio: sólo aparece mientras el club está recién creado (sin grupos ni nadadores).
// Sustituye a los datos de ejemplo: estado vacío con llamadas a la acción.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const CSS = `
.pp-card{grid-column:1/-1;border-left:4px solid var(--c-primary)}
.pp-lista{list-style:none;margin:.6rem 0 0;padding:0;display:grid;gap:.5rem}
.pp-lista a{display:flex;align-items:center;gap:.6rem;min-height:44px;padding:.5rem .8rem;border:1px solid var(--border);border-radius:12px;text-decoration:none;color:var(--text);background:var(--surface)}
.pp-lista a:hover{background:var(--c-primary-soft);border-color:var(--c-primary)}
.pp-n{display:inline-grid;place-items:center;width:1.8rem;height:1.8rem;border-radius:50%;background:var(--c-primary-soft);color:var(--c-secondary);font-weight:700;flex:none}
.pp-hecho .pp-n{background:var(--ok);color:#fff}
@media(min-width:700px){.pp-lista{grid-template-columns:1fr 1fr}}
`;

// -> Node | null
export function primerosPasos(ctx) {
  const { store } = ctx;
  if (store.list('Grupos').length || store.list('Nadadores').length) return null;
  if (!document.getElementById('pp-style')) document.head.appendChild(h('style', { id: 'pp-style' }, CSS));
  const pasos = [
    ['grupos', '#/grupos', store.list('Grupos').length > 0],
    ['nadadores', '#/nadadores', store.list('Nadadores').length > 0],
    ['piscina', '#/planificacion', store.list('Piscinas').length > 0],
    ['sesion', '#/entrenamientos', store.list('Entrenamientos').length > 0],
  ];
  return h('section', { class: 'card ini-card pp-card', id: 'primeros-pasos', 'aria-labelledby': 'pp-t' },
    h('h3', { id: 'pp-t' }, t('primeros.titulo')),
    h('p', { class: 'muted' }, t('primeros.texto')),
    h('ol', { class: 'pp-lista' }, pasos.map(([k, href, hecho], i) =>
      h('li', { class: hecho ? 'pp-hecho' : '' }, h('a', { href }, h('span', { class: 'pp-n', 'aria-hidden': 'true' }, hecho ? icon('check', { size: 14 }) : String(i + 1)), t('primeros.' + k))))));
}
