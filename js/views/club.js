// Vista Club: identidad, usuarios/roles, importar/exportar y sincronización.
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
      img.onerror = () => reject(new Error('Imagen no válida'));
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

export async function render(container, params, ctx) {
  const { store, auth, ui } = ctx;
  const h = ui.h;
  injectStyle();
  container.replaceChildren();

  if (auth.role && auth.role() !== 'admin') {
    container.append(h('div', { class: 'card' }, 'Sólo los administradores pueden acceder a la configuración del club.'));
    return;
  }

  const club = { ...(store.club || {}) };

  // ---- Identidad ----
  const inNombre = h('input', { type: 'text', value: club.nombre || '' });
  const inLema = h('input', { type: 'text', value: club.lema || '' });
  const inC1 = h('input', { type: 'color', value: club.colorPrimario || '#1a73e8' });
  const inC2 = h('input', { type: 'color', value: club.colorSecundario || '#174ea6' });
  const logo = h('img', { class: 'clb-logo', alt: 'Logo' });
  if (club.logo) logo.src = club.logo;
  const inLogo = h('input', { type: 'file', accept: 'image/*' });
  inLogo.addEventListener('change', async () => {
    const f = inLogo.files[0];
    if (!f) return;
    try { club.logo = await fileToLogo(f); logo.src = club.logo; } catch (e) { ui.toast(e.message); }
  });
  const btnQuitar = h('button', { type: 'button', class: 'btn' }, 'Quitar logo');
  btnQuitar.addEventListener('click', () => { club.logo = ''; logo.removeAttribute('src'); inLogo.value = ''; });
  const btnGuardar = h('button', { type: 'button', class: 'btn btn-primary' }, 'Guardar identidad');
  btnGuardar.addEventListener('click', () => {
    store.setClub({ ...store.club, nombre: inNombre.value.trim(), lema: inLema.value.trim(), logo: club.logo || '', colorPrimario: inC1.value, colorSecundario: inC2.value });
    ui.toast('Identidad guardada');
  });
  const identidad = h('div', { class: 'card clb-card' }, h('h3', {}, 'Identidad del club'),
    h('div', { class: 'clb-row' }, h('label', {}, 'Nombre', inNombre), h('label', {}, 'Lema', inLema)),
    h('div', { class: 'clb-row' }, logo, h('label', {}, 'Logo', inLogo), btnQuitar),
    h('div', { class: 'clb-row' }, h('label', {}, 'Color primario', inC1), h('label', {}, 'Color secundario', inC2)),
    btnGuardar);

  // ---- Usuarios ----
  const usuariosBox = h('div', { class: 'card clb-card' }, h('h3', {}, 'Usuarios y roles'));
  const nadadores = store.list('Nadadores');
  let editId = null;
  const uEmail = h('input', { type: 'email', placeholder: 'correo@ejemplo.com' });
  const uNombre = h('input', { type: 'text' });
  const uRol = h('select', {}, ...ROLES.map((r) => h('option', { value: r }, r)));
  const uNad = h('select', {}, h('option', { value: '' }, '— ninguno —'),
    ...nadadores.map((n) => h('option', { value: n.id }, `${n.nombre} ${n.apellidos || ''}`)));
  const btnU = h('button', { type: 'button', class: 'btn btn-primary' }, 'Añadir usuario');
  const tabla = h('table', { class: 'table clb-table' });

  function resetForm() {
    editId = null; uEmail.value = ''; uNombre.value = ''; uRol.value = 'entrenador'; uNad.value = ''; btnU.textContent = 'Añadir usuario';
  }
  function pintaTabla() {
    tabla.replaceChildren(h('tr', {}, ...['Email', 'Nombre', 'Rol', 'Nadador', ''].map((t) => h('th', {}, t))));
    for (const u of store.list('Usuarios')) {
      const n = nadadores.find((x) => x.id === u.nadadorId);
      const bE = h('button', { type: 'button', class: 'btn' }, 'Editar');
      bE.addEventListener('click', () => {
        editId = u.id; uEmail.value = u.email || ''; uNombre.value = u.nombre || ''; uRol.value = u.rol || 'nadador'; uNad.value = u.nadadorId || ''; btnU.textContent = 'Guardar cambios';
      });
      const bD = h('button', { type: 'button', class: 'btn' }, 'Eliminar');
      bD.addEventListener('click', async () => {
        if (await ui.confirmDialog(`¿Eliminar a ${u.email}?`)) { store.remove('Usuarios', u.id); pintaTabla(); }
      });
      tabla.append(h('tr', {}, h('td', {}, u.email || ''), h('td', {}, u.nombre || ''), h('td', {}, h('span', { class: 'badge' }, u.rol || '')),
        h('td', {}, n ? `${n.nombre} ${n.apellidos || ''}` : ''), h('td', {}, bE, ' ', bD)));
    }
  }
  btnU.addEventListener('click', () => {
    const email = uEmail.value.trim().toLowerCase();
    if (!email || !email.includes('@')) { ui.toast('Introduce un email válido'); return; }
    const row = { email, nombre: uNombre.value.trim(), rol: uRol.value, nadadorId: uRol.value === 'nadador' ? uNad.value : '' };
    if (editId) row.id = editId;
    store.upsert('Usuarios', row);
    resetForm(); pintaTabla(); ui.toast('Usuario guardado');
  });
  usuariosBox.append(
    h('div', { class: 'clb-row' }, h('label', {}, 'Email', uEmail), h('label', {}, 'Nombre', uNombre), h('label', {}, 'Rol', uRol), h('label', {}, 'Nadador vinculado', uNad)),
    btnU, tabla);
  pintaTabla();

  // ---- Datos ----
  const estado = h('span', { class: 'badge' }, store.status || '');
  const unsub = store.on ? store.on(() => { if (estado.isConnected) estado.textContent = store.status || ''; }) : null;
  void unsub;
  const bSync = h('button', { type: 'button', class: 'btn btn-primary' }, 'Sincronizar');
  bSync.addEventListener('click', async () => {
    try { await store.sync(); ui.toast('Sincronizado'); } catch (e) { ui.toast('Error al sincronizar: ' + e.message); }
  });
  const bExp = h('button', { type: 'button', class: 'btn' }, 'Exportar .xlsx');
  bExp.addEventListener('click', async () => {
    try { await store.exportXlsx(); } catch (e) { ui.toast('Error al exportar: ' + e.message); }
  });
  const inImp = h('input', { type: 'file', accept: '.xlsx', style: 'display:none' });
  const bImp = h('button', { type: 'button', class: 'btn' }, 'Importar .xlsx');
  bImp.addEventListener('click', () => inImp.click());
  inImp.addEventListener('change', async () => {
    const f = inImp.files[0];
    if (!f) return;
    if (!(await ui.confirmDialog('Importar reemplazará los datos actuales del club. ¿Continuar?'))) { inImp.value = ''; return; }
    try { await store.importXlsx(f); ui.toast('Importación completada'); await render(container, params, ctx); }
    catch (e) { ui.toast('Error al importar: ' + e.message); }
    inImp.value = '';
  });
  const datos = h('div', { class: 'card clb-card' }, h('h3', {}, 'Datos y sincronización'),
    h('div', { class: 'clb-actions' }, bSync, bExp, bImp, inImp, h('span', {}, 'Estado: '), estado));

  container.append(h('div', { class: 'clb-wrap' }, identidad, usuariosBox, datos));
}
