// User preferences: the source of truth is cnl/preferencias.json in THEIR Google Drive.
// localStorage is only a cache/mirror (fast start and offline use) with a queue of pending changes.
// Everything is injected (store, remote port, clock, timer, network state) so it can be tested without DOM or network.
//
// Puerto remoto: { leer: async () => objeto|null, escribir: async (objeto) => void }
//   (network errors carry e.offline = true).
import * as P from '../domain/preferencias.js';

const CLAVE_CACHE = 'cnl:prefs';

const SILENCIO = { warn() {}, error() {} }; // default log: the composition root injects the real console
const SIN_TEMPORIZADOR = { set: () => null, clear: () => {} }; // default timer: nothing is scheduled (the composition root injects the real one)

// opciones: {almacen? (Storage-like; none = no local cache), claveCache?, ahora (() => ms), debounceMs?, reintentoMs?,
//   temporizador?: {set, clear}, enLinea? (() => boolean), legado?, log? ({warn, error})}
//  - legado: () => ({clave: valor}) reads the old localStorage keys to migrate them the first time.
export function crearPreferencias({
  almacen = null,
  claveCache = CLAVE_CACHE,
  ahora,
  debounceMs = 2000,
  reintentoMs = 30000,
  temporizador = SIN_TEMPORIZADOR,
  enLinea = () => true,
  legado = () => ({}),
  log = SILENCIO,
} = {}) {
  const ls = almacen;
  const tmp = temporizador;

  let p = P.vacias();
  let pend = new Set();
  let remoto = null;
  let timer = null;
  let enCurso = null;
  let estado = 'sin-sesion'; // sin-sesion (= not connected to Drive) | sincronizado | pendiente | offline | error
  let ultimoError = null;
  const oyentes = new Set();

  const emit = (evt) =>
    oyentes.forEach((fn) => {
      try {
        fn(evt);
      } catch (e) {
        log.error(e);
      }
    });
  function setEstado(s) {
    if (estado !== s) {
      estado = s;
      emit({ tipo: 'estado', estado: s });
    }
  }

  function guardarCache() {
    if (!ls) return;
    try {
      ls.setItem(claveCache, JSON.stringify({ prefs: p, pendientes: [...pend] }));
    } catch (e) {
      /* no space left / private mode */
    }
  }
  function leerCache() {
    if (!ls) return null;
    try {
      const c = JSON.parse(ls.getItem(claveCache) || 'null');
      return c && typeof c === 'object' ? c : null;
    } catch (e) {
      return null;
    }
  }
  const c0 = leerCache();
  if (c0) {
    p = P.normalizar(c0.prefs);
    pend = new Set((Array.isArray(c0.pendientes) ? c0.pendientes : []).filter((k) => k in p.valores));
  }

  function programar(ms = debounceMs) {
    if (!remoto) return;
    tmp.clear(timer);
    timer = tmp.set(() => {
      timer = null;
      sincronizar();
    }, ms);
  }

  // Reads the remote, merges per key (the most recent timestamp wins), applies the remote and uploads the local if needed.
  function sincronizar() {
    if (!remoto) return Promise.resolve({ ok: false, estado: 'sin-sesion' });
    if (enCurso) return enCurso;
    tmp.clear(timer);
    timer = null;
    if (!enLinea()) {
      setEstado('offline');
      return Promise.resolve({ ok: false, estado: 'offline' });
    }
    enCurso = (async () => {
      try {
        const bruto = await remoto.leer();
        const existia = bruto !== null && bruto !== undefined;
        const { resultado, deLocal, deRemoto } = P.fusionar(p, P.normalizar(bruto));
        p = resultado;
        if (deRemoto.length) {
          guardarCache();
          emit({ tipo: 'cambio', claves: deRemoto, origen: 'remoto' });
        }
        const hayQueSubir = deLocal.length > 0 || (!existia && Object.keys(p.valores).length > 0);
        if (hayQueSubir) {
          const enviado = p;
          await remoto.escribir(enviado);
          // What changed while uploading stays pending.
          pend = new Set(
            Object.keys(p.valores).filter(
              (k) =>
                enviado.marcas[k] !== p.marcas[k] ||
                JSON.stringify(enviado.valores[k]) !== JSON.stringify(p.valores[k]),
            ),
          );
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
        guardarCache(); // the queue of pending changes survives a tab close
        programar(reintentoMs);
        return { ok: false, estado, error: e };
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  const api = {
    get estado() {
      return estado;
    },
    get ultimoError() {
      return ultimoError;
    },
    get pendientes() {
      return [...pend];
    },
    // Copy of the full preferences (for debugging and tests).
    snapshot() {
      return JSON.parse(JSON.stringify(p));
    },

    get(clave, def) {
      return P.obtener(p, clave, def);
    },

    // Sets a value. Returns true if it changed. With Drive connected it schedules the upload (debounce); otherwise it stays in the cache.
    set(clave, valor) {
      const n = P.poner(p, clave, valor, ahora());
      if (n === p) return false;
      p = n;
      pend.add(clave);
      guardarCache();
      emit({ tipo: 'cambio', claves: [clave], origen: 'local' });
      if (remoto) {
        setEstado(enLinea() ? 'pendiente' : 'offline');
        programar();
      }
      return true;
    },
    remove(clave) {
      return api.set(clave, null);
    },

    // Links with the user's Drive and synchronises. Keeps the changes made before connecting (e.g. the language chosen on the
    // start screen). There is no user identity: the cache is always cleared when Drive is disconnected. Seeds, with the
    // oldest timestamp, the values of the old localStorage keys that are not yet in the preferences.
    async conectar({ remoto: r }) {
      remoto = r;
      try {
        const viejo = legado() || {};
        Object.keys(viejo).forEach((k) => {
          if (k in p.valores || viejo[k] == null) return;
          const limpio = P.sanear(k, viejo[k]);
          if (limpio !== undefined && limpio !== null)
            p = { version: p.version, valores: { ...p.valores, [k]: limpio }, marcas: { ...p.marcas, [k]: 0 } };
        });
      } catch (err) {
        log.warn('Migration of old preferences', err);
      }
      guardarCache();
      setEstado(pend.size ? 'pendiente' : 'sincronizado');
      return sincronizar();
    },

    // When Drive is disconnected: cuts the link and (by default) forgets the local cache.
    desconectar({ borrar = true } = {}) {
      tmp.clear(timer);
      timer = null;
      remoto = null;
      if (borrar) {
        p = P.vacias();
        pend = new Set();
        if (ls) {
          try {
            ls.removeItem(claveCache);
          } catch (e) {
            /* ignorar */
          }
        }
      }
      setEstado('sin-sesion');
    },

    sincronizar,
    flush() {
      return sincronizar();
    },
    // To hook into the browser's 'online' event.
    volverLaRed() {
      if (remoto && (pend.size || estado === 'offline' || estado === 'error')) return sincronizar();
      return Promise.resolve({ ok: true, estado });
    },

    on(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },

    // Adapter {getItem, setItem, removeItem} over a key prefix, for code that expects a "storage"
    // (e.g. the Google Calendar sync map). Values are stored as already-parsed JSON.
    comoAlmacenamiento(prefijo) {
      return {
        getItem: (k) => {
          const v = api.get(prefijo + k, undefined);
          return v === undefined ? null : JSON.stringify(v);
        },
        setItem: (k, s) => {
          let v;
          try {
            v = JSON.parse(s);
          } catch (e) {
            return;
          }
          api.set(prefijo + k, v);
        },
        removeItem: (k) => {
          api.remove(prefijo + k);
        },
      };
    },
  };
  return api;
}
