// PURE domain of the full backup: document format, canonical JSON + checksum, validation, summary, comparison with the
// current data (restore preview) and file names. No DOM, network, storage or clock: the time arrives as an argument and the
// SHA-256 function is injected (`hash(text) -> Promise<hex>`), so it runs under node:test without WebCrypto.
//
// Backup document (JSON file, "cnl-backup", formatVersion 1):
//   { format, formatVersion, appVersion, docVersion, createdAt (ISO),
//     club: { name, data: { key: value, ... } },        // the Club sheet (identity, season, category rules...)
//     sheets: { Nadadores: [row...], ..., <unknown>: any },  // every entity sheet + sheets this version does not know (kept as is)
//     extra: { top: {...} },                             // unknown top-level keys of the club document
//     preferences: { idioma, tema, calendario.* },       // user-level preferences only (never tokens or per-account data)
//     counts: { sheet: rows }, checksum: 'sha256:<hex>' }
// Encrypted envelope (optional passphrase):
//   { format: 'cnl-backup-encrypted', formatVersion, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-GCM', salt, iv, ciphertext }
//   (salt/iv/ciphertext in base64; the plaintext is the JSON of a normal backup document, checksum included).
import { sanear } from './preferencias.js';
import { validarFila } from './validacion.js';

export const FORMATO = 'cnl-backup';
export const FORMATO_CIFRADO = 'cnl-backup-encrypted';
export const VERSION_FORMATO = 1;
export const LIMITE_BYTES = 20 * 1024 * 1024; // same as the Excel import limit
export const LIMITE_FILAS = 50000; // same as the Excel import limit
export const PASSPHRASE_MIN = 8;
export const KDF = 'PBKDF2-SHA256';
export const CIFRADO = 'AES-GCM';
export const ITERACIONES = 600000;
export const ITERACIONES_MIN = 1000;
export const ITERACIONES_MAX = 10000000;
// Preferences that travel with a backup (user-level; calSync.* belongs to one Google account and ultimoClub/clubes to one Drive).
export const PREFS_USUARIO = ['idioma', 'tema', 'calendario.vista', 'calendario.ventanaDias', 'calendario.alarmaMin'];
export const PREF_ULTIMA_COPIA = 'copia.ultima'; // {creada, nombre, filas, cifrada}: the "last backup" note (a normal preference)

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const clon = (x) => JSON.parse(JSON.stringify(x));
const error = (codigo, extra = {}) => ({ codigo, ...extra });

// ---------- Canonical JSON and checksum ----------
// Same text for the same data regardless of key order (undefined/functions are dropped like JSON.stringify does).
export function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : canonico(x))).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort()
    .map((k) => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
}

// hash(text) -> Promise<hex string>. The checksum covers everything except the checksum field itself.
export async function calcularChecksum(doc, hash) {
  const { checksum, ...resto } = doc || {};
  return 'sha256:' + await hash(canonico(resto));
}

// ---------- Build ----------
const contar = (hojas) => {
  const c = {};
  Object.keys(hojas).forEach((s) => { if (Array.isArray(hojas[s])) c[s] = hojas[s].length; });
  return c;
};
export const totalFilas = (counts) => Object.values(counts || {}).reduce((a, n) => a + (Number(n) || 0), 0);

// -> backup document (with checksum). `hojas`/`club` come from the club document (sheetdata.dataToDoc); `top` = its unknown top-level keys.
export async function construirBackup({ nombre, club, hojas, top, preferencias, appVersion, docVersion, creado }, hash) {
  const sheets = clon(hojas || {});
  const doc = {
    format: FORMATO,
    formatVersion: VERSION_FORMATO,
    appVersion: String(appVersion || ''),
    docVersion: Number(docVersion) || 1,
    createdAt: String(creado || ''),
    club: { name: String(nombre || ''), data: clon(club || {}) },
    sheets,
    extra: { top: clon(top || {}) },
    preferences: clon(preferencias || {}),
    counts: contar(sheets),
  };
  doc.checksum = await calcularChecksum(doc, hash);
  return doc;
}

