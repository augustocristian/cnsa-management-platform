// Preferencias del usuario: la fuente de verdad es cnl/preferencias.json en SU Google Drive.
// localStorage sólo hace de caché/espejo (arranque rápido y uso sin conexión) con una cola de cambios pendientes.
// Todo se inyecta (almacén, puerto remoto, reloj, temporizador, estado de red) para probarlo sin DOM ni red.
//
// Puerto remoto: { leer: async () => objeto|null, escribir: async (objeto) => void }
//   (los errores de red llevan e.offline = true).
import * as P from '../domain/preferencias.js';

const CLAVE_CACHE = 'cnl:prefs';

function almacenamientoPorDefecto() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

// opciones: {almacen?, claveCache?, ahora?, debounceMs?, reintentoMs?, temporizador?: {set, clear}, enLinea?, legado?}
//  - legado: () => ({clave: valor}) lee las claves antiguas de localStorage para migrarlas la primera vez.
export function crearPreferencias({
  almacen, claveCache = CLAVE_CACHE, ahora = () => Date.now(), debounceMs = 2000, reintentoMs = 30000,
  temporizador, enLinea = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false), legado = () => ({}),
} = {}) {
  const ls = almacen === undefined ? almacenamientoPorDefecto() : almacen;
  const tmp = temporizador || {
    set: (fn, ms) => { const id = setTimeout(fn, ms); if (id && id.unref) id.unref(); return id; },
    clear: (id) => clearTimeout(id),
  };

  let p = P.vacias();
  let pend = new Set();
  let remoto = null;
  let timer = null;
  let enCurso = null;
  let estado = 'sin-sesion'; // sin-sesion (= not connected to Drive) | sincronizado | pendiente | offline | error
  let ultimoError = null;
  const oyentes = new Set();

  const emit = (evt) => oyentes.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  function setEstado(s) { if (estado !== s) { estado = s; emit({ tipo: 'estado', estado: s }); } }

  function guardarCache() {
    if (!ls) return;
    try { ls.setItem(claveCache, JSON.stringify({ prefs: p, pendientes: [...pend] })); } catch (e) { /* sin espacio / privado */ }
  }
  function leerCache() {
    if (!ls) return null;
    try { const c = JSON.parse(ls.getItem(claveCache) || 'null'); return c && typeof c === 'object' ? c : null; } catch (e) { return null; }
  }
  const c0 = leerCache();
  if (c0) {
    p = P.normalizar(c0.prefs);
    pend = new Set((Array.isArray(c0.pendientes) ? c0.pendientes : []).filter((k) => k in p.valores));
  }

  function programar(ms = debounceMs) {
    if (!remoto) return;
    tmp.clear(timer);
    timer = tmp.set(() => { timer = null; sincronizar(); }, ms);
  }

  // Lee lo remoto, fusiona por clave (gana la marca más reciente), aplica lo remoto y sube lo local si hace falta.
  function sincronizar() {
    if (!remoto) return Promise.resolve({ ok: false, estado: 'sin-sesion' });
    if (enCurso) return enCurso;
    tmp.clear(timer);
    timer = null;
    if (!enLinea()) { setEstado('offline'); return Promise.resolve({ ok: false, estado: 'offline' }); }
    enCurso = (async () => {
      try {
        const bruto = await remoto.leer();
        const existia = bruto !== null && bruto !== undefined;
        const { resultado, deLocal, deRemoto } = P.fusionar(p, P.normalizar(bruto));
        p = resultado;
        if (deRemoto.length) { guardarCache(); emit({ tipo: 'cambio', claves: deRemoto, origen: 'remoto' }); }
        const hayQueSubir = deLocal.length > 0 || (!existia && Object.keys(p.valores).length > 0);
        if (hayQueSubir) {
          const enviado = p;
          await remoto.escribir(enviado);
          // Lo cambiado mientras se subía sigue pendiente.
          pend = new Set(Object.keys(p.valores).filter((k) => enviado.marcas[k] !== p.marcas[k] || JSON.stringify(enviado.valores[k]) !== JSON.stringify(p.valores[k])));
        } else {
          pend = new Set([...pend].filter((k) => deLocal.includes(k)));
        }
        guardarCache();
        ultimoError = null;
        setEstado(pend.size ? 'pendiente' : 'sincronizado');
        if (pend.size) programar();
        return { ok: true, estado };
      } catch (e) {
        ultimoError = e;
        setEstado(e && e.offline ? 'offline' : !enLinea() ? 'offline' : 'error');
        guardarCache(); // la cola de cambios pendientes sobrevive a un cierre de la pestaña
        programar(reintentoMs);
        return { ok: false, estado, error: e };
      } finally { enCurso = null; }
    })();
    return enCurso;
  }

  const api = {
    get estado() { return estado; },
    get ultimoError() { return ultimoError; },
    get pendientes() { return [...pend]; },
    // Copia de las preferencias completas (para depurar y probar).
    snapshot() { return JSON.parse(JSON.stringify(p)); },

    get(clave, def) { return P.obtener(p, clave, def); },

    // Fija un valor. Devuelve true si cambió. Con Drive conectado programa la subida (debounce); si no, queda en la caché.
    set(clave, valor) {
      const n = P.poner(p, clave, valor, ahora());
      if (n === p) return false;
      p = n;
      pend.add(clave);
      guardarCache();
      emit({ tipo: 'cambio', claves: [clave], origen: 'local' });
      if (remoto) { setEstado(enLinea() ? 'pendiente' : 'offline'); programar(); }
      return true;
    },
    remove(clave) { return api.set(clave, null); },

    // Enlaza con el Drive del usuario y sincroniza. Conserva los cambios hechos antes de conectar (p. ej. el idioma elegido en la
    // pantalla de inicio). No hay identidad de usuario: la caché se borra siempre al desconectar Drive. Siembra, con la marca
    // más antigua, los valores de las claves antiguas de localStorage que aún no estén en las preferencias.
    async conectar({ remoto: r }) {
      remoto = r;
      try {
        const viejo = legado() || {};
        Object.keys(viejo).forEach((k) => {
          if (k in p.valores || viejo[k] == null) return;
          const limpio = P.sanear(k, viejo[k]);
          if (limpio !== undefined && limpio !== null) p = { version: p.version, valores: { ...p.valores, [k]: limpio }, marcas: { ...p.marcas, [k]: 0 } };
        });
      } catch (err) { console.warn('Migración de preferencias antiguas', err); }
      guardarCache();
      setEstado(pend.size ? 'pendiente' : 'sincronizado');
      return sincronizar();
    },

    // Al desconectar Drive: corta el enlace y (por defecto) olvida la caché local.
    desconectar({ borrar = true } = {}) {
      tmp.clear(timer);
      timer = null;
      remoto = null;
      if (borrar) {
        p = P.vacias(); pend = new Set();
        if (ls) { try { ls.removeItem(claveCache); } catch (e) { /* ignorar */ } }
      }
      setEstado('sin-sesion');
    },

    sincronizar,
    flush() { return sincronizar(); },
    // Para enganchar al evento 'online' del navegador.
    volverLaRed() { if (remoto && (pend.size || estado === 'offline' || estado === 'error')) return sincronizar(); return Promise.resolve({ ok: true, estado }); },

    on(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },

    // Adaptador {getItem, setItem, removeItem} sobre un prefijo de claves, para código que espera un "storage"
    // (p. ej. el mapa de sincronización de Google Calendar). Los valores se guardan como JSON ya analizado.
    comoAlmacenamiento(prefijo) {
      return {
        getItem: (k) => { const v = api.get(prefijo + k, undefined); return v === undefined ? null : JSON.stringify(v); },
        setItem: (k, s) => { let v; try { v = JSON.parse(s); } catch (e) { return; } api.set(prefijo + k, v); },
        removeItem: (k) => { api.remove(prefijo + k); },
      };
    },
  };
  return api;
}
