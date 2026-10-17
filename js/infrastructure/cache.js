// Local cache of the club (a mirror of what is in Drive + the queue of pending changes).
// First choice: localStorage (synchronous, survives closing the tab in the middle of a write).
// If localStorage is full or blocked IndexedDB is used as overflow; if that is not possible either the user is warned (error 'cache-llena').
// When reading, the most recent copy (field `t`) of the two is taken.

const IDB_NAME = 'cnl-cache';
const IDB_STORE = 'kv';

// Prefixes/keys holding personal or connection data: ALWAYS erased when Drive is disconnected. 'cnl:user' and 'cnl:token' are LEGACY keys
// of the sign-in era, still erased in case an earlier version left them. Demo data ('cnl:demo:*' and the 'cnl:mode' flag) is a separate namespace: it is erased by leaving the demo and never mixed with real data.
export const CLAVES_LOCALES = [
  'cnl:club:',
  'cnl:drive-auth',
  'cnl:user',
  'cnl:prefs',
  'cnl:cal-sync:',
  'cnl:cal-vista',
  'cnl:tutorial',
  'cnl:token',
  'cnl:demo:',
  'cnl:mode',
];
export const CLAVES_SESION = ['cnl:elegir', 'cnl:token'];

function abrirIdb() {
  return new Promise((resolve, reject) => {
    let idb;
    try {
      idb = globalThis.indexedDB;
    } catch (e) {
      idb = null;
    }
    if (!idb) {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    let req;
    try {
      req = idb.open(IDB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB failed'));
    req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
  });
}

async function idbHacer(modo, fn) {
  const db = await abrirIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, modo);
      const st = tx.objectStore(IDB_STORE);
      let res;
      try {
        res = fn(st);
      } catch (e) {
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB aborted'));
    });
  } finally {
    try {
      db.close();
    } catch (e) {
      /* ignore */
    }
  }
}

const ls = () => {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
};

export const cache = {
  // Saves `obj` (JSON). -> 'ls' | 'idb'. Throws an Error with code 'cache-llena' if it fits nowhere.
  async guardar(key, obj) {
    const valor = JSON.stringify({ ...obj, t: Date.now() });
    const s = ls();
    let errLs = null;
    if (s) {
      try {
        s.setItem(key, valor);
        // If it had previously overflowed to IndexedDB, that copy is now stale
        if (cache._enIdb.has(key)) {
          cache._enIdb.delete(key);
          idbHacer('readwrite', (st) => st.delete(key)).catch(() => {});
        }
        return 'ls';
      } catch (e) {
        errLs = e;
      }
    }
    try {
      await idbHacer('readwrite', (st) => st.put(valor, key));
      cache._enIdb.add(key);
      try {
        s && s.removeItem(key);
      } catch (e) {
        /* ignore */
      } // frees space in localStorage
      return 'idb';
    } catch (errIdb) {
      throw Object.assign(new Error('Sin espacio en el almacenamiento local'), {
        code: 'cache-llena',
        causa: errLs || errIdb,
      });
    }
  },

  // Synchronous version for localStorage only (used when closing the tab, where waiting is not possible). -> true | false
  guardarSync(key, obj) {
    const s = ls();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify({ ...obj, t: Date.now() }));
      return true;
    } catch (e) {
      return false;
    }
  },

  async leer(key) {
    let a;
    let b;
    const s = ls();
    try {
      a = s ? JSON.parse(s.getItem(key) || 'null') : null;
    } catch (e) {
      a = null;
    }
    try {
      b = JSON.parse((await idbHacer('readonly', (st) => st.get(key))) || 'null');
    } catch (e) {
      b = null;
    }
    if (b) cache._enIdb.add(key);
    const c = a && b ? ((b.t || 0) > (a.t || 0) ? b : a) : a || b;
    return c && typeof c === 'object' ? c : null;
  },

  _enIdb: new Set(),

  // Deletes ONE entry (localStorage and its IndexedDB copy).
  async eliminar(key) {
    try {
      ls()?.removeItem(key);
    } catch (e) {
      /* ignore */
    }
    cache._enIdb.delete(key);
    try {
      await idbHacer('readwrite', (st) => st.delete(key));
    } catch (e) {
      /* no IndexedDB: nothing to delete */
    }
  },

  // Deletes the localStorage/sessionStorage keys starting with any of the prefixes, and the IndexedDB copy.
  async limpiar(prefijos = CLAVES_LOCALES) {
    const quitar = (almacen) => {
      if (!almacen) return;
      try {
        for (const k of Object.keys(almacen))
          if (prefijos.some((p) => k === p || k.startsWith(p))) almacen.removeItem(k);
      } catch (e) {
        /* ignore */
      }
    };
    quitar(ls());
    try {
      quitar(globalThis.sessionStorage);
    } catch (e) {
      /* ignore */
    }
    cache._enIdb.clear();
    try {
      await idbHacer('readwrite', (st) => st.clear());
    } catch (e) {
      /* no IndexedDB: nothing to delete */
    }
  },
};

// Disconnecting Drive: no mirror of personal data stays on the device.
export async function limpiarDatosLocales() {
  await cache.limpiar(CLAVES_LOCALES);
  try {
    for (const k of CLAVES_SESION) globalThis.sessionStorage.removeItem(k);
  } catch (e) {
    /* ignore */
  }
}

export default cache;
