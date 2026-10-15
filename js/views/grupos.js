// Vista Grupos: CRUD de grupos y nadadores por grupo.
import { CATEGORIAS } from '../schema.js';

const P = 'grp-';

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const isActivo = (n) => !['false', 'no', '0', 'n', ''].includes(String(n.activo ?? 'true').toLowerCase());

function injectStyle() {
  if (document.getElementById('grp-style')) return;
  const s = document.createElement('style');
  s.id = 'grp-style';
  s.textContent = `
.grp-head{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between;margin-bottom:1rem}
.grp-head h1{margin:0;font-size:1.4rem}
.grp-card h2{margin:0 0 .3rem;font-size:1.1rem}
.grp-muted{color:#6b7a90;font-size:.9rem}
.grp-actions{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.7rem}
.grp-list{list-style:none;margin:.6rem 0 0;padding:0;max-height:240px;overflow:auto}
.grp-list li{padding:.3rem 0;border-bottom:1px solid #eef2f8}
.grp-list a{color:#1a4d9c;text-decoration:none}
.grp-ov{position:fixed;inset:0;background:rgba(10,20,40,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem}
.grp-modal{background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:1.2rem;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.grp-modal h2{margin:0 0 .8rem}
.grp-form{display:grid;gap:.6rem}
.grp-form label{display:flex;flex-direction:column;font-size:.8rem;color:#445;gap:.2rem}
.grp-form input,.grp-form select{padding:.5rem;border:1px solid #cfd8e6;border-radius:8px;font:inherit}
.grp-mfoot{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}
`;
  document.head.appendChild(s);
}

function openModal(title, bodyEl, buttons) {
  const ov = h('div', { class: P + 'ov' });
  const close = () => ov.remove();
  const foot = h('div', { class: P + 'mfoot' }, buttons.map((b) =>
    h('button', {
      type: 'button', class: 'btn ' + (b.cls || ''),
      onclick: () => { if (b.onClick && b.onClick() === false) return; close(); },
    }, b.label)));
  ov.appendChild(h('div', { class: P + 'modal' }, h('h2', {}, title), bodyEl, foot));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, auth, ui } = ctx;
  const role = auth.role();
  const canEdit = role === 'admin' || role === 'entrenador';
  if (!canEdit) {
    container.replaceChildren(h('div', { class: 'card' }, 'No tienes permisos para ver esta sección.'));
    return;
  }
  const refresh = () => render(container, params, ctx);

  function editar(g) {
    const isNew = !g;
    g = g || {};
    const nombre = h('input', { type: 'text', value: g.nombre || '' });
    const categoria = h('select', {}, h('option', { value: '' }, '—'),
      CATEGORIAS.map((c) => h('option', { value: c, selected: c === g.categoria }, c)));
    const entrenador = h('input', { type: 'text', value: g.entrenador || '' });
    const body = h('div', { class: P + 'form' },
      h('label', {}, 'Nombre *', nombre), h('label', {}, 'Categoría', categoria), h('label', {}, 'Entrenador', entrenador));
    openModal(isNew ? 'Nuevo grupo' : 'Editar grupo', body, [
      { label: 'Cancelar' },
      {
        label: 'Guardar', cls: 'btn-primary', onClick: () => {
          if (!nombre.value.trim()) { ui.toast('El nombre es obligatorio'); return false; }
          store.upsert('Grupos', { ...g, nombre: nombre.value.trim(), categoria: categoria.value, entrenador: entrenador.value.trim() });
          ui.toast('Grupo guardado');
          refresh();
        },
      },
    ]);
  }

  async function borrar(g, miembros) {
    const ok = await ui.confirmDialog(`¿Eliminar el grupo "${g.nombre}"? Sus ${miembros.length} nadadores quedarán sin grupo.`);
    if (!ok) return;
    miembros.forEach((n) => store.upsert('Nadadores', { ...n, grupoId: '' }));
    store.remove('Grupos', g.id);
    ui.toast('Grupo eliminado');
    refresh();
  }

  const catIdx = (c) => { const i = CATEGORIAS.indexOf(c); return i < 0 ? 99 : i; };
  const grupos = store.list('Grupos').sort((a, b) => catIdx(a.categoria) - catIdx(b.categoria) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  const nadadores = store.list('Nadadores').filter(isActivo);

  const tarjetas = grupos.map((g) => {
    const miembros = nadadores.filter((n) => n.grupoId === g.id)
      .sort((a, b) => String(a.apellidos).localeCompare(String(b.apellidos), 'es'));
    return h('div', { class: `card ${P}card` },
      h('h2', {}, g.nombre, ' ', g.categoria ? h('span', { class: 'badge' }, g.categoria) : null),
      h('div', { class: P + 'muted' }, `Entrenador: ${g.entrenador || '-'} · ${miembros.length} nadador${miembros.length === 1 ? '' : 'es'}`),
      miembros.length ? h('ul', { class: P + 'list' }, miembros.map((n) =>
        h('li', {}, h('a', { href: `#/nadadores/${n.id}` }, `${n.apellidos || ''}, ${n.nombre || ''}`)))) : h('p', { class: P + 'muted' }, 'Sin nadadores.'),
      h('div', { class: P + 'actions' },
        h('button', { class: 'btn', onclick: () => editar(g) }, 'Editar'),
        h('button', { class: 'btn', onclick: () => borrar(g, store.list('Nadadores').filter((n) => n.grupoId === g.id)) }, 'Eliminar')));
  });

  const sinGrupo = nadadores.filter((n) => !n.grupoId || !grupos.some((g) => g.id === n.grupoId));

  container.replaceChildren(
    h('div', { class: P + 'head' },
      h('h1', {}, 'Grupos'),
      h('button', { class: 'btn', onclick: () => editar(null) }, '+ Nuevo grupo')),
    grupos.length ? h('div', { class: 'grid' }, tarjetas) : h('div', { class: 'card' }, 'Aún no hay grupos. Crea el primero.'),
    sinGrupo.length ? h('div', { class: `card ${P}card`, style: 'margin-top:1rem' },
      h('h2', {}, 'Sin grupo'),
      h('ul', { class: P + 'list' }, sinGrupo.map((n) =>
        h('li', {}, h('a', { href: `#/nadadores/${n.id}` }, `${n.apellidos || ''}, ${n.nombre || ''}`)))) ) : null);
}
