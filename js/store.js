// Almacén de datos: caché local (localStorage) + sincronización con Drive (.xlsx por club).
import { SHEETS, ENTITY_SHEETS, newId, TIPOS_CARGA } from './schema.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { auth } from './auth.js';
import { drive } from './drive.js';
import { dataToTabs, tabsToData, hashData, mergeData, isEmptyData } from './sheetdata.js';

const LOCAL_PREFIX = 'cnl:local:';
const CLOUD_PREFIX = 'cnl:club:';
const LOCAL_INDEX = 'cnl:local-index';
const DEFAULT_CLUB = 'Club Natación Lugones';
const DEBOUNCE_MS = 1500;
const POLL_MS = 30000;

const listeners = new Set();
let db = emptyDb();
let club = {};
let ref = null; // {name, local, id?}
let dirty = false;
let timer = null;
let syncing = null;
let rev = 0; // contador de cambios locales (para no perder ediciones hechas durante una subida)
let base = null; // última versión sincronizada con la hoja (para fusionar cambios de otros usuarios)
let lastHash = null; // hash de la última versión remota conocida
let pollTimer = null;

const snapshot = () => JSON.parse(JSON.stringify({ db, club }));

// Lee la hoja remota -> {data, hash, empty}
async function readRemote() {
  const { tabs } = await drive.read(ref.id);
  const data = tabsToData(tabs);
  return { data, hash: hashData(data), empty: isEmptyData(data) };
}

function emptyDb() {
  const d = {};
  ENTITY_SHEETS.forEach((s) => { d[s] = []; });
  return d;
}

function emit(evt) {
  listeners.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
}

function setStatus(s) {
  if (store.status === s) return;
  store.status = s;
  emit({ type: 'status', status: s });
}

const cacheKey = () => (ref.local ? LOCAL_PREFIX + ref.name : CLOUD_PREFIX + ref.id);

function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ db, club, dirty, lastHash, base: dirty && !ref.local ? base : null }));
  } catch (e) {
    console.warn('No se pudo guardar la caché local', e);
  }
}

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (c && c.db) return c;
  } catch (e) { /* ignorar */ }
  return null;
}

function applyData(data) {
  db = emptyDb();
  ENTITY_SHEETS.forEach((s) => { if (Array.isArray(data.db[s])) db[s] = data.db[s]; });
  club = data.club || {};
}

// ---------- Excel ----------
function buildWorkbook() {
  const wb = XLSX.utils.book_new();
  const clubRows = Object.keys(club).map((k) => ({ clave: k, valor: club[k] }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clubRows, { header: SHEETS.Club }), 'Club');
  ENTITY_SHEETS.forEach((s) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db[s], { header: SHEETS[s] }), s);
  });
  return wb;
}

function workbookBlob() {
  const out = XLSX.write(buildWorkbook(), { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const data = { db: emptyDb(), club: {} };
  const rowsOf = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []);
  rowsOf('Club').forEach((r) => { if (r.clave) data.club[String(r.clave)] = r.valor; });
  ENTITY_SHEETS.forEach((s) => {
    data.db[s] = rowsOf(s).map((r) => {
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = r[c] === undefined ? '' : r[c]; });
      if (o.id !== '') o.id = String(o.id);
      return o;
    }).filter((r) => r.id !== '');
  });
  return data;
}

// ---------- Persistencia ----------
function markDirty() {
  dirty = true;
  rev++;
  saveCache();
  if (ref.local) { setStatus('local'); return; }
  setStatus(navigator.onLine ? 'pendiente' : 'offline');
  clearTimeout(timer);
  timer = setTimeout(() => store.sync().catch(() => {}), DEBOUNCE_MS);
}

function indexLocal(name) {
  try {
    const idx = JSON.parse(localStorage.getItem(LOCAL_INDEX) || '[]');
    if (!idx.includes(name)) { idx.push(name); localStorage.setItem(LOCAL_INDEX, JSON.stringify(idx)); }
  } catch (e) { /* ignorar */ }
}

