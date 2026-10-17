// Swimmer list: compact filter bar, table that becomes cards on mobile, "show more" paging and empty states.
import { h, field, badge, avatar, empty } from '../ui.js';
import { icon } from '../icons.js';
import { t, tCat } from '../i18n/i18n.js';
import { CATEGORIAS_ORDEN, etiquetaTemporada } from '../../domain/categorias.js';
import { nombreLista, nombreCompleto, esActivo } from '../../domain/nadadores.js';
import { tablaAnios } from './categorias-panel.js';
import { abrirFormulario } from './nadadores-form.js';

const PAGINA = 25; // rows shown before "Show more"

export const insigniaManual = (n) =>
  String(n.categoriaManual || '').trim()
    ? h(
        'span',
        { class: 'badge badge--neutral nad-manual', title: t('categorias.manual-titulo') },
        t('categorias.manual'),
      )
    : null;

function fila(n, nombreGrupo, edad) {
  const activo = esActivo(n);
  return h(
    'tr',
    {
      class: 'nad-row' + (activo ? '' : ' nad-inactivo'),
      onclick: (e) => {
        if (!e.target.closest('a')) location.hash = `#/nadadores/${n.id}`;
      },
    },
    h(
      'td',
      { class: 'nad-who' },
      avatar(nombreCompleto(n), { size: 'sm' }),
      h('a', { class: 'nad-name', href: `#/nadadores/${n.id}` }, nombreLista(n)),
      activo ? null : badge(t('nadadores.inactivo'), 'neutral'),
    ),
    h(
      'td',
      { 'data-label': t('nadadores.col-categoria') },
      n.categoria ? badge(tCat(n.categoria), 'info') : '-',
      insigniaManual(n),
    ),
    h('td', { 'data-label': t('nadadores.col-grupo') }, nombreGrupo || '-'),
    h('td', { 'data-label': t('nadadores.col-edad'), class: 'num' }, edad),
    h('td', { 'data-label': t('nadadores.col-licencia') }, n.licencia || ''),
  );
}

