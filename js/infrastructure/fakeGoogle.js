// HERRAMIENTA DE PRUEBAS. No forma parte del producto y el usuario nunca la ve.
//
// Adaptador en memoria que sustituye a Google (inicio de sesión + Drive) para poder probar la app sin cuenta real:
// implementa las mismas interfaces que js/auth.js y js/drive.js (sesión simulada, carpeta cnl, ficheros de club,
// preferencias.json, subida de ficheros) con un "Drive" que vive en memoria y se espeja en localStorage
// ('cnl:test:drive') sólo para sobrevivir a una recarga de página dentro de la misma prueba.
//
// Activación (únicamente así):
//   localStorage['cnl:test'] = '1'   o   window.__CNL_TEST__ = true | {opciones}
// Opciones (objeto en window.__CNL_TEST__ o JSON en localStorage['cnl:test:opts']):
//   sesion       true  -> arranca con la sesión ya iniciada (una sola vez por Drive simulado)
//   usuario      email de la cuenta simulada (por defecto entrenador@club.test)
//   demo         true  -> el Drive simulado ya contiene un club con datos de demostración (store.seedDemo)
//   club         nombre de ese club de demostración (por defecto "Club Natación Lugones")
//   sinClientId  true  -> simula que js/config.js no tiene Client ID (pantalla "Configuración necesaria")
//   fallos       { listarClubs: 'offline'|'api', escribir: ... }  errores forzados para pruebas de resiliencia
//
// It also simulates what the store uses to avoid losing data: the file's monotonic `version`, revision history,
// the cnl/backups folder, permanent deletion and test hooks (escribirAntes, corromperClub, vaciarClub, caducarSesion).
//
// app.js lo carga con import() dinámico sólo si el indicador está activo; en producción este módulo no se descarga.

const CLAVE_ESTADO = 'cnl:test:drive';
const CLAVE_OPCIONES = 'cnl:test:opts';
const USER_KEY = 'cnl:user';
const TOKEN_KEY = 'cnl:token';

const clon = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// -> opciones normalizadas si el modo de pruebas está activo; null si no.
export function leerOpciones(entorno = globalThis) {
  let ls = null;
  try { ls = entorno.localStorage || null; } catch (e) { ls = null; }
  const flag = entorno.__CNL_TEST__;
  let activo = !!flag;
  try { activo = activo || (ls && ls.getItem('cnl:test') === '1'); } catch (e) { /* ignorar */ }
  if (!activo) return null;
  let o = {};
  try { o = JSON.parse((ls && ls.getItem(CLAVE_OPCIONES)) || '{}') || {}; } catch (e) { o = {}; }
  if (flag && typeof flag === 'object') o = { ...o, ...flag };
  return {
    sesion: false, usuario: 'entrenador@club.test', nombreUsuario: 'Entrenador de prueba', demo: false,
    club: 'Club Natación Lugones', sinClientId: false, fallos: {}, ...o,
  };
}