// Only the user-level preferences, sanitised with the preferences domain. -> {key: value}
export function prefsDeUsuario(valores) {
  const out = {};
  PREFS_USUARIO.forEach((k) => {
    const v = valores && valores[k];
    if (v === undefined || v === null) return;
    const limpio = sanear(k, v);
    if (limpio !== undefined && limpio !== null) out[k] = limpio;
  });
  return out;
}

// A club document ({version, club, hojas, sync?}: a Drive daily backup or the "download JSON copy") has the shape of a club file.
export function esDocumentoClub(x) {
  return esObjeto(x) && x.format === undefined && (esObjeto(x.hojas) || esObjeto(x.club)) && x.version !== undefined;
}

// Club document -> UNSIGNED backup-like document (the caller adds the checksum). `esquema`/`retiradas` drop retired sheets.
export function documentoABackup(doc, { nombre = '', appVersion = '', retiradas = [] } = {}) {
  const hojas = esObjeto(doc.hojas) ? clon(doc.hojas) : {};
  retiradas.forEach((s) => { delete hojas[s]; });
  const top = {};
  Object.keys(doc).forEach((k) => { if (!['version', 'club', 'hojas', 'sync'].includes(k)) top[k] = clon(doc[k]); });
  const club = esObjeto(doc.club) ? clon(doc.club) : {};
  return {
    format: FORMATO, formatVersion: VERSION_FORMATO, appVersion, docVersion: Number(doc.version) || 1, createdAt: '',
    club: { name: String(nombre || club.nombre || ''), data: club }, sheets: hojas, extra: { top }, preferences: {}, counts: contar(hojas),
  };
}

// Backup -> club document (what sheetdata.docToData reads).
export function aDocumentoClub(doc) {
  return { version: doc.docVersion || 1, club: clon((doc.club && doc.club.data) || {}), hojas: clon(doc.sheets || {}), ...clon((doc.extra && doc.extra.top) || {}) };
}

// ---------- Validation ----------
// -> {ok, errores:[{codigo,...}], avisos:[{codigo,...}]}. Error codes: no-es-backup, version-invalida, version-futura, documento-futuro,
// danado (missing/wrong checksum), estructura, demasiadas-filas. Warnings: filas-sin-id, sin-fecha, checksum-no-verificado.
// opciones: {hash, esquema (sheet -> columns), docVersion (highest club-document version this app reads), maxFilas}
export async function validarBackup(doc, { hash, esquema, docVersion, maxFilas = LIMITE_FILAS } = {}) {
  const errores = [];
  const avisos = [];
  if (!esObjeto(doc) || doc.format !== FORMATO) return { ok: false, errores: [error('no-es-backup')], avisos };
  const fv = doc.formatVersion;
  if (!Number.isInteger(fv) || fv < 1) return { ok: false, errores: [error('version-invalida')], avisos };
  if (fv > VERSION_FORMATO) return { ok: false, errores: [error('version-futura', { version: fv, soportada: VERSION_FORMATO })], avisos };

  if (hash) {
    if (typeof doc.checksum !== 'string' || !doc.checksum) return { ok: false, errores: [error('danado', { motivo: 'sin-checksum' })], avisos };
    const calculado = await calcularChecksum(doc, hash);
    if (calculado !== doc.checksum) return { ok: false, errores: [error('danado', { motivo: 'checksum' })], avisos };
  } else avisos.push(error('checksum-no-verificado'));

  if (!esObjeto(doc.club) || !esObjeto(doc.club.data) || !esObjeto(doc.sheets)) return { ok: false, errores: [error('estructura', { detalle: 'club' })], avisos };
  if (docVersion && Number(doc.docVersion) > docVersion) return { ok: false, errores: [error('documento-futuro', { version: Number(doc.docVersion), soportada: docVersion })], avisos };
  if (doc.preferences !== undefined && !esObjeto(doc.preferences)) errores.push(error('estructura', { detalle: 'preferencias' }));
  if (doc.createdAt !== undefined && doc.createdAt !== '' && (typeof doc.createdAt !== 'string' || Number.isNaN(Date.parse(doc.createdAt)))) avisos.push(error('sin-fecha'));
  else if (!doc.createdAt) avisos.push(error('sin-fecha'));

  let filas = 0;
  let sinId = 0;
  Object.keys(doc.sheets).forEach((hoja) => {
    const rows = doc.sheets[hoja];
    const conocida = esquema && hoja in esquema;
    if (Array.isArray(rows)) {
      filas += rows.length;
      const malas = rows.filter((r) => !esObjeto(r));
      if (malas.length) {
        if (conocida) errores.push(error('estructura', { hoja, detalle: 'fila' }));
        return;
      }
      if (conocida) rows.forEach((r) => { if (r.id === undefined || r.id === null || r.id === '') sinId++; });
    } else if (conocida) errores.push(error('estructura', { hoja, detalle: 'hoja' }));
  });
  if (filas > maxFilas) return { ok: false, errores: [error('demasiadas-filas', { filas, maximo: maxFilas })], avisos };
  if (sinId) avisos.push(error('filas-sin-id', { n: sinId }));
  return { ok: !errores.length, errores, avisos };
}

