// Vista Club: identidad, usuarios/roles, importar/exportar y sincronización.
import { t, tRol } from '../i18n.js';
const ROLES = ['admin', 'entrenador', 'nadador'];

function injectStyle() {
  if (document.getElementById('clb-style')) return;
  const s = document.createElement('style');
  s.id = 'clb-style';
  s.textContent = `
  .clb-wrap{display:grid;gap:16px;max-width:900px}
  .clb-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:12px}
  .clb-row label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:#555;flex:1;min-width:160px}
  .clb-row input,.clb-row select{padding:8px;border:1px solid #cfd4dc;border-radius:8px;font:inherit}
  .clb-row input[type=color]{padding:2px;height:38px}
  .clb-logo{width:72px;height:72px;border-radius:12px;border:1px dashed #cfd4dc;object-fit:contain;background:#fafafa}
  .clb-card h3{margin:0 0 12px;color:#174ea6}
  .clb-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .clb-table{width:100%;border-collapse:collapse}
  .clb-table td,.clb-table th{padding:6px;border-bottom:1px solid #eee;text-align:left;font-size:.9rem}
  `;
  document.head.append(s);
}

// Reduce el logo a 256px máx. y lo devuelve como dataURL
function fileToLogo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(t('club.imagenInvalida')));
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// Bloque 'Compartir': enlace/ID de la hoja de Google, copiar, abrir y compartir por email (Drive permissions).
function buildCompartir(ctx) {
  const { store, ui } = ctx;
  const h = ui.h;
  const ref = store.clubRef;
  if (!ref || ref.local || !ref.id) {
    return h('div', { class: 'card clb-card' }, h('h3', {}, t('club.compartir')),
      h('p', { class: 'muted' }, t('club.localSinHoja')));
  }
  const url = 'https://docs.google.com/spreadsheets/d/' + ref.id + '/edit';
  const inUrl = h('input', { type: 'text', readonly: 'readonly', value: url, 'aria-label': t('club.enlaceHoja') });
  inUrl.addEventListener('focus', () => inUrl.select());
  const bCopy = h('button', { type: 'button', class: 'btn' }, t('club.copiarEnlace'));
  bCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); ui.toast(t('club.enlaceCopiado')); }
    catch (e) { inUrl.select(); ui.toast(t('club.pulsaCopiar')); }
  });
  const bId = h('button', { type: 'button', class: 'btn' }, t('club.copiarId'));
  bId.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ref.id); ui.toast(t('club.idCopiado')); } catch (e) { ui.toast(t('club.idMsg', { id: ref.id })); }
  });
  const bOpen = h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, t('club.abrirSheets'));
  const inMail = h('input', { type: 'email', placeholder: t('club.placeholderEmail') });
  const bShare = h('button', { type: 'button', class: 'btn btn-primary' }, t('club.compartirEmail'));
  bShare.addEventListener('click', async () => {
    const email = inMail.value.trim();
    bShare.disabled = true;
    try {
      const { drive } = await import('../drive.js');
      await drive.shareWithEmail(ref.id, email, 'writer');
      ui.toast(t('club.hojaCompartida', { email }));
      inMail.value = '';
    } catch (e) { ui.toast(e.message || String(e)); }
    bShare.disabled = false;
  });
  return h('div', { class: 'card clb-card' }, h('h3', {}, t('club.compartir')),
    h('p', {}, t('club.compIntro')),
    h('ol', {},
      h('li', {}, t('club.comp1')),
      h('li', {}, t('club.comp2')),
      h('li', {}, t('club.comp3')),
      h('li', {}, t('club.comp4'))),
    h('div', { class: 'clb-row' }, h('label', {}, t('club.enlaceHoja'), inUrl)),
    h('div', { class: 'clb-actions' }, bCopy, bId, bOpen),
    h('div', { class: 'clb-row', style: 'margin-top:12px' }, h('label', {}, t('club.compartirCon'), inMail), bShare),
    h('p', { class: 'muted' }, t('club.compNota')));
}

