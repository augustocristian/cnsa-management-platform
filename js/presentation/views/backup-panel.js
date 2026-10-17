// Settings > Backup: download a complete backup (optionally encrypted), restore from a file (preview, replace/merge, typed
// confirmation, undo through the safety copy) and restore from the copies the app keeps in Drive.
// Presentation only: every rule lives in application/backupService.js and domain/backup.js.
import { h, field, fieldError, clearFieldError, sheet, confirmDialog, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, locale, setLang } from '../i18n/i18n.js';
import { setTheme } from '../theme.js';
import { useStyles } from '../styles.js';
import { evaluarPassphrase } from '../../domain/backup.js';

// Result of the last restore, kept for the session so that "Revert restore" survives a redraw of Settings.
const memoria = { clubId: null, exito: null };

const alerta = (tono, titulo, texto, { role } = {}) =>
  h('div', { class: `alert alert--${tono}`, role: role || null },
    icon(tono === 'ok' ? 'check' : tono === 'info' ? 'info' : 'aviso'),
    h('div', null, titulo ? h('p', { class: 'alert-title' }, titulo) : null, texto ? h('p', null, texto) : null));

const boton = (props, ...hijos) => h('button', { type: 'button', ...props }, ...hijos);
const fechaHora = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? t('backup.valida.sin-fecha') : new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};
const fechaDia = (fecha, hora) => {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const [hh, mm] = hora ? hora.split(':').map(Number) : [0, 0];
  return new Intl.DateTimeFormat(locale(), hora ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(y, m - 1, d, hh, mm));
};

// Error with a `code` -> translated text
export function textoError(e) {
  const code = e && e.code;
  if (code === 'restauracion-fallida') return t(e.revertido ? 'backup.err.restauracion-fallida' : 'backup.err.restauracion-fallida-sin-revertir');
  if (code && t('backup.err.' + code) !== 'backup.err.' + code) return t('backup.err.' + code, { version: e.version });
  return t('backup.err.generico', { msg: (e && e.message) || String(e) });
}