// ---------- Summary ----------
export function resumenBackup(doc, { esquema } = {}) {
  const sheets = esObjeto(doc && doc.sheets) ? doc.sheets : {};
  const hojas = Object.keys(sheets).filter((s) => Array.isArray(sheets[s])).map((nombre) => ({ nombre, filas: sheets[nombre].length }));
  const total = hojas.reduce((a, x) => a + x.filas, 0);
  return {
    club: (doc && doc.club && doc.club.name) || '',
    creado: (doc && doc.createdAt) || null,
    appVersion: (doc && doc.appVersion) || '',
    formatVersion: (doc && doc.formatVersion) || null,
    hojas, total,
    nadadores: (sheets.Nadadores || []).length,
    hojasDesconocidas: esquema ? Object.keys(sheets).filter((s) => !(s in esquema)) : [],
    preferencias: Object.keys((doc && doc.preferences) || {}),
  };
}

// ---------- Comparison with the current data ----------
const norm = (v) => (v === undefined || v === null ? '' : v);
const firma = (fila, columnas) => canonico(columnas ? columnas.map((c) => norm(fila[c])) : fila);

// Rows of one sheet: backup `nuevas` vs `actuales` by id.
// -> {nuevas:[row], cambiadas:[row], eliminadas:[id], iguales:n} (nuevas = only in the backup; eliminadas = only now)
export function diferenciarFilas(actuales, entrantes, columnas) {
  const act = new Map((actuales || []).filter((r) => esObjeto(r) && norm(r.id) !== '').map((r) => [String(r.id), r]));
  const ent = new Map();
  (entrantes || []).forEach((r) => { if (esObjeto(r) && norm(r.id) !== '') ent.set(String(r.id), r); });
  const out = { nuevas: [], cambiadas: [], eliminadas: [], iguales: 0 };
  ent.forEach((fila, id) => {
    const previa = act.get(id);
    if (!previa) out.nuevas.push(fila);
    else if (firma(previa, columnas) === firma(fila, columnas)) out.iguales++;
    else out.cambiadas.push(fila);
  });
  act.forEach((_, id) => { if (!ent.has(id)) out.eliminadas.push(id); });
  return out;
}

// Club sheet (key/value). The club NAME is never changed by a restore (it names the file in Drive), so it is not compared.
export function diferenciarClub(actual, entrante) {
  const a = actual || {};
  const e = entrante || {};
  const out = { nuevas: [], cambiadas: [], eliminadas: [] };
  Object.keys(e).forEach((k) => {
    if (k === 'nombre') return;
    if (!(k in a) || norm(a[k]) === '') { if (norm(e[k]) !== '') out.nuevas.push(k); } else if (canonico(norm(a[k])) !== canonico(norm(e[k]))) out.cambiadas.push(k);
  });
  Object.keys(a).forEach((k) => { if (k !== 'nombre' && norm(a[k]) !== '' && !(k in e)) out.eliminadas.push(k); });
  return out;
}