// Instala el adaptador sobre los singletons `auth` y `drive` (sustituye sus métodos).
// Devuelve un objeto de inspección/control (también en window.__CNL_FAKE__).
export function instalarFakeGoogle({ auth, drive, config, opciones, almacen } = {}) {
  const opts = { sesion: false, usuario: 'entrenador@club.test', nombreUsuario: 'Entrenador de prueba', demo: false, club: 'Club Natación Lugones', sinClientId: false, fallos: {}, ...opciones };
  let ls = almacen;
  if (ls === undefined) { try { ls = globalThis.localStorage || null; } catch (e) { ls = null; } }
  let ss = null;
  try { ss = globalThis.sessionStorage || null; } catch (e) { ss = null; }

  // ---- "Drive" en memoria ----
  let estado = null;
  try { estado = ls && JSON.parse(ls.getItem(CLAVE_ESTADO) || 'null'); } catch (e) { estado = null; }
  if (!estado || typeof estado !== 'object') estado = { clubs: {}, prefs: null, archivos: {}, carpetas: {}, seq: 0, sesionIniciada: false, demoSembrado: {} };
  const persistir = () => { if (ls) { try { ls.setItem(CLAVE_ESTADO, JSON.stringify(estado)); } catch (e) { /* ignorar */ } } };
  const nuevoId = (p) => p + '-' + (++estado.seq);
  const ahora = () => new Date().toISOString();
  const falla = (clave) => {
    const f = opts.fallos && opts.fallos[clave];
    if (!f) return;
    if (f === 'offline') throw Object.assign(new Error('Sin conexión'), { offline: true, code: 'sin-conexion' });
    throw Object.assign(new Error('Fallo simulado de Drive'), { status: 500, code: 'desconocido' });
  };
  let sesionCaducada = false;
  let antesDeEscribir = null; // one-shot hook: simulates another device writing right before our write
  const requiereSesion = () => {
    if (sesionCaducada) throw Object.assign(new Error('La sesión de Google ha caducado. Vuelve a iniciar sesión.'), { status: 401, code: 'sesion-caducada' });
    if (!auth.user) throw Object.assign(new Error('Sin sesión de Google. Inicia sesión.'), { status: 401, code: 'sesion-caducada' });
  };

  if (opts.demo && !Object.keys(estado.clubs).length) {
    const id = nuevoId('club');
    estado.clubs[id] = { id, name: opts.club, doc: { version: 1, club: {}, hojas: {} }, rev: 1, version: 1, revisiones: [], modified: ahora() };
    estado.demoPendiente = id;
  }
  persistir();

  const meta = (c) => ({ rev: 'r' + c.rev, modifiedTime: c.modified, name: c.name, version: c.version || c.rev });
  // Every change to the file bumps its rev (content) and its version (any change, including renames) and leaves a revision.
  const cambiar = (c, doc, { contenido = true } = {}) => {
    c.version = (c.version || c.rev) + 1;
    if (contenido) {
      c.rev++;
      c.doc = clon(doc);
      delete c.docRaw;
      (c.revisiones ||= []).push({ id: 'rev-' + c.version, modified: ahora(), doc: clon(doc) });
      if (c.revisiones.length > 100) c.revisiones.shift();
    }
    c.modified = ahora();
  };
  const clubDe = (id) => {
    const c = estado.clubs[id];
    if (!c) throw Object.assign(new Error('No se encuentra el fichero en tu Drive.'), { status: 404, code: 'no-encontrado' });
    return c;
  };

  // ---- Drive simulado: misma interfaz que js/drive.js ----
  const driveFalso = {
    fileUrl: (id) => 'https://drive.google.com/file/d/' + id + '/view',
    folderUrl: (id) => 'https://drive.google.com/drive/folders/' + id,
    async ensureFolder(name = 'cnl', parentId = 'root') {
      requiereSesion(); falla('carpeta');
      const k = parentId + '/' + name;
      if (!estado.carpetas[k]) { estado.carpetas[k] = nuevoId('carpeta'); persistir(); }
      return estado.carpetas[k];
    },
    async ensureFolderPath(partes = []) {
      let id = await driveFalso.ensureFolder('cnl');
      for (const p of partes) id = await driveFalso.ensureFolder(p, id); // eslint-disable-line no-await-in-loop
      return id;
    },
    async findFile(name, parentId) {
      requiereSesion();
      const f = Object.values(estado.archivos).find((a) => a.name === name && (!parentId || a.parentId === parentId));
      return f ? { id: f.id, name: f.name, rev: 'a' + f.rev, modifiedTime: f.modified, version: f.rev } : null;
    },
    async listFiles(parentId) {
      requiereSesion();
      return Object.values(estado.archivos).filter((a) => a.parentId === parentId).map((a) => ({ id: a.id, name: a.name, createdTime: a.created || a.modified, modifiedTime: a.modified }));
    },
    async upload({ name, mimeType = 'application/json', body, parentId, id, appProperties }) {
      requiereSesion(); falla('subir');
      let contenido = body;
      if (typeof Blob !== 'undefined' && body instanceof Blob) contenido = { blobSize: body.size, tipo: body.type };
      if (id && estado.archivos[id]) {
        const a = estado.archivos[id];
        a.rev++; a.modified = ahora(); a.contenido = contenido; if (name) a.name = name;
        persistir();
        return { id, name: a.name, rev: 'a' + a.rev, version: a.rev };
      }
      const nid = nuevoId('archivo');
      estado.archivos[nid] = { id: nid, name, mimeType, parentId: parentId || await driveFalso.ensureFolder(), contenido, appProperties: appProperties || {}, rev: 1, created: ahora(), modified: ahora() };
      persistir();
      return { id: nid, name, rev: 'a1', version: 1 };
    },
    async renameFile(id, name) {
      let version = null;
      if (estado.archivos[id]) estado.archivos[id].name = name;
      else if (estado.clubs[id]) { estado.clubs[id].name = String(name).replace(/\.json$/i, ''); cambiar(estado.clubs[id], null, { contenido: false }); version = estado.clubs[id].version; }
      persistir();
      return { version };
    },
    async deleteFile(id) { delete estado.archivos[id]; delete estado.clubs[id]; persistir(); },
    async eliminarDefinitivo(id) { delete estado.archivos[id]; delete estado.clubs[id]; persistir(); },
    async leerFichero(id) {
      requiereSesion();
      const a = estado.archivos[id];
      if (!a) throw Object.assign(new Error('No se encuentra el fichero en tu Drive.'), { status: 404, code: 'no-encontrado' });
      return JSON.parse(typeof a.contenido === 'string' ? a.contenido : 'null');
    },
    async revisiones(id) { requiereSesion(); return (clubDe(id).revisiones || []).map((r) => ({ id: r.id, modifiedTime: r.modified })); },
    async leerRevision(id, revId) { requiereSesion(); const r = (clubDe(id).revisiones || []).find((x) => x.id === revId); return r ? clon(r.doc) : null; },
    async revisionPrevia(id) {
      requiereSesion();
      const rs = clubDe(id).revisiones || [];
      return rs.length < 2 ? null : clon(rs[rs.length - 2].doc);
    },
    async borrarRevisionesAntiguas(id) {
      const c = clubDe(id);
      const n = Math.max(0, (c.revisiones || []).length - 1);
      c.revisiones = (c.revisiones || []).slice(-1);
      persistir();
      return n;
    },
    async listClubs() {
      requiereSesion(); falla('listarClubs');
      return Object.values(estado.clubs).map((c) => ({ id: c.id, name: c.name, url: driveFalso.fileUrl(c.id), modified: c.modified, rev: 'r' + c.rev }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async createClub(nombre) {
      requiereSesion(); falla('crearClub');
      const id = nuevoId('club');
      const c = { id, name: String(nombre), doc: { version: 1, club: {}, hojas: {} }, rev: 1, version: 1, revisiones: [], modified: ahora() };
      estado.clubs[id] = c;
      persistir();
      return { id, name: c.name, url: driveFalso.fileUrl(id), rev: 'r1' };
    },
    async renameClub(id, nombre) { const c = clubDe(id); c.name = String(nombre); cambiar(c, null, { contenido: false }); persistir(); return { version: c.version }; },
    async meta(id) { requiereSesion(); falla('leer'); return meta(clubDe(id)); },
    async read(id) {
      requiereSesion(); falla('leer');
      const c = clubDe(id);
      if (c.docRaw !== undefined) throw Object.assign(new Error('El fichero del club no es un JSON válido.'), { code: 'fichero-danado', raw: c.docRaw });
      return { doc: clon(c.doc), rev: 'r' + c.rev, version: c.version || c.rev, name: c.name };
    },
    async write(id, doc) {
      requiereSesion(); falla('escribir');
      if (antesDeEscribir) { const f = antesDeEscribir; antesDeEscribir = null; f(); }
      const c = clubDe(id);
      cambiar(c, doc);
      persistir();
      return { rev: 'r' + c.rev, version: c.version };
    },
    async leerPreferencias() { requiereSesion(); falla('preferencias'); return clon(estado.prefs); },
    async guardarPreferencias(obj) { requiereSesion(); falla('preferencias'); estado.prefs = clon(obj); persistir(); },
    reset() { /* nada que olvidar */ },
  };
  // Descriptores originales para poder desinstalar el adaptador (las pruebas lo instalan y lo quitan por test).
  const originales = [];
  const guardar = (obj, claves) => claves.forEach((k) => originales.push([obj, k, Object.getOwnPropertyDescriptor(obj, k)]));
  guardar(drive, [...Object.keys(driveFalso), 'preferencias']);
  Object.assign(drive, driveFalso);
  Object.defineProperty(drive, 'preferencias', { get: () => ({ leer: () => drive.leerPreferencias(), escribir: (o) => drive.guardarPreferencias(o) }), configurable: true });

  // ---- Sesión simulada: misma interfaz que js/auth.js ----
  const usuarioSimulado = (email) => ({ email, name: opts.nombreUsuario, picture: '' });
  const abrirSesion = (email) => {
    auth.user = usuarioSimulado(email || opts.usuario);
    estado.sesionIniciada = true;
    persistir();
    try { ls && ls.setItem(USER_KEY, JSON.stringify(auth.user)); ss && ss.setItem(TOKEN_KEY, JSON.stringify({ fake: true })); } catch (e) { /* ignorar */ }
  };
  guardar(auth, ['enabled', 'init', 'signIn', 'signOut', 'token', 'ensureToken', 'tokenForScope', 'invalidate', 'reconectar']);
  const userAntes = auth.user;
  Object.defineProperty(auth, 'enabled', { get: () => !opts.sinClientId, configurable: true });
  Object.assign(auth, {
    async init() {
      auth.user = null;
      let guardado = null;
      try { guardado = ls && JSON.parse(ls.getItem(USER_KEY) || 'null'); } catch (e) { guardado = null; }
      const fakeToken = ss && ss.getItem(TOKEN_KEY);
      if (guardado && fakeToken) auth.user = guardado;
      else if (opts.sesion && !estado.sesionIniciada && !opts.sinClientId) abrirSesion(opts.usuario);
    },
    async signIn({ clientId } = {}) {
      if (opts.sinClientId) {
        if (!clientId) throw Object.assign(new Error('Falta el Client ID'), { code: 'sin-client-id' });
        if (opts.clientIdInvalido) throw Object.assign(new Error('origin_mismatch'), { code: 'origen-no-autorizado', origin: location.origin });
        opts.sinClientId = false;
        try { config && config.setClientId && config.setClientId(clientId); } catch (e) { /* ignorar */ }
      }
      if (opts.errorLogin) throw Object.assign(new Error(opts.errorLogin), { code: opts.errorLogin, origin: location.origin });
      abrirSesion(opts.usuario);
      return auth.user;
    },
    signOut() {
      auth.user = null;
      try { ls && ls.removeItem(USER_KEY); ss && ss.removeItem(TOKEN_KEY); } catch (e) { /* ignorar */ }
    },
    async reconectar() { sesionCaducada = false; auth.caducada = false; return auth.user ? 'fake-token' : null; },
    token: () => (auth.user ? 'fake-token' : null),
    async ensureToken() { return auth.user ? 'fake-token' : null; },
    async tokenForScope() { return null; }, // Google Calendar no se simula
    invalidate() {},
  });

  const control = {
    opciones: opts,
    estado: () => clon(estado),
    clubs: () => Object.values(estado.clubs).map(clon),
    club: (id) => clon(estado.clubs[id] || null),
    prefs: () => clon(estado.prefs),
    archivos: () => Object.values(estado.archivos).map(clon),
    // Simulates ANOTHER device changing the club file: applies `fn(doc)` and bumps the revision.
    editarClubExterno(id, fn) { const c = clubDe(id); const d = clon(c.doc) || {}; fn(d); cambiar(c, d); persistir(); },
    // One-shot hook: `fn` runs right before the app's next write is applied (another device writes between
    // our metadata read and our PATCH).
    escribirAntes(fn) { antesDeEscribir = fn; },
    // The club file now contains text that is not JSON.
    corromperClub(id, texto = '{ esto no es json') { const c = clubDe(id); c.docRaw = String(texto); c.rev++; c.version = (c.version || c.rev) + 1; c.modified = ahora(); persistir(); },
    // The club file now contains valid but empty JSON ({}, null...).
    vaciarClub(id, valor = {}) { const c = clubDe(id); cambiar(c, valor); c.doc = valor; persistir(); },
    revisionesDe: (id) => (clubDe(id).revisiones || []).map(clon),
    // Simulates the Google token expiring and not being renewable without a click: every Drive call returns 401.
    caducarSesion() { sesionCaducada = true; if (auth.marcarCaducada) auth.marcarCaducada(); else auth.caducada = true; },
    // Simula otro dispositivo cambiando las preferencias.
    editarPrefsExterno(fn) { const p = clon(estado.prefs) || { version: 1, valores: {}, marcas: {} }; fn(p); estado.prefs = p; persistir(); },
    abrirSesion,
    // Tras abrir un club: siembra los datos de demostración una sola vez (store.seedDemo).
    despuesDeAbrirClub(store) {
      const ref = store.clubRef;
      if (!opts.demo || !ref || estado.demoSembrado[ref.id]) return false;
      if (estado.demoPendiente !== ref.id) return false;
      estado.demoSembrado[ref.id] = true;
      persistir();
      store.seedDemo();
      return true;
    },
    // Quita el adaptador: vuelven los métodos reales de auth y drive.
    desinstalar() {
      originales.reverse().forEach(([obj, k, d]) => { if (d) Object.defineProperty(obj, k, d); else delete obj[k]; });
      auth.user = userAntes;
      try { delete globalThis.__CNL_FAKE__; } catch (e) { /* ignorar */ }
    },
    // Borra el Drive simulado (nueva cuenta, sin nada).
    vaciar() { estado = { clubs: {}, prefs: null, archivos: {}, carpetas: {}, seq: 0, sesionIniciada: false, demoSembrado: {} }; persistir(); },
  };
  try { globalThis.__CNL_FAKE__ = control; } catch (e) { /* ignorar */ }
  return control;
}