// ctx: {store, backup? (service, tests), ahora?, recargar? (redraws Settings)} -> Node
export function renderBackupPanel(ctx) {
  useStyles('backup');
  const svc = ctx.backup && ctx.backup.crearBackup ? ctx.backup : ctx.servicioBackup({ store: ctx.store, ahora: ctx.ahora });
  const nombreClub = () => svc.nombreClub();
  const demo = svc.modo() === 'demo';
  const clubId = ctx.store.clubRef ? ctx.store.clubRef.id : null;
  if (memoria.clubId !== clubId) { memoria.clubId = clubId; memoria.exito = null; }

  // ===================== 1. Download =====================
  const pass = h('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', id: 'backup-pass' });
  const pass2 = h('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', id: 'backup-pass2' });
  const fuerzaTexto = h('p', { class: 'backup-strength-text', id: 'backup-fuerza', 'aria-live': 'polite' });
  const barra = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span'));
  const pintaFuerza = () => {
    const f = evaluarPassphrase(pass.value);
    fuerzaTexto.textContent = pass.value ? t('backup.pass.fuerza', { nivel: t('backup.pass.nivel.' + f.clave) }) : '';
    barra.style.setProperty('--value', pass.value ? `${Math.max(f.nivel, f.clave === 'corta' ? 0 : 1) * 33}%` : '0%');
    barra.className = 'progress ' + (f.nivel >= 3 ? 'progress--ok' : f.nivel === 2 ? 'progress--warn' : 'progress--danger');
    barra.hidden = !pass.value;
  };
  pass.addEventListener('input', pintaFuerza);
  pintaFuerza();
  const estadoDescarga = h('p', { class: 'backup-status', role: 'status', 'aria-live': 'polite', id: 'backup-descarga-estado' });
  const ultima = h('div', { class: 'backup-last', id: 'backup-ultima' });
  const pintaUltima = () => {
    const u = svc.ultimaCopia();
    ultima.replaceChildren(h('h3', null, t('backup.ultima.titulo')));
    if (!u || !u.creada) ultima.append(h('p', null, t('backup.ultima.ninguna')));
    else ultima.append(h('p', null, t('backup.ultima.texto', { fecha: fechaHora(u.creada), filas: u.filas, nombre: u.nombre }) + (u.cifrada ? ' - ' + t('backup.ultima.cifrada') : '')));
  };
  pintaUltima();
  const btnDescargar = boton({ class: 'btn btn--primary', id: 'backup-descargar' }, icon('descargar'), t('backup.descargar'));
  btnDescargar.addEventListener('click', async () => {
    clearFieldError(pass); clearFieldError(pass2);
    if (pass.value && !evaluarPassphrase(pass.value).nivel) { fieldError(pass, t('backup.pass.corta')); return; }
    if (pass.value && pass.value !== pass2.value) { fieldError(pass2, t('backup.pass.no-coincide')); return; }
    btnDescargar.setAttribute('aria-busy', 'true');
    btnDescargar.disabled = true;
    estadoDescarga.textContent = t('backup.descargando');
    try {
      const r = await svc.descargarBackup({ passphrase: pass.value });
      estadoDescarga.textContent = t(r.cifrada ? 'backup.descargada-cifrada' : 'backup.descargada', { nombre: r.nombre, filas: r.resumen.total });
      if (r.avisos.some((a) => a.codigo === 'supera-limite')) toast.error(t('backup.supera-limite'));
      pass.value = ''; pass2.value = ''; pintaFuerza(); pintaUltima();
    } catch (e) {
      estadoDescarga.textContent = '';
      toast.error(textoError(e));
    } finally { btnDescargar.removeAttribute('aria-busy'); btnDescargar.disabled = false; }
  });
  const tarjetaDescarga = h('section', { class: 'card backup-card', 'aria-labelledby': 'backup-t' },
    h('h2', { id: 'backup-t' }, t('backup.titulo')),
    h('p', null, t('backup.intro')),
    alerta('warn', t('backup.privacidad.titulo'), t('backup.privacidad.texto')),
    field({ label: t('backup.pass.label'), input: pass, hint: t('backup.pass.hint') }),
    h('div', { class: 'backup-strength' }, barra, fuerzaTexto),
    field({ label: t('backup.pass2.label'), input: pass2 }),
    h('div', { class: 'backup-actions' }, btnDescargar),
    estadoDescarga,
    ultima);

  // ===================== 2. Restore from a file / Drive =====================
  const zona = h('div', { class: 'backup-result', 'aria-live': 'polite', id: 'backup-resultado' });
  const encabezado = h('h2', { id: 'backup-restaurar-t', tabindex: '-1' }, t('backup.restaurar.titulo'));
  let lectura = null; // {doc, resumen, comparacion, avisos, origen, fuente}
  let modo = 'replace';

  const archivo = h('input', { type: 'file', accept: '.json,application/json', id: 'backup-archivo' });
  const caja = h('label', { class: 'backup-drop', id: 'backup-drop' },
    h('span', { class: 'btn backup-drop-btn' }, icon('subir'), t('backup.archivo.elegir')), archivo,
    h('span', { class: 'backup-drop-hint' }, t('backup.archivo.arrastra')));
  caja.addEventListener('dragover', (ev) => { ev.preventDefault(); caja.classList.add('is-over'); });
  caja.addEventListener('dragenter', (ev) => { ev.preventDefault(); caja.classList.add('is-over'); });
  caja.addEventListener('dragleave', () => caja.classList.remove('is-over'));
  caja.addEventListener('drop', (ev) => {
    ev.preventDefault();
    caja.classList.remove('is-over');
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) leer(f);
  });
  archivo.addEventListener('change', () => { const f = archivo.files[0]; if (f) leer(f); });

  async function leer(file, passphrase = '') {
    zona.replaceChildren(h('p', { class: 'backup-status', role: 'status' }, t('backup.leyendo')));
    try {
      const r = await svc.leerBackup(file, { passphrase });
      lectura = { ...r, fuente: 'archivo' };
      pintaLectura();
    } catch (e) {
      if (e.code === 'requiere-passphrase' || (e.code === 'passphrase-incorrecta' && passphrase)) pintaPassphrase(file, e.code === 'passphrase-incorrecta');
      else { lectura = null; zona.replaceChildren(alerta('danger', null, textoError(e), { role: 'alert' })); }
    }
  }

  function pintaPassphrase(file, equivocada) {
    const campo = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', id: 'backup-pass-abrir' });
    const ir = async () => { if (!campo.value) { fieldError(campo, t('backup.err.requiere-passphrase')); return; } await leer(file, campo.value); };
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ir(); } });
    const f = field({ label: t('backup.passabrir.label'), input: campo });
    zona.replaceChildren(h('div', { class: 'backup-confirm' }, h('h3', null, t('backup.passabrir.titulo')), f,
      boton({ class: 'btn btn--primary', id: 'backup-desbloquear', onclick: ir }, t('backup.passabrir.boton'))));
    if (equivocada) fieldError(campo, t('backup.err.passphrase-incorrecta'));
    else campo.focus();
  }

  const tablaHost = h('div');
  function pintaTabla() {
    const c = lectura.comparacion;
    const fusion = modo === 'merge';
    const filas = c.hojas.filter((x) => x.enBackup || x.actuales);
    if (c.club.nuevas + c.club.cambiadas + c.club.eliminadas) {
      filas.push({ hoja: t('backup.tabla.club'), enBackup: '', actuales: '', nuevas: c.club.nuevas, cambiadas: c.club.cambiadas, eliminadas: c.club.eliminadas, club: true });
    }
    if (!c.hayCambios) { tablaHost.replaceChildren(alerta('info', null, t('backup.tabla.sin-cambios'))); return; }
    const cab = [t('backup.tabla.hoja'), t('backup.tabla.en-copia'), t('backup.tabla.actuales'), t('backup.tabla.nuevas'), t('backup.tabla.cambiadas'), t(fusion ? 'backup.tabla.conservadas' : 'backup.tabla.eliminadas')];
    const num = (v) => (v === '' ? '' : String(v));
    tablaHost.replaceChildren(
      h('h3', { class: 'backup-table-title' }, t('backup.tabla.titulo')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards backup-table', id: 'backup-tabla' },
        h('caption', { class: 'sr-only' }, t('backup.tabla.titulo')),
        h('thead', null, h('tr', null, cab.map((x, i) => h('th', { scope: 'col', class: i ? 'num' : null }, x)))),
        h('tbody', null, filas.map((f) => h('tr', null,
          h('td', { 'data-label': cab[0] }, f.hoja),
          h('td', { 'data-label': cab[1], class: 'num' }, num(f.enBackup)),
          h('td', { 'data-label': cab[2], class: 'num' }, num(f.actuales)),
          h('td', { 'data-label': cab[3], class: 'num' }, num(f.nuevas)),
          h('td', { 'data-label': cab[4], class: 'num' }, num(f.cambiadas)),
          h('td', { 'data-label': cab[5], class: 'num' }, num(f.eliminadas))))))));
  }

  function opcionModo(valor) {
    const radio = h('input', { type: 'radio', name: 'backup-modo', value: valor, checked: modo === valor });
    radio.addEventListener('change', () => { modo = valor; pintaTabla(); });
    return h('label', { class: 'backup-mode' }, radio,
      h('span', { class: 'backup-mode-name' }, t('backup.modo.' + valor)), h('span', { class: 'backup-mode-desc' }, t('backup.modo.' + valor + '-desc')));
  }

  function pintaLectura() {
    const { resumen, origen, comparacion } = lectura;
    const nodos = [
      alerta('ok', t('backup.valida.titulo'), t('backup.valida.texto', {
        club: resumen.club, fecha: resumen.creado ? fechaHora(resumen.creado) : t('backup.valida.sin-fecha'), filas: resumen.total, nadadores: resumen.nadadores,
      })),
    ];
    if (origen === 'documento-club') nodos.push(alerta('info', null, t('backup.origen.documento-club')));
    if (resumen.club && resumen.club !== nombreClub()) nodos.push(alerta('warn', null, t('backup.aviso.club-distinto', { copia: resumen.club, club: nombreClub() })));
    if (comparacion.omitidas) nodos.push(alerta('warn', null, t('backup.aviso.omitidas', { n: comparacion.omitidas })));
    if (comparacion.excluidas) nodos.push(alerta('warn', null, t('backup.aviso.rgpd', { n: comparacion.excluidas })));
    modo = 'replace';
    pintaTabla();
    const btn = boton({ class: 'btn btn--danger', id: 'backup-restaurar', onclick: confirmar }, icon('refrescar'), t('backup.restaurar.boton'));
    nodos.push(
      h('fieldset', { class: 'backup-modes' }, h('legend', null, t('backup.modo.leyenda')), opcionModo('replace'), opcionModo('merge')),
      tablaHost,
      h('div', { class: 'backup-actions' }, btn));
    zona.replaceChildren(...nodos);
    encabezado.focus();
  }

  // Typed confirmation: club name or the word RESTORE (replace). Merge only needs a confirmation.
  function confirmar() {
    const c = lectura.comparacion.total;
    const palabra = t('backup.confirmar.palabra');
    const campo = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', id: 'backup-confirmar-texto' });
    const reemplazar = modo === 'replace';
    const cuerpo = h('div', { class: 'backup-confirm' },
      h('p', null, t(reemplazar ? 'backup.confirmar.replace' : 'backup.confirmar.merge', { club: nombreClub(), nuevas: c.nuevas, cambiadas: c.cambiadas, eliminadas: c.eliminadas })),
      reemplazar ? field({ label: t('backup.confirmar.escribe', { club: nombreClub(), palabra }), input: campo }) : null);
    sheet({
      title: t('backup.confirmar.titulo'),
      body: cuerpo,
      actions: [
        { label: t('common.cancelar'), autofocus: !reemplazar },
        { label: t('backup.confirmar.boton'), danger: reemplazar, primary: !reemplazar, onClick: () => {
          if (reemplazar) {
            const v = campo.value.trim().toLowerCase();
            if (![nombreClub().toLowerCase(), palabra.toLowerCase(), 'restore'].includes(v) || !v) { fieldError(campo, t('backup.confirmar.no-coincide', { palabra })); return false; }
          }
          ejecutar();
          return true;
        } },
      ],
    });
  }

  async function ejecutar() {
    const { doc } = lectura;
    const barraRestaurar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': t('backup.restaurar.titulo') }, h('span'));
    const texto = h('p', { class: 'backup-progress-text', role: 'status' });
    const fases = { validando: 10, seguridad: 35, aplicando: 65, sincronizando: 85, listo: 100 };
    const avance = (fase) => {
      barraRestaurar.style.setProperty('--value', fases[fase] + '%');
      barraRestaurar.setAttribute('aria-valuenow', String(fases[fase]));
      texto.textContent = t('backup.fase.' + fase);
    };
    zona.replaceChildren(h('div', { class: 'backup-progress' }, barraRestaurar, texto));
    try {
      const r = await svc.restaurar(doc, { modo, onProgreso: avance });
      aplicarPreferenciasVisibles(doc, r);
      memoria.exito = r;
      lectura = null;
      archivo.value = '';
      if (ctx.recargar) { ctx.recargar(); } else { pintaExito(r); }
      toast.undo(t('backup.deshecho-aviso'), () => revertir(false), { timeout: 8000 });
    } catch (e) {
      zona.replaceChildren(alerta('danger', null, textoError(e), { role: 'alert' }));
      toast.error(textoError(e));
    }
  }

  // The service already saved the preferences; the language and the theme also have to be applied to the running page.
  function aplicarPreferenciasVisibles(doc, r) {
    const p = doc.preferences || {};
    try {
      if (r.preferencias.includes('idioma')) setLang(p.idioma, { persist: false });
      if (r.preferencias.includes('tema')) setTheme(p.tema, { persist: false });
    } catch (e) { /* cosmetic */ }
  }

  function pintaExito(r) {
    const total = r.total.nuevas + r.total.cambiadas + r.total.eliminadas;
    const lineas = [h('p', null, total || r.extras ? t('backup.exito.texto', { nuevas: r.total.nuevas, cambiadas: r.total.cambiadas, eliminadas: r.total.eliminadas }) : t('backup.exito.sin-cambios'))];
    if (r.seguridad) lineas.push(h('p', null, r.seguridad.destino === 'drive' ? t('backup.exito.seguridad-drive', { nombre: r.seguridad.nombre }) : t('backup.exito.seguridad-sesion')));
    if (r.omitidas) lineas.push(h('p', null, t('backup.exito.omitidas', { n: r.omitidas })));
    if (r.excluidas) lineas.push(h('p', null, t('backup.exito.rgpd', { n: r.excluidas })));
    if (r.preferencias.length) lineas.push(h('p', null, t('backup.exito.preferencias', { claves: r.preferencias.join(', ') })));
    if (!r.sincronizado) lineas.push(h('p', null, t('backup.exito.sin-sincronizar')));
    const acciones = h('div', { class: 'backup-actions' });
    if (svc.haySeguridad()) {
      acciones.append(boton({ class: 'btn', id: 'backup-revertir', onclick: () => revertir(true) }, icon('refrescar'), t('backup.revertir')));
      if (r.seguridad && r.seguridad.destino === 'sesion') {
        acciones.append(boton({ class: 'btn', id: 'backup-seguridad-descargar', onclick: async () => { try { await svc.descargarSeguridad(); } catch (e) { toast.error(textoError(e)); } } }, icon('descargar'), t('backup.seguridad.descargar')));
      }
    }
    zona.replaceChildren(h('div', { class: 'alert alert--ok', id: 'backup-exito', role: 'status' }, icon('check'),
      h('div', null, h('p', { class: 'alert-title' }, t('backup.exito.titulo')), ...lineas)), acciones);
  }

  async function revertir(preguntar) {
    if (!svc.haySeguridad()) return;
    if (preguntar && !(await confirmDialog(t('backup.revertir.confirmar'), { danger: true, okLabel: t('backup.revertir.boton') }))) return;
    try {
      await svc.revertirUltimaRestauracion();
      memoria.exito = null;
      toast(t('backup.revertida'));
      if (ctx.recargar) ctx.recargar(); else zona.replaceChildren(alerta('ok', t('backup.revertida'), null));
    } catch (e) { toast.error(textoError(e)); }
  }

  const tarjetaRestaurar = h('section', { class: 'card backup-card', 'aria-labelledby': 'backup-restaurar-t' },
    encabezado, h('p', null, t('backup.restaurar.texto')), caja, zona);
  if (memoria.exito) pintaExito(memoria.exito);

  // ===================== 3. Backups in Drive =====================
  const listaHost = h('div', { 'aria-live': 'polite' });
  const btnActualizar = boton({ class: 'btn', id: 'backup-drive-actualizar', disabled: demo ? true : null, 'aria-describedby': demo ? 'backup-drive-demo' : null }, icon('refrescar'), t('backup.drive.actualizar'));

  async function abrirDesdeDrive(item) {
    zona.replaceChildren(h('p', { class: 'backup-status', role: 'status' }, t('backup.leyendo')));
    encabezado.scrollIntoView?.({ block: 'start' });
    try {
      const r = await svc.leerBackupDrive(item.id);
      lectura = { ...r, fuente: 'drive' };
      pintaLectura();
    } catch (e) { lectura = null; zona.replaceChildren(alerta('danger', null, textoError(e), { role: 'alert' })); }
  }

  async function pintaLista() {
    listaHost.replaceChildren(h('p', { class: 'backup-status', role: 'status' }, t('backup.drive.cargando')));
    let items;
    try { items = await svc.listarBackupsDrive(); } catch (e) {
      listaHost.replaceChildren(alerta('danger', null, t('backup.drive.error', { msg: textoError(e) }), { role: 'alert' }));
      return;
    }
    if (!items.length) { listaHost.replaceChildren(alerta('info', null, t('backup.drive.vacio'))); return; }
    const contenido = items.map((it) => h('span', null, it.resumen ? contenidoTexto(it.resumen) : '...'));
    const cab = [t('backup.drive.col.fecha'), t('backup.drive.col.tipo'), t('backup.drive.col.contenido'), t('backup.drive.col.acciones')];
    listaHost.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards backup-table', id: 'backup-drive-tabla' },
      h('caption', { class: 'sr-only' }, t('backup.drive.tabla')),
      h('thead', null, h('tr', null, cab.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, items.map((it, i) => {
        const cuando = fechaDia(it.fecha, it.hora);
        return h('tr', { 'data-id': it.id },
          h('td', { 'data-label': cab[0] }, cuando),
          h('td', { 'data-label': cab[1] }, t('backup.drive.tipo.' + it.tipo)),
          h('td', { 'data-label': cab[2] }, contenido[i]),
          h('td', { 'data-label': cab[3], class: 'actions' }, h('div', { class: 'backup-drive-actions' },
            boton({ class: 'btn btn-sm', 'aria-label': t('backup.drive.restaurar-de', { fecha: cuando }), onclick: () => abrirDesdeDrive(it) }, t('backup.drive.restaurar')),
            boton({ class: 'btn btn-sm btn--ghost', 'aria-label': t('backup.drive.eliminar-de', { fecha: cuando }), onclick: async () => {
              if (!(await confirmDialog(t('backup.drive.eliminar-confirmar', { fecha: cuando }), { danger: true, okLabel: t('backup.drive.eliminar') }))) return;
              try { await svc.eliminarBackupDrive(it.id); toast(t('backup.drive.eliminada')); await pintaLista(); } catch (e) { toast.error(textoError(e)); }
            } }, t('backup.drive.eliminar')))));
      })))));
    // Row counts are read one by one afterwards, so the list shows up at once
    items.forEach(async (it, i) => {
      if (it.resumen) return;
      try { contenido[i].textContent = contenidoTexto(await svc.resumenBackupDrive(it.id)); } catch (e) { contenido[i].textContent = '-'; }
    });
  }
  const contenidoTexto = (r) => (r.cifrada ? t('backup.drive.contenido-cifrado') : t('backup.drive.contenido', { filas: r.filas, nadadores: r.nadadores }));

  btnActualizar.addEventListener('click', pintaLista);
  const tarjetaDrive = h('section', { class: 'card backup-card', 'aria-labelledby': 'backup-drive-t' },
    h('h2', { id: 'backup-drive-t' }, t('backup.drive.titulo')),
    h('p', null, t('backup.drive.texto')),
    demo ? h('div', { id: 'backup-drive-demo' }, alerta('info', null, t('backup.drive.demo'))) : null,
    h('div', { class: 'backup-actions' }, btnActualizar),
    listaHost);
  if (!demo) pintaLista();

  return h('div', { class: 'backup-panel', id: 'backup-panel' }, tarjetaDescarga, tarjetaRestaurar, tarjetaDrive);
}
