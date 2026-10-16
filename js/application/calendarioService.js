// Orquestación del calendario: une el dominio puro (js/domain/calendario.js), el store y el cliente de Google Calendar.
// Todo se recibe por parámetro (store, auth, almacenamiento, cliente, reloj, etiquetas) para poder probarlo sin DOM ni red.
import * as D from '../domain/calendario.js';
import { FUENTE_CALENDARIO } from '../domain/temporada.js';
import { crearClienteGoogleCalendar } from '../infrastructure/googleCalendar.js';
import { CALENDAR_SCOPE } from '../config.js';
import { preferencias, CLAVES } from '../preferencias.js';

const HOJAS = ['Entrenamientos', 'Grupos', 'AsignacionesCalle', 'Piscinas', 'Nadadores', 'EventosTemporada'];
D.registrarFuente(FUENTE_CALENDARIO); // eventos de la Planificación de temporada (competiciones, tests...)
const CONCURRENCIA = 3;
const FATALES = new Set(['auth', 'permisos', 'api-desactivada', 'limite']);

// El mapa de sincronización con Google Calendar es una preferencia del usuario: vive en cnl/preferencias.json
// (localStorage sólo es su caché). Los tests inyectan su propio almacenamiento.
function almacenamientoPorDefecto() { return preferencias.comoAlmacenamiento(CLAVES.calSync); }

// opciones: {store, auth, storage?, cliente?, calendarScope?, ahora?: () => Date, etq?: () => etiquetas, fetch?, sleep?}
export function crearCalendarioService({ store, auth, storage, cliente, ahora = () => new Date(), etq = () => D.ETQ_DEFECTO, fetch: fetchFn, sleep, calendarScope = CALENDAR_SCOPE } = {}) {
  const ls = storage === undefined ? almacenamientoPorDefecto() : storage;
  let clienteCache = cliente || null;

  const datos = () => Object.fromEntries(HOJAS.map((h) => [h, store.list(h)]));
  const hoy = () => D.fechaDeDate(ahora());
  const clubRef = () => store.clubRef || {};
  const clubId = () => clubRef().id || '';
  const nombreClub = () => (store.club && String(store.club.nombre || '').trim()) || clubRef().name || 'Club';

  // Conjunto de grupos visibles según el filtro de pantalla. null = todos. filtros: {grupoId, piscina}
  function gruposVisibles(filtros = {}) {
    return filtros.grupoId ? [filtros.grupoId] : null;
  }

  function eventos(rango, filtros = {}) {
    const todos = D.eventosEnRango(datos(), rango, { etq: etq() });
    return D.filtrarEventos(todos, { grupoIds: gruposVisibles(filtros), piscina: filtros.piscina || '' });
  }

  // Los eventos para sincronizar: todos los del club, sin filtros de pantalla (para que el resultado sea estable).
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

  // -> {ok, motivo: 'sin-sesion'|null}
  function puedeSincronizar() {
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

  // DETERMINISTIC Google event id (base32hex: 0-9 a-v) derived from the club and the event: if the local map is lost halfway through a
  // sync, retrying does not duplicate (Google answers 409 and the existing event is updated).
  function gidDe(id) {
    const s = clubId() + ':' + id;
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 0x01000193); b = Math.imul(b + s.charCodeAt(i), 0x85ebca6b) ^ (b >>> 13); }
    return 'cnl' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
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
      const gid = gidDe(it.id);
      let r;
      try { r = await c.insertar({ ...it.cuerpo, id: gid }); } catch (e) {
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
      await ejecutar(diff.actualizar, async (it) => {
        try { await c.actualizar(it.gid, it.cuerpo); est.items[it.id] = { gid: it.gid, huella: it.huella, fecha: it.fecha }; resumen.actualizados++; guardarEstado(est); }
        catch (e) { if (e.code !== 'no-existe') throw e; await crear(it); } // lo borraron a mano en Google: se recrea
      }, resumen);
      await ejecutar(diff.borrar, async (it) => { await c.borrar(it.gid); delete est.items[it.id]; resumen.borrados++; guardarEstado(est); }, resumen);
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
    datos, gruposVisibles, eventos, eventosPropios, zona, guardarZona, nombreClub, nombreCalendario,
    exportar, puedeSincronizar, estadoSync, sincronizar, dejarDeSincronizar, hoy,
    grupos: () => store.list('Grupos'),
    piscinas: () => store.list('Piscinas'),
  };
}
