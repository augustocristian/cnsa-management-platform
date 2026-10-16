// Notices and notes view: the coach's own notes and notices (for the whole club or one group). The app sends nothing
// to anyone: each notice can be copied so the coach passes it on through their usual channel (email, messaging...).
// Rules: domain/comunicaciones.js + comunicacionesService.js.
import { h, field, fieldError, toast, badge, empty } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tDate } from '../i18n.js';
import { crearComunicacionesService } from '../application/comunicacionesService.js';
import { TODO_EL_CLUB } from '../domain/comunicaciones.js';

export async function render(container, params, ctx) {
  useStyles('comunicaciones');
  const { store } = ctx;
  const svc = crearComunicacionesService(store, { ahora: ctx.ahora });
  const grupos = store.list('Grupos');
  const nombreGrupo = (id) => (grupos.find((g) => g.id === id) || {}).nombre || t('comu.grupo');
  const estado = { filtro: '' };

  async function copiar(aviso) {
    try { await navigator.clipboard.writeText(svc.textoParaCopiar(aviso)); toast(t('common.copiado')); } catch (e) { toast.error(t('comu.errCopiar')); } // clipboard blocked or unavailable
  }

  // Delete with undo: the notice goes now and comes back with the toast button.
  function eliminar(aviso) {
    const copia = svc.eliminar(aviso.id);
    pintarLista();
    toast.undo(t('comu.eliminado'), () => { svc.restaurar(copia); toast(t('comu.restaurado')); if (container.isConnected) pintarLista(); });
  }

  // ---- Form ----
  const titulo = h('input', { type: 'text', name: 'titulo', maxlength: 120, autocomplete: 'off', enterkeyhint: 'next' });
  const destino = h('select', { name: 'grupoId' }, h('option', { value: '' }, t('comu.todoClub')), grupos.map((g) => h('option', { value: g.id }, g.nombre)));
  const texto = h('textarea', { name: 'texto', rows: 4 });
  const campoTexto = field({ label: t('comu.mensaje'), input: texto, required: true });
  campoTexto.classList.add('full');
  const formulario = h('form', { class: 'cm-form form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); publicar(); } },
    field({ label: t('comu.campoTitulo'), input: titulo, required: true }),
    field({ label: t('comu.destinatarios'), input: destino }),
    campoTexto,
    h('div', { class: 'full' }, h('button', { type: 'submit', class: 'btn btn--primary' }, t('comu.publicar'))));

  function publicar() {
    // The app has no user identity: notices carry no author (older ones may still have one and keep showing it).
    const r = svc.publicar({ titulo: titulo.value, texto: texto.value, grupoId: destino.value });
    if (!r.ok) {
      const campos = { titulo, texto };
      r.errores.forEach((e, i) => fieldError(campos[e.campo], t('comu.err.' + e.codigo), { focus: i === 0 }));
      return;
    }
    toast(t('comu.publicado'));
    titulo.value = ''; texto.value = ''; destino.value = '';
    pintarLista();
  }

  // ---- List ----
  const lista = h('div', { class: 'cm-list' });
  const filtro = h('select', { id: 'cm-filtro', onchange: (e) => { estado.filtro = e.target.value; pintarLista(); } },
    h('option', { value: '' }, t('comu.todosAvisos')), h('option', { value: TODO_EL_CLUB }, t('comu.soloGenerales')),
    grupos.map((g) => h('option', { value: g.id }, g.nombre)));

  function fecha(aviso) {
    const r = svc.relativa(aviso.fecha);
    const texto = r.tipo === 'fecha' ? tDate(aviso.fecha) : t('comu.rel.' + r.tipo, { n: r.n });
    return h('time', { datetime: aviso.fecha, title: tDate(aviso.fecha, 'long') }, texto);
  }

  function item(aviso) {
    return h('article', { class: 'cm-item' },
      h('h3', null, aviso.titulo),
      h('div', { class: 'cm-meta' }, fecha(aviso), aviso.autor ? h('span', null, `· ${aviso.autor}`) : null,
        badge(aviso.grupoId ? nombreGrupo(aviso.grupoId) : t('comu.todos'), aviso.grupoId ? 'info' : 'neutral')),
      h('p', { class: 'cm-text' }, aviso.texto),
      h('div', { class: 'cm-actions' },
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t('comu.copiar-aria', { titulo: aviso.titulo }), onclick: () => copiar(aviso) }, icon('copiar', { size: 16 }), t('comu.copiar')),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t('comu.eliminar-aria', { titulo: aviso.titulo }), onclick: () => eliminar(aviso) }, icon('borrar', { size: 16 }), t('comu.eliminar'))));
  }

  function pintarLista() {
    const avisos = svc.listar(estado.filtro);
    if (avisos.length) { lista.replaceChildren(...avisos.map(item)); return; }
    lista.replaceChildren(svc.total()
      ? empty({ icon: 'comunicaciones', title: t('comu.vacio-filtro') })
      : empty({ icon: 'comunicaciones', title: t('comu.vacio-titulo'), text: t('comu.vacio-texto'), action: { label: t('comu.crear-primero'), onClick: () => titulo.focus() } }));
  }

  container.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, t('comu.titulo')), h('p', { class: 'page-head-sub' }, t('comu.ayuda'))),
    h('section', { class: 'card cm-card' }, h('h2', null, t('comu.nuevo')), formulario),
    h('section', { class: 'card cm-card' },
      h('div', { class: 'card-head' }, h('h2', null, t('comu.avisos'))),
      h('div', { class: 'filters cm-bar' }, field({ label: t('comu.filtro'), input: filtro })),
      lista));
  pintarLista();
}
