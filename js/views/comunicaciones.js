// Notices and notes view: the coach's own notes and notices (for the whole club or one group). The app sends nothing
// to anyone: each notice can be copied so the coach passes it on through their usual channel (email, messaging...).
import { t, tDate } from '../i18n.js';
function H(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'selected' || k === 'disabled' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function injectStyle() {
  if (document.getElementById('cm-style')) return;
  const st = document.createElement('style');
  st.id = 'cm-style';
  st.textContent = `
.cm-form{display:flex;flex-direction:column;gap:.6rem}
.cm-form label{display:flex;flex-direction:column;font-size:.8rem;color:#5b6b7f;gap:.2rem}
.cm-form input,.cm-form select,.cm-form textarea,.cm-bar select{padding:.45rem .6rem;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
.cm-form textarea{min-height:6rem;resize:vertical}
.cm-card{margin-bottom:1rem}
.cm-item{border-bottom:1px solid #e3e9f0;padding:.8rem 0}
.cm-item:last-child{border-bottom:0}
.cm-item h4{margin:0 0 .3rem;color:#0d3b8c}
.cm-meta{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;color:#5b6b7f;font-size:.8rem;margin-bottom:.4rem}
.cm-text{white-space:pre-wrap;margin:0}`;
  document.head.append(st);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, auth, ui } = ctx;
  const toast = (m) => (ui && ui.toast ? ui.toast(m) : null);
  const state = { grupo: '' };

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast(t('common.copiado')); } catch (e) { toast(t('comu.errCopiar')); }
  }

  function publish(form) {
    const f = new FormData(form);
    const titulo = (f.get('titulo') || '').trim(), texto = (f.get('texto') || '').trim();
    if (!titulo || !texto) { toast(t('comu.faltaTexto')); return; }
    store.upsert('Comunicaciones', {
      fecha: iso(new Date()), titulo, texto, grupoId: f.get('grupoId') || '',
      autor: (auth.user && (auth.user.name || auth.user.email)) || t('comu.autorDefecto')
    });
    toast(t('comu.publicado'));
    draw();
  }

  function draw() {
    const grupos = store.list('Grupos');
    const gName = (id) => { const g = store.get('Grupos', id); return g ? g.nombre : t('comu.grupo'); };
    let items = store.list('Comunicaciones');
    if (state.grupo === '__todos') items = items.filter((c) => !c.grupoId);
    else if (state.grupo) items = items.filter((c) => c.grupoId === state.grupo);
    items = items.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

    const form = H('form', { class: 'cm-form', onsubmit: (e) => { e.preventDefault(); publish(e.target); } },
      H('label', {}, t('comu.campoTitulo'), H('input', { type: 'text', name: 'titulo', required: true, maxlength: 120 })),
      H('label', {}, t('comu.destinatarios'), H('select', { name: 'grupoId' }, H('option', { value: '' }, t('comu.todoClub')),
        grupos.map((g) => H('option', { value: g.id }, g.nombre)))),
      H('label', {}, t('comu.mensaje'), H('textarea', { name: 'texto', required: true })),
      H('div', {}, H('button', { class: 'btn', type: 'submit' }, t('comu.publicar'))));

    const filtro = H('div', { class: 'cm-bar' },
      H('select', { onchange: (e) => { state.grupo = e.target.value; draw(); } },
        H('option', { value: '' }, t('comu.todosAvisos')), H('option', { value: '__todos', selected: state.grupo === '__todos' }, t('comu.soloGenerales')),
        grupos.map((g) => H('option', { value: g.id, selected: g.id === state.grupo }, g.nombre))));

    const list = items.map((c) => H('div', { class: 'cm-item' },
      H('h4', {}, c.titulo),
      H('div', { class: 'cm-meta' },
        H('span', {}, tDate(c.fecha)), H('span', {}, c.autor ? `· ${c.autor}` : ''),
        H('span', { class: 'badge' }, c.grupoId ? gName(c.grupoId) : t('comu.todos')),
        H('button', { class: 'btn', type: 'button', onclick: () => copiar(`${c.titulo}\n\n${c.texto}`) }, t('comu.copiar')),
        H('button', { class: 'btn', type: 'button', onclick: async () => {
          const ok = ui && ui.confirmDialog ? await ui.confirmDialog(t('comu.confirmEliminar')) : true;
          if (ok) { store.remove('Comunicaciones', c.id); draw(); }
        } }, t('comu.eliminar'))),
      H('p', { class: 'cm-text' }, c.texto)));

    container.replaceChildren(
      H('h2', {}, t('comu.titulo')),
      H('p', { class: 'muted' }, t('comu.ayuda')),
      H('div', { class: 'card cm-card' }, H('h3', {}, t('comu.nuevo')), form),
      H('div', { class: 'card cm-card' }, H('h3', {}, t('comu.avisos')), filtro, list.length ? list : H('p', {}, t('comu.vacio'))));
  }

  draw();
}
