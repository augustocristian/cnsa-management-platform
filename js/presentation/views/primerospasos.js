// "First steps" card of the Home dashboard. The steps tick themselves from the club data (model from
// application/inicioService.js > primerosPasos) and the card can be dismissed (the service stores it per club).
// -> Node | null (null when every step is done or the user dismissed the card)
import { icon } from '../icons.js';
import { t, tNum } from '../i18n/i18n.js';

export function primerosPasos(ctx, estado, { onOcultar } = {}) {
  if (!estado || estado.completo || estado.oculto) return null;
  const { h } = ctx.ui;
  const pct = Math.round((estado.hechos / estado.total) * 100);
  const barra = h(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      'aria-labelledby': 'pp-prog',
      'aria-valuenow': pct,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
    },
    h('span'),
  );
  barra.style.setProperty('--value', `${pct}%`);
  return h(
    'section',
    { class: 'card pp-card', id: 'primeros-pasos', 'aria-labelledby': 'pp-t' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { id: 'pp-t' }, t('primeros.titulo')),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-icon btn-sm btn--ghost',
          id: 'pp-ocultar',
          'aria-label': t('primeros.ocultar'),
          title: t('primeros.ocultar'),
          onclick: () => onOcultar?.(),
        },
        icon('cerrar', { size: 18 }),
      ),
    ),
    h('p', { class: 'muted pp-texto' }, t('primeros.texto')),
    h(
      'p',
      { class: 'pp-progreso num', id: 'pp-prog' },
      t('primeros.progreso', { hechos: tNum(estado.hechos), total: tNum(estado.total) }),
    ),
    barra,
    h(
      'ol',
      { class: 'pp-lista' },
      estado.pasos.map((p, i) =>
        h(
          'li',
          { class: p.hecho ? 'pp-hecho' : '' },
          h(
            'a',
            { href: p.href },
            h('span', { class: 'pp-n', 'aria-hidden': 'true' }, p.hecho ? icon('check', { size: 16 }) : String(i + 1)),
            h('span', { class: 'pp-et' }, t(`primeros.${p.clave}`)),
            p.hecho ? h('span', { class: 'sr-only' }, ` (${t('primeros.hecho')})`) : null,
          ),
        ),
      ),
    ),
  );
}