export async function render(container, params, ctx) {
  const { store, auth, ui } = ctx;
  const h = ui.h;
  injectStyle();
  container.replaceChildren();

  if (auth.role && auth.role() !== 'admin') {
    container.append(h('div', { class: 'card' }, t('club.soloAdmin')));
    return;
  }

  const club = { ...(store.club || {}) };

  // ---- Identidad ----
  const inNombre = h('input', { type: 'text', value: club.nombre || '' });
  const inLema = h('input', { type: 'text', value: club.lema || '' });
  const inC1 = h('input', { type: 'color', value: club.colorPrimario || '#1a73e8' });
  const inC2 = h('input', { type: 'color', value: club.colorSecundario || '#174ea6' });
  const logo = h('img', { class: 'clb-logo', alt: t('club.logoAlt') });
  if (club.logo) logo.src = club.logo;
  const inLogo = h('input', { type: 'file', accept: 'image/*' });
  inLogo.addEventListener('change', async () => {
    const f = inLogo.files[0];
    if (!f) return;
    try { club.logo = await fileToLogo(f); logo.src = club.logo; } catch (e) { ui.toast(e.message); }
  });
  const btnQuitar = h('button', { type: 'button', class: 'btn' }, t('club.quitarLogo'));
  btnQuitar.addEventListener('click', () => { club.logo = ''; logo.removeAttribute('src'); inLogo.value = ''; });
  const btnGuardar = h('button', { type: 'button', class: 'btn btn-primary' }, t('club.guardarIdentidad'));
  btnGuardar.addEventListener('click', () => {
    store.setClub({ ...store.club, nombre: inNombre.value.trim(), lema: inLema.value.trim(), logo: club.logo || '', colorPrimario: inC1.value, colorSecundario: inC2.value });
    ui.toast(t('club.identidadGuardada'));
  });
  const identidad = h('div', { class: 'card clb-card' }, h('h3', {}, t('club.identidad')),
    h('div', { class: 'clb-row' }, h('label', {}, t('club.nombre'), inNombre), h('label', {}, t('club.lema'), inLema)),
    h('div', { class: 'clb-row' }, logo, h('label', {}, t('club.logo'), inLogo), btnQuitar),
    h('div', { class: 'clb-row' }, h('label', {}, t('club.colorPrimario'), inC1), h('label', {}, t('club.colorSecundario'), inC2)),
    btnGuardar);

  // ---- Usuarios ----
  const usuariosBox = h('div', { class: 'card clb-card' }, h('h3', {}, t('club.usuarios')));
  const nadadores = store.list('Nadadores');
  let editId = null;
  const uEmail = h('input', { type: 'email', placeholder: t('club.placeholderEmail') });
  const uNombre = h('input', { type: 'text' });
  const uRol = h('select', {}, ...ROLES.map((r) => h('option', { value: r }, tRol(r))));
  const uNad = h('select', {}, h('option', { value: '' }, t('club.ninguno')),
    ...nadadores.map((n) => h('option', { value: n.id }, `${n.nombre} ${n.apellidos || ''}`)));
  const btnU = h('button', { type: 'button', class: 'btn btn-primary' }, t('club.anadirUsuario'));
  const tabla = h('table', { class: 'table clb-table' });

  function resetForm() {
    editId = null; uEmail.value = ''; uNombre.value = ''; uRol.value = 'entrenador'; uNad.value = ''; btnU.textContent = t('club.anadirUsuario');
  }
  function pintaTabla() {
    tabla.replaceChildren(h('tr', {}, ...[t('club.colEmail'), t('club.colNombre'), t('club.colRol'), t('club.colNadador'), ''].map((c) => h('th', {}, c))));
    for (const u of store.list('Usuarios')) {
      const n = nadadores.find((x) => x.id === u.nadadorId);
      const bE = h('button', { type: 'button', class: 'btn' }, t('club.editar'));
      bE.addEventListener('click', () => {
        editId = u.id; uEmail.value = u.email || ''; uNombre.value = u.nombre || ''; uRol.value = u.rol || 'nadador'; uNad.value = u.nadadorId || ''; btnU.textContent = t('club.guardarCambios');
      });
      const bD = h('button', { type: 'button', class: 'btn' }, t('club.eliminar'));
      bD.addEventListener('click', async () => {
        if (await ui.confirmDialog(t('club.confirmEliminarUsuario', { email: u.email }))) { store.remove('Usuarios', u.id); pintaTabla(); }
      });
      tabla.append(h('tr', {}, h('td', {}, u.email || ''), h('td', {}, u.nombre || ''), h('td', {}, h('span', { class: 'badge' }, tRol(u.rol || ''))),
        h('td', {}, n ? `${n.nombre} ${n.apellidos || ''}` : ''), h('td', {}, bE, ' ', bD)));
    }
  }
  btnU.addEventListener('click', () => {
    const email = uEmail.value.trim().toLowerCase();
    if (!email || !email.includes('@')) { ui.toast(t('club.emailInvalido')); return; }
    const row = { email, nombre: uNombre.value.trim(), rol: uRol.value, nadadorId: uRol.value === 'nadador' ? uNad.value : '' };
    if (editId) row.id = editId;
    store.upsert('Usuarios', row);
    resetForm(); pintaTabla(); ui.toast(t('club.usuarioGuardado'));
  });
  usuariosBox.append(
    h('div', { class: 'clb-row' }, h('label', {}, t('club.colEmail'), uEmail), h('label', {}, t('club.colNombre'), uNombre), h('label', {}, t('club.colRol'), uRol), h('label', {}, t('club.nadadorVinculado'), uNad)),
    btnU, tabla);
  pintaTabla();

  // ---- Datos ----
  const estado = h('span', { class: 'badge' }, store.status || '');
  const unsub = store.on ? store.on(() => { if (estado.isConnected) estado.textContent = store.status || ''; }) : null;
  void unsub;
  const bSync = h('button', { type: 'button', class: 'btn btn-primary' }, t('club.sincronizar'));
  bSync.addEventListener('click', async () => {
    try { await store.sync(); ui.toast(t('club.sincronizado')); } catch (e) { ui.toast(t('club.errSync', { msg: e.message })); }
  });
  const bExp = h('button', { type: 'button', class: 'btn' }, t('club.exportar'));
  bExp.addEventListener('click', async () => {
    try { await store.exportXlsx(); } catch (e) { ui.toast(t('club.errExport', { msg: e.message })); }
  });
  const inImp = h('input', { type: 'file', accept: '.xlsx', style: 'display:none' });
  const bImp = h('button', { type: 'button', class: 'btn' }, t('club.importar'));
  bImp.addEventListener('click', () => inImp.click());
  inImp.addEventListener('change', async () => {
    const f = inImp.files[0];
    if (!f) return;
    if (!(await ui.confirmDialog(t('club.confirmImportar')))) { inImp.value = ''; return; }
    try { await store.importXlsx(f); ui.toast(t('club.importado')); await render(container, params, ctx); }
    catch (e) { ui.toast(t('club.errImport', { msg: e.message })); }
    inImp.value = '';
  });
  const datos = h('div', { class: 'card clb-card' }, h('h3', {}, t('club.datos')),
    h('div', { class: 'clb-actions' }, bSync, bExp, bImp, inImp, h('span', {}, t('club.estado')), estado));

  container.append(h('div', { class: 'clb-wrap' }, identidad, usuariosBox, buildCompartir(ctx), datos));
}
