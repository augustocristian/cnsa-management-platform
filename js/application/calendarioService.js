// Calendar use cases: joins the pure domain (js/domain/calendario.js), the club repository and a Google Calendar client.
// EVERYTHING external is injected (repository, auth port, map storage, client factory, preferences port, clock, labels), so this
// module imports no infrastructure, no config and no singleton and can be tested without DOM or network. The app wires the real
// pieces in js/composicion/calendario.js.
import * as D from '../domain/calendario.js';
import { FUENTE_CALENDARIO } from '../domain/temporada.js';
import { CLAVES } from '../domain/preferencias.js';

const HOJAS = ['Entrenamientos', 'Grupos', 'AsignacionesCalle', 'Piscinas', 'Nadadores', 'EventosTemporada'];
D.registrarFuente(FUENTE_CALENDARIO); // extension point: season events (competitions, tests...) feed the calendar and the .ics
const CONCURRENCIA = 3;
const FATALES = new Set(['auth', 'permisos', 'api-desactivada', 'limite']);

const DEFECTOS = { vista: '', alarmaMin: 0, ventanaDias: 90 };
const CLAVE_PREF = { vista: CLAVES.calVista, alarmaMin: CLAVES.calAlarma, ventanaDias: CLAVES.calVentana };

// options:
//   store          repository {list, club, clubRef, setClub, mode?}
//   auth           port {user?, tokenForScope(scope, {interactive, force})}
//   conectado      () => boolean, is a Google connection available? (default: the auth port has a session)
//   storage        {getItem, setItem}|null  map of synced events (null = not persisted)
//   cliente        a ready Google Calendar client, or
//   crearCliente   ({getToken, fetch, sleep}) => client   (built lazily the first time it is needed)
//   calendarScope  OAuth scope for Google Calendar (only used with crearCliente)
//   prefs          {get(key, default), set(key, value)}  view preferences (null = kept in memory)
//   ahora          () => Date, the clock (REQUIRED for anything that needs "today")
//   etq            () => labels used by the domain when it writes titles
export function crearCalendarioService({
  store,
  auth = {},
  storage = null,
  cliente,
  crearCliente,
  calendarScope = '',
  prefs = null,
  conectado,
  ahora,
  etq = () => D.ETQ_DEFECTO,
  fetch: fetchFn,
  sleep,
} = {}) {
  if (typeof ahora !== 'function') throw new TypeError('crearCalendarioService: "ahora" (clock) is required');
  let clienteCache = cliente || null;
  const enMemoria = { ...DEFECTOS };

  const datos = () => Object.fromEntries(HOJAS.map((h) => [h, store.list(h)]));
  const hoy = () => D.fechaDeDate(ahora());
  const clubRef = () => store.clubRef || {};
  const clubId = () => clubRef().id || '';
  const nombreClub = () => (store.club && String(store.club.nombre || '').trim()) || clubRef().name || 'Club';
  const esDemo = () => store.mode === 'demo';
  // A Drive connection exists (there is no user identity; `auth.user` is only read for older test doubles).
  const hayConexion =
    conectado || (() => !!(auth && (typeof auth.isConnected === 'function' ? auth.isConnected() : auth.user)));

  // ---------- View preferences (the port is optional) ----------
  function preferencias() {
    const leer = (k) => (prefs ? prefs.get(CLAVE_PREF[k], DEFECTOS[k]) : enMemoria[k]);
    return { vista: leer('vista'), alarmaMin: leer('alarmaMin'), ventanaDias: leer('ventanaDias') };
  }
  function guardarPreferencia(nombre, valor) {
    if (!CLAVE_PREF[nombre]) return;
    if (prefs) prefs.set(CLAVE_PREF[nombre], valor);
    else enMemoria[nombre] = valor;
  }

  // Groups visible for a screen filter. null = all. filtros: {grupoId, piscina}
  function gruposVisibles(filtros = {}) {
    return filtros.grupoId ? [filtros.grupoId] : null;
  }

  function eventos(rango, filtros = {}) {
    const todos = D.eventosEnRango(datos(), rango, { etq: etq() });
    return D.filtrarEventos(todos, { grupoIds: gruposVisibles(filtros), piscina: filtros.piscina || '' });
  }

  // Events to sync: everything in the club, no screen filters (so the result is stable).
  const eventosPropios = (rango) => eventos(rango, {});

  const zona = () => D.zonaOrDefecto(store.club && store.club.zonaHoraria);
  function guardarZona(z) {
    const v = String(z || '').trim();
    if (v && !D.zonaValida(v)) {
      const e = new Error('zona-invalida');
      e.code = 'zona-invalida';
      throw e;
    }
    store.setClub({ zonaHoraria: v });
    return zona();
  }
  const nombreCalendario = () => `CNL – ${nombreClub()}`;

  // ---------- .ics export ----------
  function exportar({ rango, alarmaMin = 0, filtros = {}, sufijo = '' }) {
    const lista = eventos(rango, filtros);
    const f = ahora();
    const ics = D.generarICS(lista, {
      nombreCalendario: nombreCalendario(),
      zona: zona(),
      alarmaMin,
      ahora: f,
      secuencia: Math.floor(f.getTime() / 60000),
      etq: etq(),
    });
    return { ics, count: lista.length, nombre: D.nombreFicheroICS(nombreClub(), sufijo), eventos: lista };
  }

  // ---------- Google Calendar ----------
  const claveMapa = () => `cnl:cal-sync:${clubId()}`; // no identity in the key: the map belongs to the club
  function leerEstado() {
    try {
      const j = JSON.parse((storage && storage.getItem(claveMapa())) || 'null');
      if (j && j.items) return j;
    } catch (e) {
      /* corrupt state: rebuilt from Google */
    }
    return { items: {}, ultima: null };
  }
  function guardarEstado(est) {
    try {
      if (storage) storage.setItem(claveMapa(), JSON.stringify(est));
    } catch (e) {
      /* no storage: the map is rebuilt next time */
    }
  }

  // -> {ok, motivo: null | 'demo' | 'sin-conexion' | 'sin-cliente'}. The reason is shown to the user (disabled states are explained).
  function puedeSincronizar() {
    if (esDemo()) return { ok: false, motivo: 'demo' };
    if (!hayConexion()) return { ok: false, motivo: 'sin-conexion' };
    if (!clienteCache && !crearCliente) return { ok: false, motivo: 'sin-cliente' };
    return { ok: true, motivo: null };
  }
  function estadoSync() {
    const est = leerEstado();
    return { activa: Object.keys(est.items).length > 0, total: Object.keys(est.items).length, ultima: est.ultima };
  }
  function api() {
    if (!clienteCache) {
      clienteCache = crearCliente({
        fetch: fetchFn,
        sleep,
        getToken: ({ force } = {}) => auth.tokenForScope(calendarScope, { interactive: !force, force: !!force }),
      });
    }
    return clienteCache;
  }
  function exigirSync() {
    const p = puedeSincronizar();
    if (!p.ok) {
      const e = new Error('sync-no-disponible');
      e.code = p.motivo;
      throw e;
    }
  }

  async function ejecutar(items, fn, resumen) {
    let i = 0;
    const trabajador = async () => {
      while (i < items.length && !resumen.abortado) {
        const it = items[i++];
        try {
          await fn(it);
        } catch (e) {
          resumen.errores.push({ id: it.id, code: e.code || 'http', status: e.status || 0, message: e.message });
          if (FATALES.has(e.code)) resumen.abortado = e.code;
        }
        resumen.hecho++;
        if (resumen.onProgreso) resumen.onProgreso({ hecho: resumen.hecho, total: resumen.total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, items.length) }, trabajador));
  }

  // DETERMINISTIC Google event id (base32hex: 0-9 a-v) derived from the club and the event: if the local map is lost halfway through a
  // sync, retrying does not duplicate (Google answers 409 and the existing event is updated).
  function gidDe(id) {
    const s = clubId() + ':' + id;
    let a = 0x811c9dc5,
      b = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
      b = Math.imul(b + s.charCodeAt(i), 0x85ebca6b) ^ (b >>> 13);
    }
    return 'cnl' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }

  // Idempotent upsert of the events in the window [today, today + ventanaDias). Asks for consent when needed.
  // -> {creados, actualizados, borrados, iguales, errores[], abortado}
  async function sincronizar({ ventanaDias = 90, alarmaMin = 0, onProgreso } = {}) {
    exigirSync();
    const desde = hoy();
    const rango = { desde, hasta: D.addDias(desde, ventanaDias - 1) };
    const deseados = eventosPropios(rango).map((ev) => ({
      id: ev.id,
      fecha: ev.fecha,
      cuerpo: D.aEventoGoogle(ev, { zona: zona(), alarmaMin, clubId: clubId(), etq: etq() }),
    }));
    const est = leerEstado();
    const c = api();
    if (!Object.keys(est.items).length) {
      // map lost (another browser, cleared cache): adopt what was already created
      (await c.listarGestionados({ clubId: clubId() })).forEach((x) => {
        est.items[x.cnlId] = { gid: x.gid, huella: '', fecha: x.fecha };
      });
    }
    const diff = D.diffSync(deseados, est.items, desde);
    const resumen = {
      creados: 0,
      actualizados: 0,
      borrados: 0,
      iguales: diff.iguales,
      errores: [],
      abortado: '',
      hecho: 0,
      total: diff.crear.length + diff.actualizar.length + diff.borrar.length,
      onProgreso,
    };
    const crear = async (it) => {
      const gid = gidDe(it.id);
      let r;
      try {
        r = await c.insertar({ ...it.cuerpo, id: gid });
      } catch (e) {
        if (e.status !== 409) throw e; // already exists with that id (a previous attempt created it): update it
        await c.actualizar(gid, it.cuerpo);
        r = { id: gid };
      }
      est.items[it.id] = { gid: r.id, huella: it.huella, fecha: it.fecha };
      resumen.creados++;
      guardarEstado(est); // the map is saved after EVERY event: a crash halfway does not lose what was already done
    };
    try {
      await ejecutar(diff.crear, crear, resumen);
      await ejecutar(
        diff.actualizar,
        async (it) => {
          try {
            await c.actualizar(it.gid, it.cuerpo);
            est.items[it.id] = { gid: it.gid, huella: it.huella, fecha: it.fecha };
            resumen.actualizados++;
            guardarEstado(est);
          } catch (e) {
            if (e.code !== 'no-existe') throw e;
            await crear(it);
          } // deleted by hand in Google: recreated
        },
        resumen,
      );
      await ejecutar(
        diff.borrar,
        async (it) => {
          await c.borrar(it.gid);
          delete est.items[it.id];
          resumen.borrados++;
          guardarEstado(est);
        },
        resumen,
      );
    } finally {
      est.ultima = {
        ts: ahora().toISOString(),
        creados: resumen.creados,
        actualizados: resumen.actualizados,
        borrados: resumen.borrados,
        errores: resumen.errores.length,
      };
      guardarEstado(est);
    }
    delete resumen.onProgreso;
    return resumen;
  }

  // Removes from Google Calendar every event the app created for this club and forgets the map.
  async function dejarDeSincronizar({ onProgreso } = {}) {
    exigirSync();
    const est = leerEstado();
    const c = api();
    const porGid = new Map(Object.entries(est.items).map(([id, m]) => [m.gid, { id, gid: m.gid }]));
    (await c.listarGestionados({ clubId: clubId() })).forEach((x) => {
      if (!porGid.has(x.gid)) porGid.set(x.gid, { id: x.cnlId, gid: x.gid });
    });
    const lista = [...porGid.values()];
    const resumen = { borrados: 0, errores: [], abortado: '', hecho: 0, total: lista.length, onProgreso };
    const restantes = { ...est.items };
    await ejecutar(
      lista,
      async (it) => {
        await c.borrar(it.gid);
        delete restantes[it.id];
        resumen.borrados++;
      },
      resumen,
    );
    guardarEstado({ items: resumen.errores.length ? restantes : {}, ultima: null });
    delete resumen.onProgreso;
    return resumen;
  }

  return {
    datos,
    gruposVisibles,
    eventos,
    eventosPropios,
    zona,
    guardarZona,
    nombreClub,
    nombreCalendario,
    exportar,
    puedeSincronizar,
    estadoSync,
    sincronizar,
    dejarDeSincronizar,
    hoy,
    preferencias,
    guardarPreferencia,
    grupos: () => store.list('Grupos'),
    piscinas: () => store.list('Piscinas'),
  };
}