// Preview of a restore: per sheet how many rows are new / changed / only in the current data.
// actual = {club: {key: value}, hojas: {sheet: rows}} (the current club document).
// -> {hojas:[{hoja, enBackup, actuales, nuevas, cambiadas, eliminadas, iguales}], club:{nuevas,cambiadas,eliminadas}, total, hayCambios}
export function compararConActual(doc, actual, { esquema } = {}) {
  const sheets = (doc && doc.sheets) || {};
  const hojasActual = (actual && actual.hojas) || {};
  const nombres = esquema ? Object.keys(esquema).filter((s) => s !== 'Club') : [...new Set([...Object.keys(sheets), ...Object.keys(hojasActual)])].filter((s) => Array.isArray(sheets[s]) || Array.isArray(hojasActual[s]));
  const hojas = nombres.map((hoja) => {
    const ent = Array.isArray(sheets[hoja]) ? sheets[hoja] : [];
    const act = Array.isArray(hojasActual[hoja]) ? hojasActual[hoja] : [];
    const d = diferenciarFilas(act, ent, esquema && esquema[hoja]);
    return { hoja, enBackup: ent.length, actuales: act.length, nuevas: d.nuevas.length, cambiadas: d.cambiadas.length, eliminadas: d.eliminadas.length, iguales: d.iguales };
  });
  const dc = diferenciarClub(actual && actual.club, doc && doc.club && doc.club.data);
  const club = { nuevas: dc.nuevas.length, cambiadas: dc.cambiadas.length, eliminadas: dc.eliminadas.length };
  const total = hojas.reduce((t, h) => ({ nuevas: t.nuevas + h.nuevas, cambiadas: t.cambiadas + h.cambiadas, eliminadas: t.eliminadas + h.eliminadas }),
    { nuevas: club.nuevas, cambiadas: club.cambiadas, eliminadas: club.eliminadas });
  return { hojas, club, total, hayCambios: total.nuevas + total.cambiadas + total.eliminadas > 0 };
}

// ---------- Restore helpers ----------
// Rows that fail the same validation the store applies on save: they are skipped (reported) so one bad row never aborts a restore.
// -> {filas:[row], omitidas:[{hoja,id,errores}]}
export function separarInvalidas(hoja, filas, hoy) {
  const out = { filas: [], omitidas: [] };
  (filas || []).forEach((f) => {
    const errores = validarFila(hoja, f, { hoy });
    if (errores.length) out.omitidas.push({ hoja, id: f.id, errores }); else out.filas.push(f);
  });
  return out;
}

// Right to erasure: rows the user purged permanently (tombstone with `h`) and their children are NOT brought back by a restore.
// hojas = {sheet: rows}; lapidas = {sheet: {id: {s, h?}}}; relaciones = [[child, column, parent]]. -> {hojas, excluidas}
export function excluirBorradosRgpd(hojas, lapidas, relaciones = []) {
  const quitar = {};
  let excluidas = 0;
  const marca = (s, id) => { (quitar[s] ||= new Set()).add(String(id)); };
  Object.keys(lapidas || {}).forEach((s) => Object.keys(lapidas[s]).forEach((id) => { if (lapidas[s][id] && lapidas[s][id].h) marca(s, id); }));
  let cambio = true;
  while (cambio) {
    cambio = false;
    relaciones.forEach(([hijo, col, padre]) => {
      if (!quitar[padre]) return;
      (hojas[hijo] || []).forEach((r) => {
        const fk = r[col];
        if (fk !== '' && fk != null && quitar[padre].has(String(fk)) && !(quitar[hijo] && quitar[hijo].has(String(r.id)))) { marca(hijo, r.id); cambio = true; }
      });
    });
  }
  const out = {};
  Object.keys(hojas).forEach((s) => {
    const q = quitar[s];
    out[s] = q ? hojas[s].filter((r) => { const fuera = q.has(String(r.id)); if (fuera) excluidas++; return !fuera; }) : hojas[s];
  });
  return { hojas: out, excluidas };
}

// Permanent tombstones ({sheet: {id: {h:1}}}) of a sync meta {lapidas}.
export function lapidasPermanentes(meta) {
  const out = {};
  const lap = (meta && meta.lapidas) || {};
  Object.keys(lap).forEach((s) => Object.keys(lap[s]).forEach((id) => { if (lap[s][id] && lap[s][id].h) (out[s] ||= {})[id] = { h: 1 }; }));
  return out;
}

