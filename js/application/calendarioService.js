// Orquestación del calendario: une el dominio puro (js/domain/calendario.js), el store y el cliente de Google Calendar.
// Todo se recibe por parámetro (store, auth, almacenamiento, cliente, reloj, etiquetas) para poder probarlo sin DOM ni red.
import * as D from '../domain/calendario.js';
import { crearClienteGoogleCalendar } from '../infrastructure/googleCalendar.js';
import { CALENDAR_SCOPE } from '../config.js';

const HOJAS = ['Entrenamientos', 'Grupos', 'AsignacionesCalle', 'Piscinas', 'Usuarios', 'Nadadores'];
const CONCURRENCIA = 3;
const FATALES = new Set(['auth', 'permisos', 'api-desactivada', 'limite']);

function almacenamientoPorDefecto() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

// opciones: {store, auth, storage?, cliente?, calendarScope?, ahora?: () => Date, etq?: () => etiquetas, fetch?, sleep?}
export function crearCalendarioService({ store, auth, storage, cliente, ahora = () => new Date(), etq = () => D.ETQ_DEFECTO, fetch: fetchFn, sleep, calendarScope = CALENDAR_SCOPE } = {}) {
  const ls = storage === undefined ? almacenamientoPorDefecto() : storage;
  let nadadorDemo = '';
  let clienteCache = cliente || null;

  const datos = () => Object.fromEntries(HOJAS.map((h) => [h, store.list(h)]));
  const hoy = () => D.fechaDeDate(ahora());
  const usuario = () => ({ rol: auth.role(), email: (auth.user && auth.user.email) || '', nombre: (auth.user && auth.user.name) || '' });
  const clubRef = () => store.clubRef || {};
  const clubId = () => { const r = clubRef(); return r.id || `local:${r.name || (store.club && store.club.nombre) || 'club'}`; };
  const nombreClub = () => (store.club && String(store.club.nombre || '').trim()) || clubRef().name || 'Club';

  function ambito() {
    const u = usuario();
    const d = datos();
    let a = D.ambitoUsuario({ ...u, datos: d });
    if (u.rol === 'nadador' && !a.vinculado && nadadorDemo) { // vista demo: elegir a qué nadador representar
      const n = d.Nadadores.find((x) => x.id === nadadorDemo);
      a = { todos: false, grupoIds: n && n.grupoId ? [n.grupoId] : [], vinculado: !!n, nadadorId: nadadorDemo };
    }
    return a;
  }

  // Conjunto de grupos visibles según rol y filtros de pantalla. null = todos.
  // filtros: {todosGrupos (entrenador), grupoId, piscina}
  function gruposVisibles(filtros = {}) {
    const u = usuario();
    const a = ambito();
    let ids;
    if (u.rol === 'nadador') ids = a.grupoIds;
    else if (u.rol === 'entrenador' && !a.todos && !filtros.todosGrupos) ids = a.grupoIds;
    else ids = null;
    if (filtros.grupoId && u.rol !== 'nadador') ids = ids && !ids.includes(filtros.grupoId) ? [] : [filtros.grupoId];
    return ids;
  }

  function eventos(rango, filtros = {}) {
    const todos = D.eventosEnRango(datos(), rango, { etq: etq() });
    return D.filtrarEventos(todos, { grupoIds: gruposVisibles(filtros), piscina: u_noNadador(filtros.piscina) });
  }
  const u_noNadador = (p) => (usuario().rol === 'nadador' ? '' : p || '');

  // Los eventos "míos" para sincronizar: ámbito por rol, sin filtros de pantalla (para que el resultado sea estable).
  const eventosPropios = (rango) => eventos(rango, {});

  const zona = () => D.zonaOrDefecto(store.club && store.club.zonaHoraria);
  function guardarZona(z) {
    const v = String(z || '').trim();
    if (v && !D.zonaValida(v)) { const e = new Error('zona-invalida'); e.code = 'zona-invalida'; throw e; }
    store.setClub({ zonaHoraria: v });
    return zona();
  }
  const nombreCalendario = () => `CNL – ${nombreClub()}`;

  // ---------- Exportación .ics ----------
  function exportar({ rango, alarmaMin = 0, filtros = {}, sufijo = '' }) {
    const lista = eventos(rango, filtros);
    const f = ahora();
    const ics = D.generarICS(lista, {
      nombreCalendario: nombreCalendario(), zona: zona(), alarmaMin, ahora: f,
      secuencia: Math.floor(f.getTime() / 60000), etq: etq(),
    });
    return { ics, count: lista.length, nombre: D.nombreFicheroICS(nombreClub(), sufijo), eventos: lista };
  }

  // ---------- Google Calendar ----------
  const emailUsuario = () => String((auth.user && auth.user.email) || '').toLowerCase();
  const claveMapa = () => `cnl:cal-sync:${clubId()}:${emailUsuario()}`;
  function leerEstado() {
    try {
      const j = JSON.parse(ls.getItem(claveMapa()) || 'null');
      if (j && j.items) return j;
    } catch (e) { /* estado corrupto: se reconstruye */ }
    return { items: {}, ultima: null };
  }
  function guardarEstado(est) { try { ls.setItem(claveMapa(), JSON.stringify(est)); } catch (e) { /* sin almacenamiento */ } }

  // -> {ok, motivo: 'local'|'sin-sesion'|null}
  function puedeSincronizar() {
    if (!auth.enabled) return { ok: false, motivo: 'local' };
    if (!auth.user) return { ok: false, motivo: 'sin-sesion' };
    return { ok: true, motivo: null };
  }
  function estadoSync() {
    const est = leerEstado();
    return { activa: Object.keys(est.items).length > 0, total: Object.keys(est.items).length, ultima: est.ultima };
  }
  function api() {
    if (!clienteCache) {
      clienteCache = crearClienteGoogleCalendar({
        fetch: fetchFn, sleep,
        getToken: ({ force } = {}) => auth.tokenForScope(calendarScope, { interactive: !force, force: !!force }),
      });
    }
    return clienteCache;
  }

  async function ejecutar(items, fn, resumen) {
    let i = 0;
    const trabajador = async () => {
      while (i < items.length && !resumen.abortado) {
        const it = items[i++];
        try { await fn(it); } catch (e) {
          resumen.errores.push({ id: it.id, code: e.code || 'http', status: e.status || 0, message: e.message });
          if (FATALES.has(e.code)) resumen.abortado = e.code;
        }
        resumen.hecho++;
        if (resumen.onProgreso) resumen.onProgreso({ hecho: resumen.hecho, total: resumen.total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, items.length) }, trabajador));
  }

  // Upsert idempotente de los eventos de la ventana [hoy, hoy + ventanaDias). Pide el consentimiento si hace falta.
  // -> {creados, actualizados, borrados, iguales, errores[], abortado}
  async function sincronizar({ ventanaDias = 90, alarmaMin = 0, onProgreso } = {}) {
    const p = puedeSincronizar();
    if (!p.ok) { const e = new Error('sync-no-disponible'); e.code = p.motivo; throw e; }
    const desde = hoy();
    const rango = { desde, hasta: D.addDias(desde, ventanaDias - 1) };
    const deseados = eventosPropios(rango).map((ev) => ({
      id: ev.id, fecha: ev.fecha, cuerpo: D.aEventoGoogle(ev, { zona: zona(), alarmaMin, clubId: clubId(), etq: etq() }),
    }));
    const est = leerEstado();
    const c = api();
    if (!Object.keys(est.items).length) { // mapa perdido (otro navegador, caché borrada): adoptar lo ya creado
      (await c.listarGestionados({ clubId: clubId() })).forEach((x) => { est.items[x.cnlId] = { gid: x.gid, huella: '', fecha: x.fecha }; });
    }
    const diff = D.diffSync(deseados, est.items, desde);
    const resumen = { creados: 0, actualizados: 0, borrados: 0, iguales: diff.iguales, errores: [], abortado: '', hecho: 0, total: diff.crear.length + diff.actualizar.length + diff.borrar.length, onProgreso };
    const crear = async (it) => {
      const r = await c.insertar(it.cuerpo);
      est.items[it.id] = { gid: r.id, huella: it.huella, fecha: it.fecha };
      resumen.creados++;
    };
    try {
      await ejecutar(diff.crear, crear, resumen);
      await ejecutar(diff.actualizar, async (it) => {
        try { await c.actualizar(it.gid, it.cuerpo); est.items[it.id] = { gid: it.gid, huella: it.huella, fecha: it.fecha }; resumen.actualizados++; }
        catch (e) { if (e.code !== 'no-existe') throw e; await crear(it); } // lo borraron a mano en Google: se recrea
      }, resumen);
      await ejecutar(diff.borrar, async (it) => { await c.borrar(it.gid); delete est.items[it.id]; resumen.borrados++; }, resumen);
    } finally {
      est.ultima = { ts: ahora().toISOString(), creados: resumen.creados, actualizados: resumen.actualizados, borrados: resumen.borrados, errores: resumen.errores.length };
      guardarEstado(est);
    }
    delete resumen.onProgreso;
    return resumen;
  }

  // Elimina de Google Calendar todos los eventos creados por la app para este club y olvida el mapa.
  async function dejarDeSincronizar({ onProgreso } = {}) {
    const p = puedeSincronizar();
    if (!p.ok) { const e = new Error('sync-no-disponible'); e.code = p.motivo; throw e; }
    const est = leerEstado();
    const c = api();
    const porGid = new Map(Object.entries(est.items).map(([id, m]) => [m.gid, { id, gid: m.gid }]));
    (await c.listarGestionados({ clubId: clubId() })).forEach((x) => { if (!porGid.has(x.gid)) porGid.set(x.gid, { id: x.cnlId, gid: x.gid }); });
    const lista = [...porGid.values()];
    const resumen = { borrados: 0, errores: [], abortado: '', hecho: 0, total: lista.length, onProgreso };
    const restantes = { ...est.items };
    await ejecutar(lista, async (it) => { await c.borrar(it.gid); delete restantes[it.id]; resumen.borrados++; }, resumen);
    guardarEstado({ items: resumen.errores.length ? restantes : {}, ultima: null });
    delete resumen.onProgreso;
    return resumen;
  }

  return {
    datos, usuario, ambito, gruposVisibles, eventos, eventosPropios, zona, guardarZona, nombreClub, nombreCalendario,
    exportar, puedeSincronizar, estadoSync, sincronizar, dejarDeSincronizar, hoy,
    grupos: () => store.list('Grupos'),
    piscinas: () => store.list('Piscinas'),
    nadadores: () => store.list('Nadadores'),
    setNadadorDemo: (id) => { nadadorDemo = id || ''; },
    getNadadorDemo: () => nadadorDemo,
  };
}
