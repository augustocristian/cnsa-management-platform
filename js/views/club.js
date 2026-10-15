// Vista Configuración: identidad del club, dónde se guardan los datos (Drive), copias .xlsx y preferencias.
import { t } from '../i18n.js';
import { renderGestor } from './cargas-contenidos.js';
import { preferencias } from '../preferencias.js';

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
  .clb-actions .btn{min-height:44px}
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

// Enlaces al fichero del club y a la carpeta cnl en Drive (la carpeta se resuelve al pulsar).
function buildDrive(ctx, ui) {
  const h = ui.h;
  const ref = ctx.store.clubRef;
  const nombre = (ctx.store.club && ctx.store.club.nombre) || (ref && ref.name) || '';
  const items = [h('p', null, t('club.dondeTexto', { nombre }))];
  const acciones = h('div', { class: 'clb-actions' });
  if (ref && ref.id) {
    acciones.append(h('a', { class: 'btn', id: 'clb-abrir-fichero', href: 'https://drive.google.com/file/d/' + ref.id + '/view', target: '_blank', rel: 'noopener noreferrer' }, t('club.abrirFichero')));
    const bCarpeta = h('button', { type: 'button', class: 'btn', id: 'clb-abrir-carpeta' }, t('club.abrirCarpeta'));
    bCarpeta.addEventListener('click', async () => {
      try {
        const { drive } = await import('../drive.js');
        const id = await drive.ensureFolder();
        window.open(drive.folderUrl(id), '_blank', 'noopener');
      } catch (e) { ui.toast(e.message || String(e)); }
    });
    acciones.append(bCarpeta);
  }
  return h('div', { class: 'card clb-card' }, h('h3', {}, t('club.dondeTitulo')), ...items, acciones);
}

export async function render(container, params, ctx) {
  const { store, ui } = ctx;
  const h = ui.h;
  injectStyle();
  container.replaceChildren();

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

  // ---- Datos: sincronización y copias de seguridad ----
  const estado = h('span', { class: 'badge', id: 'clb-estado' }, store.status || '');
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
  const bGuardarXlsx = h('button', { type: 'button', class: 'btn', id: 'clb-guardar-xlsx' }, t('club.guardarXlsx'));
  bGuardarXlsx.addEventListener('click', async () => {
    bGuardarXlsx.disabled = true;
    try { const f = await store.guardarXlsxEnDrive(); ui.toast(t('club.xlsxGuardado', { nombre: f.name })); }
    catch (e) { ui.toast(t('club.errExport', { msg: e.message })); }
    bGuardarXlsx.disabled = false;
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
    h('div', { class: 'clb-actions' }, bSync, bExp, bGuardarXlsx, bImp, inImp, h('span', {}, t('club.estado')), estado));

  // ---- Preferencias del usuario (cnl/preferencias.json) ----
  const prefEstado = h('p', { class: 'muted', id: 'clb-prefs-estado', 'aria-live': 'polite' });
  const pintaPrefs = () => { prefEstado.textContent = t('club.prefsEstado', { estado: t('prefs.estado.' + preferencias.estado) }); };
  pintaPrefs();
  const offPrefs = preferencias.on(() => { if (prefEstado.isConnected) pintaPrefs(); else offPrefs(); });
  const bPrefs = h('button', { type: 'button', class: 'btn' }, t('club.prefsSincronizar'));
  bPrefs.addEventListener('click', async () => {
    const r = await preferencias.sincronizar();
    pintaPrefs();
    ui.toast(r.ok ? t('club.prefsSincronizadas') : t('club.errSync', { msg: (r.error && r.error.message) || '' }));
  });
  const prefs = h('div', { class: 'card clb-card' }, h('h3', {}, t('club.prefsTitulo')), h('p', null, t('club.prefsTexto')), prefEstado, h('div', { class: 'clb-actions' }, bPrefs));

  // ---- Clubes ----
  const bCambiar = h('button', { type: 'button', class: 'btn', id: 'clb-cambiar' }, t('club.cambiarClub'));
  bCambiar.addEventListener('click', async () => {
    try { sessionStorage.setItem('cnl:elegir', '1'); } catch (e) { /* ignorar */ }
    await preferencias.flush();
    location.hash = '';
    location.reload();
  });
  const clubes = h('div', { class: 'card clb-card' }, h('h3', {}, t('club.clubesTitulo')), h('div', { class: 'clb-actions' }, bCambiar));

  // Contenidos de entrenamiento (catálogo de cargas)
  const contenidosHost = h('div');
  renderGestor(contenidosHost, ctx);
  const contenidos = h('div', { class: 'card clb-card' }, h('h3', {}, t('tc.titulo')), contenidosHost);

  container.append(h('div', { class: 'clb-wrap' }, identidad, contenidos, buildDrive(ctx, ui), datos, prefs, clubes));
}