// ---------- Passphrase ----------
// -> {nivel: 0..3, clave: 'vacia'|'corta'|'debil'|'media'|'fuerte', longitud}. 'corta' (< PASSPHRASE_MIN) is not accepted.
export function evaluarPassphrase(p) {
  const s = String(p ?? '');
  const longitud = [...s].length;
  if (!longitud) return { nivel: 0, clave: 'vacia', longitud };
  if (longitud < PASSPHRASE_MIN) return { nivel: 0, clave: 'corta', longitud };
  const clases = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(s)).length;
  const unicos = new Set(s).size;
  if (unicos < 4) return { nivel: 1, clave: 'debil', longitud };
  if (longitud >= 16 || (longitud >= 12 && clases >= 3)) return { nivel: 3, clave: 'fuerte', longitud };
  if (longitud >= 10 || clases >= 3) return { nivel: 2, clave: 'media', longitud };
  return { nivel: 1, clave: 'debil', longitud };
}
export const passphraseValida = (p) => evaluarPassphrase(p).nivel >= 1;

// ---------- Encrypted envelope ----------
export const esSobreCifrado = (x) => esObjeto(x) && x.format === FORMATO_CIFRADO;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// -> {ok, errores:[{codigo}]}: version-futura | estructura
export function validarSobre(x) {
  if (!esSobreCifrado(x)) return { ok: false, errores: [error('no-es-backup')] };
  if (!Number.isInteger(x.formatVersion) || x.formatVersion < 1) return { ok: false, errores: [error('version-invalida')] };
  if (x.formatVersion > VERSION_FORMATO) return { ok: false, errores: [error('version-futura', { version: x.formatVersion, soportada: VERSION_FORMATO })] };
  const mal = x.kdf !== KDF || x.cipher !== CIFRADO
    || !Number.isInteger(x.iterations) || x.iterations < ITERACIONES_MIN || x.iterations > ITERACIONES_MAX
    || !['salt', 'iv', 'ciphertext'].every((k) => typeof x[k] === 'string' && B64.test(x[k]));
  return mal ? { ok: false, errores: [error('estructura', { detalle: 'sobre' })] } : { ok: true, errores: [] };
}

// Authenticated data bound to the envelope parameters: changing the iterations or the algorithm makes decryption fail.
export const datosAutenticados = (x) => `${FORMATO_CIFRADO}|${x.formatVersion}|${x.kdf}|${x.iterations}|${x.cipher}`;

// ---------- File names ----------
const dos = (n) => String(n).padStart(2, '0');
export function slug(texto) {
  const s = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return s || 'club';
}
// cnl-backup-<club-slug>-2026-10-16-1530.json (local time of `fecha`); encrypted ones end in -encrypted.
export function nombreFichero(club, fecha, { cifrada = false } = {}) {
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  const dia = `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
  return `cnl-backup-${slug(club)}-${dia}-${dos(f.getHours())}${dos(f.getMinutes())}${cifrada ? '-encrypted' : ''}.json`;
}

// Names of the copies the app keeps in cnl/backups: <club>-YYYYMMDD.json (daily), <club>-import-YYYYMMDDHHMMSS.json, <club>-restore-YYYYMMDDHHMMSS.json.
// `prefijo` is "<club>-" as the Drive layer writes it. -> {tipo: 'diario'|'importacion'|'restauracion', fecha:'YYYY-MM-DD', hora:'HH:MM'|''} | null
export function analizarNombreDrive(nombre, prefijo) {
  const n = String(nombre || '');
  if (!n.startsWith(prefijo)) return null;
  const resto = n.slice(prefijo.length);
  let m = /^(\d{4})(\d{2})(\d{2})\.json$/.exec(resto);
  if (m) return { tipo: 'diario', fecha: `${m[1]}-${m[2]}-${m[3]}`, hora: '' };
  m = /^(import|restore)-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\d{2}\.json$/.exec(resto);
  if (m) return { tipo: m[1] === 'import' ? 'importacion' : 'restauracion', fecha: `${m[2]}-${m[3]}-${m[4]}`, hora: `${m[5]}:${m[6]}` };
  return null;
}
// Most recent first
export const porFechaDesc = (a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`) || String(b.nombre).localeCompare(String(a.nombre));