// Polling cada ~30 s para detectar cambios de otros usuarios (sólo con la pestaña visible).
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    store.refresh().catch((e) => { if (!e.offline) { store.lastError = e; setStatus('error'); } });
  }, POLL_MS);
  if (pollTimer && pollTimer.unref) pollTimer.unref();
}

export const store = {
  status: 'local',
  lastError: null,

  // clubRef: null | string (club local) | {name, local?} | {id, name} (Drive)
  async init(clubRef) {
    clearTimeout(timer);
    if (typeof clubRef === 'string') clubRef = { name: clubRef, local: true };
    if (!clubRef) clubRef = { name: DEFAULT_CLUB, local: true };
    ref = { name: clubRef.name, id: clubRef.id, local: !GOOGLE_CLIENT_ID || !!clubRef.local || !clubRef.id };
    auth._setUsersProvider(() => db.Usuarios);
    if (auth._setOwnerProvider) auth._setOwnerProvider(() => club.propietario);
    dirty = false;
    clearInterval(pollTimer);
    pollTimer = null;
    base = null;
    lastHash = null;
    const cached = loadCache();
    if (cached) { applyData(cached); dirty = !!cached.dirty; lastHash = cached.lastHash || null; base = cached.base || null; } else { db = emptyDb(); club = {}; }

    if (ref.local) {
      indexLocal(ref.name);
      if (!club.nombre) club.nombre = ref.name;
      saveCache();
      setStatus('local');
      emit({ type: 'init' });
      return store;
    }

    // Hoja de Google: si no hay cambios locales pendientes, se toma lo remoto.
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { offline: true });
      if (!dirty) {
        const remote = await readRemote();
        if (remote.empty) { // hoja recién creada: el creador es el propietario (admin)
          if (!club.nombre) club.nombre = ref.name;
          if (!club.propietario) club.propietario = clubRef.owner || (auth.user && auth.user.email) || '';
          dirty = true;
        } else applyData(remote.data);
        lastHash = remote.hash;
        base = remote.empty ? null : snapshot();
      }
      if (!club.nombre) club.nombre = ref.name;
      saveCache();
      setStatus(dirty ? 'pendiente' : 'sincronizado');
      if (dirty) store.sync().catch(() => {});
      startPolling();
    } catch (e) {
      if (!cached) throw e;
      setStatus(e.offline ? 'offline' : 'error');
      startPolling();
    }
    emit({ type: 'init' });
    return store;
  },

  // Datos del club abierto: {name, id, local}
  get clubRef() { return ref ? { name: ref.name, id: ref.id, local: ref.local } : null; },

  // Comprueba si otro usuario ha cambiado la hoja y, si es así, incorpora los cambios. Devuelve true si cambió algo.
  async refresh() {
    if (!ref || ref.local || syncing || dirty || !navigator.onLine) return false;
    const remote = await readRemote();
    if (remote.hash === lastHash || dirty || syncing) return false;
    applyData(remote.data);
    base = snapshot();
    lastHash = remote.hash;
    saveCache();
    setStatus('sincronizado');
    emit({ type: 'remote' });
    return true;
  },

  get club() { return club; },
  setClub(obj) {
    club = Object.assign({}, club, obj);
    markDirty();
    emit({ type: 'club' });
  },

  list(sheet) { return db[sheet] ? db[sheet].slice() : []; },
  get(sheet, id) { return (db[sheet] || []).find((r) => r.id === String(id)) || null; },

  upsert(sheet, row) {
    if (!db[sheet]) throw new Error('Hoja desconocida: ' + sheet);
    const clean = {};
    SHEETS[sheet].forEach((c) => { clean[c] = row[c] === undefined || row[c] === null ? '' : row[c]; });
    clean.id = row.id ? String(row.id) : newId();
    const i = db[sheet].findIndex((r) => r.id === clean.id);
    if (i >= 0) db[sheet][i] = clean; else db[sheet].push(clean);
    markDirty();
    emit({ type: 'change', sheet });
    return clean;
  },

  remove(sheet, id) {
    const n = (db[sheet] || []).length;
    db[sheet] = (db[sheet] || []).filter((r) => r.id !== String(id));
    if (db[sheet].length !== n) { markDirty(); emit({ type: 'change', sheet }); }
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Sube los cambios a Drive. En modo local no hace nada.
  async sync() {
    if (!ref || ref.local) return;
    if (syncing) return syncing;
    clearTimeout(timer);
    if (!navigator.onLine) { setStatus('offline'); return; }
    syncing = (async () => {
      try {
        // 1) ¿Ha cambiado la hoja desde la última vez? Fusionar sin perder los cambios locales.
        const remote = await readRemote();
        let merged = false;
        if (remote.hash !== lastHash) {
          if (dirty) {
            const m = mergeData(remote.empty ? null : base, { db, club }, remote.data);
            applyData(m);
            merged = true;
          } else { applyData(remote.data); merged = true; }
        }
        // 2) Subir si hay cambios locales.
        if (dirty) {
          const startRev = rev;
          const data = snapshot();
          await drive.write(ref.id, dataToTabs(data));
          base = data;
          lastHash = hashData(data);
          dirty = rev !== startRev; // ediciones hechas durante la subida
        } else { base = snapshot(); lastHash = remote.hash; }
        saveCache();
        setStatus(dirty ? 'pendiente' : 'sincronizado');
        if (dirty) timer = setTimeout(() => store.sync().catch(() => {}), DEBOUNCE_MS);
        if (merged) emit({ type: 'remote' });
      } catch (e) {
        console.error(e);
        setStatus(navigator.onLine && !e.offline ? 'error' : 'offline');
        store.lastError = e;
        throw e;
      } finally { syncing = null; }
    })();
    return syncing;
  },

  // Descarga el .xlsx del club actual.
  exportXlsx() {
    const blob = workbookBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (club.nombre || ref.name || 'club') + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return blob;
  },

  // Sustituye los datos por los de un .xlsx (File/Blob).
  async importXlsx(file) {
    applyData(parseWorkbook(await file.arrayBuffer()));
    if (!club.nombre) club.nombre = ref.name;
    markDirty();
    emit({ type: 'init' });
  },

  // Clubes locales conocidos (modo sin Client ID).
  localClubs() {
    try { return JSON.parse(localStorage.getItem(LOCAL_INDEX) || '[]').map((name) => ({ name, local: true })); } catch (e) { return []; }
  },

  // Borra todos los datos del club actual (conserva identidad).
  clear() {
    db = emptyDb();
    markDirty();
    emit({ type: 'init' });
  },

  // Añade (sin tocar el resto) conflictos de ejemplo a la planificación de piscina: varios errores y avisos.
  seedPlanificacionConflictos() {
    const pis = db.Piscinas[0];
    if (!pis) return 0;
    const g = db.Grupos;
    const filas = [
      { id: 'pcx1', piscinaId: pis.id, dia: 1, fecha: '', horaInicio: '17:30', horaFin: '18:30', calleDesde: 2, calleHasta: 3, grupoId: (g[1] || g[0]).id, entrenadorId: (g[1] || g[0]).entrenador, notas: 'Demo: calle solapada con Promoción' },
      { id: 'pcx2', piscinaId: pis.id, dia: 4, fecha: '', horaInicio: '18:30', horaFin: '19:30', calleDesde: 5, calleHasta: 5, grupoId: (g[2] || g[0]).id, entrenadorId: (g[1] || g[0]).entrenador, notas: 'Demo: mismo entrenador a la vez' },
    ];
    filas.forEach((f) => store.upsert('AsignacionesCalle', f));
    return filas.length;
  },

  // Reemplaza los datos por una demo del Club Natación Lugones.
  seedDemo() {
    const d = buildDemo();
    db = d.db;
    club = Object.assign({}, club, d.club);
    markDirty();
    emit({ type: 'init' });
    return Object.fromEntries(ENTITY_SHEETS.map((s) => [s, db[s].length]));
  },
};