// vc: {ctx, svc, refresh}
export function renderLista(container, vc) {
  const { ctx, svc, refresh } = vc;
  const grupos = ctx.store.list('Grupos');
  const nombreGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));
  const estado = { q: '', categoria: '', grupoId: '', inactivos: false, limite: PAGINA };
  const nuevo = () => abrirFormulario(vc, null, { alGuardar: refresh, defecto: { grupoId: estado.grupoId } });

  const cabecera = h(
    'header',
    { class: 'page-head' },
    h('h1', null, t('nadadores.titulo')),
    h(
      'div',
      { class: 'page-head-actions' },
      h(
        'button',
        { type: 'button', class: 'btn btn--primary', onclick: nuevo },
        icon('mas', { size: 16 }),
        t('nadadores.nuevo'),
      ),
    ),
  );

  if (!ctx.store.list('Nadadores').length) {
    container.replaceChildren(
      cabecera,
      h(
        'div',
        { class: 'card' },
        empty({
          icon: 'nadadores',
          title: t('nadadores.vacio-titulo'),
          text: t('nadadores.vacio-texto'),
          action: { label: t('nadadores.nuevo'), onClick: nuevo },
        }),
      ),
    );
    return;
  }

  const cuerpo = h('tbody');
  const cuenta = h('p', { class: 'nad-count muted', 'aria-live': 'polite' });
  const vacio = h('div', { class: 'nad-empty', hidden: true });
  const mas = h('div', { class: 'nad-more', hidden: true });
  const tabla = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table--cards' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          [
            ['nadadores.col-nombre'],
            ['nadadores.col-categoria'],
            ['nadadores.col-grupo'],
            ['nadadores.col-edad', 'num'],
            ['nadadores.col-licencia'],
          ].map(([k, c]) => h('th', { scope: 'col', class: c }, t(k))),
        ),
      ),
      cuerpo,
    ),
  );

  const pintar = () => {
    const todos = svc.listar(estado);
    const visibles = todos.slice(0, estado.limite);
    cuenta.textContent = t(todos.length === 1 ? 'nadadores.contador.uno' : 'nadadores.contador.otros', {
      n: todos.length,
    });
    cuerpo.replaceChildren(...visibles.map((n) => fila(n, nombreGrupo.get(n.grupoId), svc.edad(n))));
    tabla.hidden = !todos.length;
    vacio.hidden = !!todos.length;
    mas.hidden = todos.length <= visibles.length;
    mas.replaceChildren(
      todos.length > visibles.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                estado.limite += PAGINA;
                pintar();
              },
            },
            t('nadadores.mostrar-mas', { n: todos.length - visibles.length }),
          )
        : '',
    );
  };

  const buscar = h('input', {
    type: 'search',
    placeholder: t('nadadores.buscar'),
    autocomplete: 'off',
    enterkeyhint: 'search',
    oninput: (e) => {
      estado.q = e.target.value;
      estado.limite = PAGINA;
      pintar();
    },
  });
  const selCat = h(
    'select',
    {
      onchange: (e) => {
        estado.categoria = e.target.value;
        estado.limite = PAGINA;
        pintar();
      },
    },
    h('option', { value: '' }, t('nadadores.todas-cat')),
    CATEGORIAS_ORDEN.map((c) => h('option', { value: c }, tCat(c))),
  );
  const selGrupo = h(
    'select',
    {
      onchange: (e) => {
        estado.grupoId = e.target.value;
        estado.limite = PAGINA;
        pintar();
      },
    },
    h('option', { value: '' }, t('nadadores.todos-grupos')),
    grupos.map((g) => h('option', { value: g.id }, g.nombre)),
  );
  const inactivos = h('input', {
    type: 'checkbox',
    onchange: (e) => {
      estado.inactivos = e.target.checked;
      estado.limite = PAGINA;
      pintar();
    },
  });

  // On mobile only the search stays visible; the rest folds under a "Filters" button.
  const barra = h('div', { class: 'filters nad-filters' });
  const alternar = h(
    'button',
    {
      type: 'button',
      class: 'btn nad-filter-toggle',
      'aria-expanded': 'false',
      'aria-controls': 'nad-filtros-extra',
      onclick: () => {
        const abierto = barra.classList.toggle('is-open');
        alternar.setAttribute('aria-expanded', String(abierto));
      },
    },
    icon('buscar', { size: 16 }),
    t('nadadores.filtros'),
  );
  barra.append(
    field({ label: t('nadadores.f-buscar'), input: buscar }),
    alternar,
    h(
      'div',
      { class: 'nad-extra', id: 'nad-filtros-extra' },
      field({ label: t('nadadores.col-categoria'), input: selCat }),
      field({ label: t('nadadores.col-grupo'), input: selGrupo }),
      h('label', { class: 'check' }, inactivos, t('nadadores.ver-inactivos')),
    ),
  );
  barra.firstChild.classList.add('grow');

  const quitar = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        Object.assign(estado, { q: '', categoria: '', grupoId: '', inactivos: false, limite: PAGINA });
        buscar.value = '';
        selCat.value = '';
        selGrupo.value = '';
        inactivos.checked = false;
        pintar();
      },
    },
    t('nadadores.limpiar-filtros'),
  );
  vacio.append(
    empty({
      icon: 'buscar',
      title: t('nadadores.sin-resultados-titulo'),
      text: t('nadadores.sin-resultados-texto'),
      action: quitar,
    }),
  );

  const temporada = etiquetaTemporada(svc.categorias.temporadaActual());
  container.replaceChildren(
    cabecera,
    h(
      'details',
      { class: 'card nad-catdet' },
      h('summary', null, t('categorias.titulo', { temporada })),
      tablaAnios(ctx),
      h('p', { class: 'muted' }, h('a', { href: '#/club' }, t('categorias.panel.ver-en-config'))),
    ),
    h('div', { class: 'card' }, barra, cuenta, tabla, vacio, mas),
  );
  pintar();
}
