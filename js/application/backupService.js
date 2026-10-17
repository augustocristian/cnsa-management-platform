// Application service of the full backup: create/download a complete copy of the club, read and preview one, and restore it
// (replace or merge). Everything is injected: the repository (the store), preferences, hash, crypto, clock, file ports, the
// Drive-backups port and the categories service. No DOM, no network of its own.
//
// Safety rules:
//  - A restore ALWAYS takes an automatic safety backup of the current data first (Drive: cnl/backups/<club>-restore-*.json;
//    demo mode: kept in memory for the session and offered as a download). If it cannot be saved, nothing is restored.
//  - If applying the restore fails half-way, the safety backup is applied back automatically.
//  - Never restores into a club opened read-only (written by a newer version of the app).
//  - Rows the person erased permanently (GDPR tombstones) and their children are not brought back.
//
// Repository port (the store): documento(), list(sheet), upsertMany(sheet, rows), removeMany(sheet, ids), club, setClub(obj),
// clubRef, soloLectura, mode, and optionally migrar(), aplicarExtras(extra, {reemplazar}), sync(), pendiente.
import * as D from '../domain/backup.js';
import { docToData, mergeData, metaVacia, RELACIONES, DOC_VERSION } from '../domain/sheetdata.js';
import { SHEETS, HOJAS_RETIRADAS } from '../domain/schema.js';

const MENSAJES = {
  'no-es-backup': 'This file is not a CNL backup.',
  'version-invalida': 'The backup format version is not valid.',
  'version-futura': 'This backup was made by a newer version of the app. Update the app to restore it.',
  'documento-futuro': 'This backup holds data written by a newer version of the app. Update the app to restore it.',
  danado: 'The backup file is damaged (the checksum does not match).',
  estructura: 'The backup file has an unexpected structure.',
  'demasiadas-filas': 'The backup has more than 50,000 rows.',
  'demasiado-grande': 'The backup file is larger than 20 MB.',
  ilegible: 'The file is not valid JSON.',
  'requiere-passphrase': 'This backup is encrypted: enter its passphrase.',
  'passphrase-incorrecta': 'Wrong passphrase, or the file is damaged.',
  'passphrase-corta': 'The passphrase must have at least ' + D.PASSPHRASE_MIN + ' characters.',
  'sin-cifrado': 'Encryption is not available in this browser.',
  'solo-lectura': 'This club was saved by a newer version of the app and is read-only: nothing can be restored.',
  'seguridad-fallida': 'The safety copy could not be saved, so nothing was restored.',
  'restauracion-fallida': 'The restore failed.',
  'modo-invalido': 'Unknown restore mode.',
  'sin-drive': 'Backups in Drive are not available in demo mode.',
  'sin-seguridad': 'There is no restore to revert.',
};
export const falla = (code, extra = {}, errores) =>
  Object.assign(new Error(MENSAJES[code] || code), { ...extra, code, ...(errores ? { errores } : {}) });

const iso = (f) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const ENTIDADES = Object.keys(SHEETS).filter((s) => s !== 'Club');