// ---------- Datos demo ----------
function buildDemo() {
  let seed = 20251;
  const rnd = () => { // mulberry32 determinista
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const addDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };

  const out = emptyDb();
  const clubObj = {
    nombre: 'Club Natación Lugones',
    lema: 'Pequeño gran club',
    logo: '',
    colorPrimario: '#1a73e8',
    colorSecundario: '#0b3d91',
  };

  const grupos = [
    { id: 'g1', nombre: 'Promoción', categoria: 'Benjamín', entrenador: 'Marta Valdés', dias: [1, 3, 5], hora: '17:30', dur: 60, base: 1800, piscina: '25' },
    { id: 'g2', nombre: 'Alevín', categoria: 'Alevín', entrenador: 'Jorge Prieto', dias: [2, 4], hora: '18:30', dur: 75, base: 2600, piscina: '25' },
    { id: 'g3', nombre: 'Infantil-Junior', categoria: 'Infantil', entrenador: 'Marta Valdés', dias: [1, 3, 5], hora: '19:30', dur: 90, base: 3800, piscina: '25' },
    { id: 'g4', nombre: 'Absoluto-Máster', categoria: 'Absoluto', entrenador: 'Jorge Prieto', dias: [2, 4, 6], hora: '20:30', dur: 90, base: 4500, piscina: '50' },
  ];
  grupos.forEach((g) => out.Grupos.push({ id: g.id, nombre: g.nombre, categoria: g.categoria, entrenador: g.entrenador }));

  const nad = [
    ['Lucía', 'Fernández Roces', '2017-03-12', 'F', 'Prebenjamín', 'g1'],
    ['Martina', 'Suárez Cuesta', '2015-09-04', 'F', 'Benjamín', 'g1'],
    ['Pelayo', 'García Alonso', '2015-01-22', 'M', 'Benjamín', 'g1'],
    ['Carla', 'Menéndez Vigil', '2013-06-30', 'F', 'Alevín', 'g2'],
    ['Álvaro', 'Rodríguez Fano', '2013-11-08', 'M', 'Alevín', 'g2'],
    ['Noa', 'Díaz Llano', '2011-02-17', 'F', 'Infantil', 'g3'],
    ['Iker', 'Pérez Naves', '2011-08-25', 'M', 'Infantil', 'g3'],
    ['Paula', 'González Mier', '2009-05-14', 'F', 'Junior', 'g3'],
    ['Marcos', 'Llano Bernardo', '2009-10-03', 'M', 'Junior', 'g3'],
    ['Claudia', 'Vigil Argüelles', '2003-04-19', 'F', 'Absoluto', 'g4'],
    ['Daniel', 'Cueto Faes', '2001-12-01', 'M', 'Absoluto', 'g4'],
    ['Javier', 'Álvarez Tuñón', '1984-07-09', 'M', 'Máster', 'g4'],
  ];
  nad.forEach((n, i) => {
    const id = 'n' + pad(i + 1);
    out.Nadadores.push({
      id, nombre: n[0], apellidos: n[1], fechaNacimiento: n[2], sexo: n[3], categoria: n[4], grupoId: n[5],
      email: '', telefono: '6' + String(10000000 + Math.floor(rnd() * 89999999)), tutor: i < 9 ? 'Familia ' + n[1].split(' ')[0] : '',
      licencia: 'AST' + (4000 + i * 7), notas: '', activo: 'true',
    });
  });

  // Objetivos semanales por tipo (metros)
  const obj = { 'Aeróbico': [6000, 12000], 'Velocidad': [1500, 3500], 'Piernas': [1000, 2500], 'Técnica': [2000, 4000], 'Fuerza': [500, 1500] };
  TIPOS_CARGA.forEach((t, i) => out.ObjetivosCarga.push({ id: 'o' + (i + 1), tipo: t, minSemanalM: obj[t][0], maxSemanalM: obj[t][1] }));

  // Entrenamientos: de hace 3 semanas a la próxima semana
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const enfoques = ['Resistencia aeróbica', 'Velocidad y salidas', 'Técnica de viraje', 'Trabajo de piernas', 'Series mixtas', 'Fuerza en seco'];
  const tipoDe = { 'Resistencia aeróbica': 'Aeróbico', 'Velocidad y salidas': 'Velocidad', 'Técnica de viraje': 'Técnica', 'Trabajo de piernas': 'Piernas', 'Series mixtas': 'Aeróbico', 'Fuerza en seco': 'Fuerza' };
  let ne = 0;
  const sesiones = [];
  for (let w = -3; w <= 1; w++) {
    grupos.forEach((g) => {
      g.dias.forEach((dow) => {
        const fecha = addDays(monday, w * 7 + (dow - 1));
        const f = ymd(fecha);
        const enfoque = enfoques[(ne + g.dias.length) % enfoques.length];
        const vol = Math.round((g.base * (0.9 + rnd() * 0.3)) / 100) * 100;
        const id = 'e' + String(++ne).padStart(3, '0');
        const pasada = fecha < today;
        out.Entrenamientos.push({
          id, fecha: f, hora: g.hora, duracionMin: g.dur, grupoId: g.id, titulo: `${g.nombre} - ${enfoque}`,
          descripcion: `Calentamiento 400 m, parte principal de ${enfoque.toLowerCase()}, vuelta a la calma.`,
          estado: pasada ? 'realizado' : 'planificado', piscina: g.piscina,
          volumenMin: Math.round(vol * 0.9 / 100) * 100, volumenMax: Math.round(vol * 1.1 / 100) * 100, enfoque,
        });
        sesiones.push({ id, fecha: f, pasada, hoy: ymd(fecha) === ymd(today), g, vol, tipo: tipoDe[enfoque] });
      });
    });
  }

  // Asistencia y cargas
  let na = 0, nc = 0;
  sesiones.forEach((s) => {
    if (!s.pasada && !s.hoy) return;
    out.Nadadores.filter((n) => n.grupoId === s.g.id).forEach((n) => {
      const r = rnd();
      let estado = r < 0.84 ? 'presente' : r < 0.92 ? 'justificado' : 'ausente';
      if (s.hoy && rnd() < 0.3) return; // hoy: algunos sin confirmar
      out.Asistencia.push({ id: 'a' + (++na), entrenamientoId: s.id, nadadorId: n.id, estado, nota: estado === 'justificado' ? 'Avisa la familia' : '' });
      if (estado === 'presente' && s.pasada) {
        out.Cargas.push({
          id: 'c' + (++nc), entrenamientoId: s.id, nadadorId: n.id, fecha: s.fecha,
          metros: Math.round((s.vol * (0.85 + rnd() * 0.3)) / 50) * 50, rpe: 4 + Math.floor(rnd() * 5),
          minutos: s.g.dur, tipo: s.tipo, notas: '',
        });
      }
    });
  });

  // Marcas (tiempos en ms)
  const pruebas = [['50 libre', 28500], ['100 libre', 62000], ['50 espalda', 33000], ['100 braza', 80000], ['50 mariposa', 31000], ['200 estilos', 150000]];
  const mult = { 'Prebenjamín': 1.45, 'Benjamín': 1.3, 'Alevín': 1.2, 'Infantil': 1.08, 'Junior': 1.0, 'Absoluto': 0.97, 'Máster': 1.12 };
  const comps = ['Trofeo Ciudad de Gijón', 'Campeonato Asturias', 'Copa Federación', 'Torneo Lugones'];
  let nm = 0;
  out.Nadadores.forEach((n) => {
    const ps = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 3);
    ps.forEach((pi) => {
      for (let k = 0; k < 2; k++) { // dos marcas: la reciente mejora la anterior
        const fecha = addDays(today, -(k === 0 ? 20 + Math.floor(rnd() * 40) : 150 + Math.floor(rnd() * 120)));
        const base = pruebas[pi][1] * mult[n.categoria] * (n.sexo === 'F' ? 1.04 : 1) * (0.96 + rnd() * 0.08) * (k === 0 ? 1 : 1.04);
        out.Marcas.push({
          id: 'm' + (++nm), nadadorId: n.id, fecha: ymd(fecha), prueba: pruebas[pi][0], piscina: pi === 5 ? '50' : pick(['25', '50']),
          tiempoMs: Math.round(base / 10) * 10, competicion: pick(comps), notas: '',
        });
      }
    });
  });

  // Bañador / equipación
  const tallas = { 'Prebenjamín': 'XS', 'Benjamín': 'S', 'Alevín': 'S', 'Infantil': 'M', 'Junior': 'M', 'Absoluto': 'L', 'Máster': 'L' };
  out.Nadadores.forEach((n, i) => {
    const ent = i % 3 !== 0;
    out.Banador.push({ id: 'b' + (i + 1), nadadorId: n.id, talla: tallas[n.categoria], estado: ent ? 'entregado' : 'pendiente', fecha: ent ? ymd(addDays(today, -30 - i)) : '', notas: '' });
  });

  // Planificación de piscina: una piscina de 6 calles y asignaciones recurrentes coherentes con los grupos.
  // Sin conflictos de error (sólo un aviso intencionado: sesión de refuerzo sin entrenador).
  const horario = JSON.stringify({ 1: { abre: '07:00', cierra: '22:00' }, 2: { abre: '07:00', cierra: '22:00' }, 3: { abre: '07:00', cierra: '22:00' }, 4: { abre: '07:00', cierra: '22:00' }, 5: { abre: '07:00', cierra: '22:00' }, 6: { abre: '09:00', cierra: '22:00' }, 7: null });
  out.Piscinas.push({ id: 'p1', nombre: 'Piscina Lugones', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario });
  const calles = { g1: [1, 2], g2: [3, 4], g3: [1, 3], g4: [1, 4] };
  let np = 0;
  grupos.forEach((g) => g.dias.forEach((dow) => {
    const ini = Number(g.hora.slice(0, 2)) * 60 + Number(g.hora.slice(3));
    const hm = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    out.AsignacionesCalle.push({
      id: 'ac' + (++np), piscinaId: 'p1', dia: dow, fecha: '', horaInicio: g.hora, horaFin: hm(ini + g.dur),
      calleDesde: calles[g.id][0], calleHasta: calles[g.id][1], grupoId: g.id, entrenadorId: g.entrenador, notas: '',
    });
  }));
  out.AsignacionesCalle.push({ id: 'ac' + (++np), piscinaId: 'p1', dia: 6, fecha: '', horaInicio: '10:00', horaFin: '11:00', calleDesde: 5, calleHasta: 6, grupoId: 'g1', entrenadorId: '', notas: 'Refuerzo (falta asignar entrenador)' });

  // Comunicaciones
  out.Comunicaciones.push(
    { id: 'k1', fecha: ymd(addDays(today, -1)), titulo: 'Horarios de la próxima semana', texto: 'Se mantienen los horarios habituales. Recordad traer gorro y gafas.', grupoId: '', autor: 'Dirección técnica' },
    { id: 'k2', fecha: ymd(addDays(today, -4)), titulo: 'Competición en Gijón', texto: 'Salida en autobús a las 8:00 desde la piscina de Lugones.', grupoId: 'g3', autor: 'Marta Valdés' },
    { id: 'k3', fecha: ymd(addDays(today, -9)), titulo: 'Entrega de bañadores', texto: 'Quien tenga el bañador pendiente puede recogerlo en secretaría.', grupoId: '', autor: 'Secretaría' },
  );

  return { db: out, club: clubObj };
}

export default store;