// deps: {repo, preferencias, hash, cripto?, ahora, archivos: {descargar, crearBlob, leer?}, driveBackups?, categorias?, appVersion?}
export function crearBackupService({
  repo,
  preferencias,
  hash,
  cripto = null,
  ahora,
  archivos = {},
  driveBackups = null,
  categorias = null,
  appVersion = '',
} = {}) {
  let ultimaSeguridad = null; // {doc, nombre, destino:'drive'|'sesion', creada, id?}
  const resumenesDrive = new Map();

  const modo = () => (repo.mode === 'demo' ? 'demo' : 'drive');
  const nombreClub = () => String((repo.club && repo.club.nombre) || (repo.clubRef && repo.clubRef.name) || '');
  // Name the Drive copies are filed under (the club file name, as the daily backups use)
  const nombreDrive = () => String((repo.clubRef && repo.clubRef.name) || nombreClub());

  function prefsActuales() {
    const v = {};
    D.PREFS_USUARIO.forEach((k) => {
      const x = preferencias.get(k, undefined);
      if (x !== undefined && x !== null) v[k] = x;
    });
    return D.prefsDeUsuario(v);
  }

  async function construirDocumento() {
    const d = repo.documento();
    const top = {};
    Object.keys(d).forEach((k) => {
      if (!['version', 'club', 'hojas', 'sync'].includes(k)) top[k] = d[k];
    });
    return D.construirBackup(
      {
        nombre: nombreClub(),
        club: d.club,
        hojas: d.hojas,
        top,
        preferencias: prefsActuales(),
        appVersion,
        docVersion: d.version,
        creado: ahora().toISOString(),
      },
      hash,
    );
  }

  // ---------- Create / download ----------
  // -> {blob, nombre, doc, resumen, cifrada, bytes, avisos}
  async function crearBackup({ passphrase = '' } = {}) {
    const cifrada = !!passphrase;
    if (cifrada) {
      if (!D.passphraseValida(passphrase)) throw falla('passphrase-corta');
      if (!cripto) throw falla('sin-cifrado');
    }
    const doc = await construirDocumento();
    let texto = JSON.stringify(doc);
    if (cifrada) texto = JSON.stringify(await cripto.cifrar(texto, passphrase));
    const blob = archivos.crearBlob(texto, 'application/json');
    const avisos = [];
    if (blob.size > D.LIMITE_BYTES || D.totalFilas(doc.counts) > D.LIMITE_FILAS)
      avisos.push({ codigo: 'supera-limite' });
    return {
      blob,
      nombre: D.nombreFichero(doc.club.name, ahora(), { cifrada }),
      doc,
      resumen: D.resumenBackup(doc, { esquema: SHEETS }),
      cifrada,
      bytes: blob.size,
      avisos,
    };
  }

  async function descargarBackup(opciones = {}) {
    const r = await crearBackup(opciones);
    await archivos.descargar(r.blob, r.nombre);
    preferencias.set(D.PREF_ULTIMA_COPIA, {
      creada: r.doc.createdAt,
      nombre: r.nombre,
      filas: r.resumen.total,
      cifrada: r.cifrada,
    });
    return r;
  }

  const ultimaCopia = () => preferencias.get(D.PREF_ULTIMA_COPIA, null);

  // ---------- Read / validate / preview ----------
  const estadoActual = () => {
    const d = docToData(repo.documento());
    return { club: d.club, hojas: d.db, meta: d.meta, extra: d.extra };
  };

  // Rows of the backup that a restore would use: normalised like a file read, without invalid rows nor erased (GDPR) ones.
  function candidatos(doc) {
    const remote = docToData(D.aDocumentoClub(doc));
    const actual = estadoActual();
    const hoy = iso(ahora());
    const omitidas = [];
    const crudas = {};
    ENTIDADES.forEach((s) => {
      const r = D.separarInvalidas(s, remote.db[s] || [], hoy);
      crudas[s] = r.filas;
      omitidas.push(...r.omitidas);
    });
    const { hojas, excluidas } = D.excluirBorradosRgpd(crudas, D.lapidasPermanentes(actual.meta), RELACIONES);
    return { remote, actual, hojas, omitidas, excluidas };
  }

  function comparar(doc) {
    const c = candidatos(doc);
    const comparacion = D.compararConActual(
      { sheets: c.hojas, club: { data: c.remote.club } },
      { club: c.actual.club, hojas: c.actual.hojas },
      { esquema: SHEETS },
    );
    return { ...comparacion, omitidas: c.omitidas.length, excluidas: c.excluidas };
  }

  // Parsed JSON (file or Drive) -> {doc, resumen, comparacion, avisos, origen:'backup'|'documento-club', cifrada}. Throws errors with a `code`.
  async function prepararDocumento(obj, { passphrase = '' } = {}) {
    let o = obj;
    let cifrada = false;
    if (D.esSobreCifrado(o)) {
      const v = D.validarSobre(o);
      if (!v.ok) throw falla(v.errores[0].codigo, v.errores[0], v.errores);
      if (!passphrase) throw falla('requiere-passphrase');
      if (!cripto) throw falla('sin-cifrado');
      const texto = await cripto.descifrar(o, passphrase);
      try {
        o = JSON.parse(texto);
      } catch (e) {
        throw falla('danado', { motivo: 'cifrado' });
      }
      cifrada = true;
    }
    let origen = 'backup';
    if (D.esDocumentoClub(o)) {
      if (Number(o.version) > DOC_VERSION)
        throw falla('documento-futuro', { version: Number(o.version), soportada: DOC_VERSION });
      o = D.documentoABackup(o, { appVersion: '', retiradas: HOJAS_RETIRADAS });
      o.checksum = await D.calcularChecksum(o, hash);
      origen = 'documento-club';
    }
    const v = await D.validarBackup(o, { hash, esquema: SHEETS, docVersion: DOC_VERSION });
    if (!v.ok) throw falla(v.errores[0].codigo, v.errores[0], v.errores);
    return {
      doc: o,
      resumen: D.resumenBackup(o, { esquema: SHEETS }),
      comparacion: comparar(o),
      avisos: v.avisos,
      origen,
      cifrada,
    };
  }

  async function leerTexto(file) {
    if (archivos.leer) return archivos.leer(file);
    if (file && typeof file.text === 'function') return file.text();
    throw falla('ilegible'); // neither archivos.leer nor Blob.text(): the file cannot be read
  }

  async function leerBackup(file, { passphrase = '' } = {}) {
    if (file && Number(file.size) > D.LIMITE_BYTES) throw falla('demasiado-grande');
    let obj;
    try {
      obj = JSON.parse(await leerTexto(file));
    } catch (e) {
      throw falla('ilegible');
    }
    return prepararDocumento(obj, { passphrase });
  }

  // ---------- Restore ----------
  async function guardarSeguridad() {
    let doc;
    try {
      doc = await construirDocumento();
      if (modo() === 'drive' && driveBackups) {
        const r = await driveBackups.guardarSeguridad(nombreDrive(), doc, ahora());
        return { doc, nombre: r.nombre, id: r.id, destino: 'drive', creada: doc.createdAt };
      }
      return {
        doc,
        nombre: D.nombreFichero(doc.club.name, ahora()).replace('cnl-backup-', 'cnl-safety-'),
        destino: 'sesion',
        creada: doc.createdAt,
      };
    } catch (e) {
      throw falla('seguridad-fallida', { causa: e });
    }
  }

  // Applies the backup rows to the repository. -> change summary
  function aplicar(doc, modoRestauracion) {
    const c = candidatos(doc);
    const resumen = {
      hojas: [],
      club: { nuevas: 0, cambiadas: 0, eliminadas: 0 },
      total: { nuevas: 0, cambiadas: 0, eliminadas: 0 },
      omitidas: c.omitidas.length,
      excluidas: c.excluidas,
      extras: false,
    };
    const sumar = (n, ca, e) => {
      resumen.total.nuevas += n;
      resumen.total.cambiadas += ca;
      resumen.total.eliminadas += e;
    };

    let destino = c.hojas; // rows the sheets must end up with (replace) or be completed with (merge)
    let clubDestino = c.remote.club;
    if (modoRestauracion === 'merge') {
      // Field-level merge with the existing algorithm. The tombstones of the current data are ignored on purpose: restoring is how
      // deleted rows come back. Where both have a value, the current one wins.
      const local = {
        db: c.actual.hojas,
        club: c.actual.club,
        meta: { ...c.actual.meta, lapidas: {} },
        extra: c.actual.extra,
      };
      const remoto = { db: c.hojas, club: c.remote.club, meta: metaVacia(), extra: c.remote.extra };
      const mg = mergeData(null, local, remoto, { dispositivo: 'restore' });
      destino = mg.db;
      clubDestino = mg.club;
    }

    ENTIDADES.forEach((s) => {
      const d = D.diferenciarFilas(c.actual.hojas[s], destino[s] || [], SHEETS[s]);
      const quitar = modoRestauracion === 'replace' ? d.eliminadas : [];
      if (quitar.length) repo.removeMany(s, quitar);
      const subir = [...d.nuevas, ...d.cambiadas];
      if (subir.length) repo.upsertMany(s, subir);
      if (subir.length || quitar.length)
        resumen.hojas.push({
          hoja: s,
          nuevas: d.nuevas.length,
          cambiadas: d.cambiadas.length,
          eliminadas: quitar.length,
        });
      sumar(d.nuevas.length, d.cambiadas.length, quitar.length);
    });

    // Club sheet: the name never changes (it names the file in Drive)
    const dc = D.diferenciarClub(c.actual.club, clubDestino);
    const cambiosClub =
      dc.nuevas.length + dc.cambiadas.length + (modoRestauracion === 'replace' ? dc.eliminadas.length : 0);
    if (cambiosClub) {
      const valores = {};
      [...dc.nuevas, ...dc.cambiadas].forEach((k) => {
        valores[k] = clubDestino[k];
      });
      if (modoRestauracion === 'replace')
        dc.eliminadas.forEach((k) => {
          valores[k] = '';
        });
      repo.setClub(valores);
    }
    resumen.club = {
      nuevas: dc.nuevas.length,
      cambiadas: dc.cambiadas.length,
      eliminadas: modoRestauracion === 'replace' ? dc.eliminadas.length : 0,
    };
    sumar(resumen.club.nuevas, resumen.club.cambiadas, resumen.club.eliminadas);

    if (typeof repo.aplicarExtras === 'function')
      resumen.extras = !!repo.aplicarExtras(c.remote.extra, { reemplazar: modoRestauracion === 'replace' });
    return resumen;
  }

  function aplicarPreferencias(doc) {
    const aplicadas = [];
    const prefs = D.prefsDeUsuario((doc && doc.preferences) || {});
    Object.keys(prefs).forEach((k) => {
      if (JSON.stringify(preferencias.get(k, undefined)) === JSON.stringify(prefs[k])) return;
      preferencias.set(k, prefs[k]);
      aplicadas.push(k);
    });
    return aplicadas;
  }

  // doc: a backup document (from leerBackup). opciones: {modo:'replace'|'merge', onProgreso(fase), sinSeguridad}
  // -> {modo, seguridad:{nombre,destino}|null, hojas, club, total, omitidas, excluidas, extras, preferencias:[keys], sincronizado, errorSync?}
  async function restaurar(doc, { modo: modoRestauracion = 'replace', onProgreso, sinSeguridad = false } = {}) {
    const avisar = (fase) => {
      try {
        if (onProgreso) onProgreso(fase);
      } catch (e) {
        /* the UI must not break a restore */
      }
    };
    if (!['replace', 'merge'].includes(modoRestauracion)) throw falla('modo-invalido');
    if (repo.soloLectura) throw falla('solo-lectura');
    avisar('validando');
    const v = await D.validarBackup(doc, { hash, esquema: SHEETS, docVersion: DOC_VERSION });
    if (!v.ok) throw falla(v.errores[0].codigo, v.errores[0], v.errores);

    let seguridad = null;
    if (!sinSeguridad) {
      avisar('seguridad');
      seguridad = await guardarSeguridad(); // throws 'seguridad-fallida': nothing has been touched yet
    }

    avisar('aplicando');
    let resumen;
    try {
      resumen = aplicar(doc, modoRestauracion);
    } catch (e) {
      let revertido = false;
      if (seguridad) {
        try {
          aplicar(seguridad.doc, 'replace');
          revertido = true;
        } catch (e2) {
          revertido = false;
        }
      }
      throw falla('restauracion-fallida', { causa: e, revertido, detalle: e && e.message });
    }
    const hubo = resumen.total.nuevas + resumen.total.cambiadas + resumen.total.eliminadas > 0 || resumen.extras;
    if (hubo) {
      if (typeof repo.migrar === 'function') repo.migrar(); // legacy objectives / content catalogue
      if (categorias && typeof categorias.alAbrirClub === 'function') {
        try {
          categorias.alAbrirClub();
        } catch (e) {
          /* best effort */
        }
      }
    }
    const prefs = aplicarPreferencias(doc);
    if (seguridad) ultimaSeguridad = seguridad;

    let errorSync = null;
    if (hubo && typeof repo.sync === 'function') {
      avisar('sincronizando');
      try {
        await repo.sync();
      } catch (e) {
        errorSync = e;
      }
    }
    avisar('listo');
    return {
      modo: modoRestauracion,
      seguridad: seguridad ? { nombre: seguridad.nombre, destino: seguridad.destino } : null,
      ...resumen,
      preferencias: prefs,
      sincronizado: !errorSync && !repo.pendiente,
      ...(errorSync ? { errorSync } : {}),
    };
  }

  // Undo of the last restore with its safety copy (session only). Does not take another safety copy.
  async function revertirUltimaRestauracion(opciones = {}) {
    if (!ultimaSeguridad) throw falla('sin-seguridad');
    const r = await restaurar(ultimaSeguridad.doc, { ...opciones, modo: 'replace', sinSeguridad: true });
    ultimaSeguridad = null;
    return { ...r, revertida: true };
  }
  const haySeguridad = () => !!ultimaSeguridad;
  const seguridadActual = () =>
    ultimaSeguridad
      ? { nombre: ultimaSeguridad.nombre, destino: ultimaSeguridad.destino, creada: ultimaSeguridad.creada }
      : null;
  async function descargarSeguridad() {
    if (!ultimaSeguridad) throw falla('sin-seguridad');
    const blob = archivos.crearBlob(JSON.stringify(ultimaSeguridad.doc), 'application/json');
    await archivos.descargar(blob, ultimaSeguridad.nombre + (ultimaSeguridad.nombre.endsWith('.json') ? '' : '.json'));
    return { nombre: ultimaSeguridad.nombre };
  }

  // ---------- Backups in Drive (cnl/backups) ----------
  function exigirDrive() {
    if (modo() === 'demo' || !driveBackups) throw falla('sin-drive');
  }
  const driveDisponible = () => modo() !== 'demo' && !!driveBackups;

  // -> [{id, nombre, tipo, fecha, hora, resumen?}] most recent first. conteos: also read each file for its row counts.
  async function listarBackupsDrive({ conteos = false } = {}) {
    exigirDrive();
    const { prefijo, archivos: lista } = await driveBackups.listar(nombreDrive());
    const items = lista
      .map((a) => {
        const info = D.analizarNombreDrive(a.name, prefijo);
        return info ? { id: a.id, nombre: a.name, ...info, resumen: resumenesDrive.get(a.id) || null } : null;
      })
      .filter(Boolean)
      .sort(D.porFechaDesc);
    if (conteos)
      for (const it of items) {
        if (!it.resumen) {
          try {
            it.resumen = await resumenBackupDrive(it.id);
          } catch (e) {
            it.resumen = null;
          }
        }
      }
    return items;
  }

  async function resumenBackupDrive(id) {
    exigirDrive();
    if (resumenesDrive.has(id)) return resumenesDrive.get(id);
    const obj = await driveBackups.leer(id);
    let res;
    if (D.esSobreCifrado(obj)) res = { cifrada: true, filas: null, nadadores: null };
    else {
      const hojas = D.esDocumentoClub(obj) ? obj.hojas || {} : (obj && obj.sheets) || {};
      const filas = Object.keys(hojas)
        .filter((s) => Array.isArray(hojas[s]))
        .reduce((a, s) => a + hojas[s].length, 0);
      res = { cifrada: false, filas, nadadores: Array.isArray(hojas.Nadadores) ? hojas.Nadadores.length : 0 };
    }
    resumenesDrive.set(id, res);
    return res;
  }

  async function leerBackupDrive(id, opciones = {}) {
    exigirDrive();
    return prepararDocumento(await driveBackups.leer(id), opciones);
  }
  async function restaurarDesdeDrive(id, opciones = {}) {
    const r = await leerBackupDrive(id, opciones);
    return restaurar(r.doc, opciones);
  }
  async function eliminarBackupDrive(id) {
    exigirDrive();
    await driveBackups.eliminar(id);
    resumenesDrive.delete(id);
  }

  return {
    modo,
    soloLectura: () => !!repo.soloLectura,
    nombreClub,
    criptoDisponible: () => !!cripto,
    crearBackup,
    descargarBackup,
    ultimaCopia,
    leerBackup,
    prepararDocumento,
    restaurar,
    revertirUltimaRestauracion,
    haySeguridad,
    seguridadActual,
    descargarSeguridad,
    driveDisponible,
    listarBackupsDrive,
    resumenBackupDrive,
    leerBackupDrive,
    restaurarDesdeDrive,
    eliminarBackupDrive,
  };
}
