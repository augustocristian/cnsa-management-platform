// Application service for training loads: orchestrates the domain and persistence.
// The repository (list/get/upsert/remove, e.g. the store) is injected: it does not import the store, DOM or network,
// so it is tested with an in-memory repository.
import * as D from '../domain/cargas.js';
import { renombrarEnComponentes } from '../domain/desglose.js';

export const HOJA_TIPOS = 'TiposCarga';
export const HOJA_CARGAS = 'Cargas';
export const HOJA_OBJETIVOS = 'ObjetivosCarga';

// `generarId` is injected (the composition root or the view owns the randomness); it is only needed when the catalogue
// migration has to create contents (asegurarCatalogo).
const sinGenerador = () => { throw new Error('cargasService: generarId is required to create contents'); };

export function crearCargasService(repo, { generarId = sinGenerador } = {}) {
  const err = (campo, codigo) => ({ ok: false, errores: [{ campo, codigo }] });
  const tipos = () => D.ordenarTipos(repo.list(HOJA_TIPOS).map(D.normalizarTipo));
  const cargasDe = (tipo) => {
    const k = D.normalizarNombre(tipo.nombre);
    return repo.list(HOJA_CARGAS).filter((c) => D.normalizarNombre(c.tipo) === k);
  };

  // Training plans (EntrenoLineas.componentes) store the NAME of the content: when renaming or merging they are updated.
  const renombrarEnPlanes = (de, a) => repo.list('EntrenoLineas').forEach((l) => {
    const nuevo = renombrarEnComponentes(l.componentes, de, a);
    if (nuevo != null) repo.upsert('EntrenoLineas', { ...l, componentes: nuevo });
  });

  const svc = {
    tipos,
    activos: () => D.filtrarActivos(tipos()),
    grupos: () => D.agruparPorCategoria(tipos()),
    tipo(id) { const r = repo.get(HOJA_TIPOS, id); return r ? D.normalizarTipo(r) : null; },
    resolver: (valor) => D.resolverTipo(valor, tipos()),
    usos: (id) => { const t = svc.tipo(id); return t ? cargasDe(t).length : 0; },
    // Map content id -> number of loads recorded with it.
    conteoUsos() {
      const cuenta = new Map();
      repo.list(HOJA_CARGAS).forEach((c) => { const k = D.normalizarNombre(c.tipo); cuenta.set(k, (cuenta.get(k) || 0) + 1); });
      return new Map(tipos().map((t) => [t.id, cuenta.get(D.normalizarNombre(t.nombre)) || 0]));
    },

    // Seeds the missing predefined catalogue and migrates legacy data. Idempotent. -> number of rows touched.
    asegurarCatalogo() {
      const plan = D.prepararCatalogo({ tipos: tipos(), cargas: repo.list(HOJA_CARGAS), objetivos: repo.list(HOJA_OBJETIVOS), generarId });
      plan.crear.concat(plan.actualizar).forEach((t) => repo.upsert(HOJA_TIPOS, D.filaTipo(t)));
      plan.eliminarObjetivos.forEach((id) => repo.remove(HOJA_OBJETIVOS, id));
      return plan.crear.length + plan.actualizar.length + plan.eliminarObjetivos.length;
    },

    // ----- Content management -----
    // data: {nombre, descripcion, color, min, max} -> {ok, tipo} | {ok:false, errores}
    crear(data) {
      const existentes = tipos();
      const errores = D.validarTipo(data, existentes);
      if (errores.length) return { ok: false, errores };
      const fila = D.filaTipo({
        id: generarId(), nombre: String(data.nombre).trim(), descripcion: String(data.descripcion ?? '').trim(),
        color: D.colorValido(data.color) ? data.color : D.siguienteColor(existentes), categoria: 'personalizado',
        orden: D.siguienteOrden(existentes), activo: true, predefinido: false,
        min: Number(data.min) > 0 ? Number(data.min) : null, max: Number(data.max) > 0 ? Number(data.max) : null,
        alias: D.parseAlias(data.alias),
      });
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, fila)) };
    },

    // Edits a content. Predefined: only description, colour and goals (the name is kept).
    // Renaming a custom one updates the loads that use it.
    editar(id, data) {
      const actual = svc.tipo(id);
      if (!actual) return err('id', 'no-existe');
      const nuevo = { ...actual, nombre: actual.predefinido ? actual.nombre : String(data.nombre ?? actual.nombre).trim() };
      const propuesta = {
        nombre: nuevo.nombre, descripcion: data.descripcion ?? actual.descripcion, color: data.color ?? actual.color,
        min: 'min' in data ? data.min : actual.min, max: 'max' in data ? data.max : actual.max,
        alias: 'alias' in data ? data.alias : actual.alias,
      };
      const errores = D.validarTipo(propuesta, tipos(), { id });
      if (errores.length) return { ok: false, errores };
      nuevo.descripcion = String(propuesta.descripcion ?? '').trim();
      nuevo.color = D.colorValido(propuesta.color) ? propuesta.color.toLowerCase() : actual.color;
      nuevo.min = Number(propuesta.min) > 0 ? Number(propuesta.min) : null;
      nuevo.max = Number(propuesta.max) > 0 ? Number(propuesta.max) : null;
      nuevo.alias = D.parseAlias(propuesta.alias);
      if (!actual.predefinido && nuevo.nombre !== actual.nombre) {
        cargasDe(actual).forEach((c) => repo.upsert(HOJA_CARGAS, { ...c, tipo: nuevo.nombre }));
        renombrarEnPlanes(actual.nombre, nuevo.nombre);
      }
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, D.filaTipo(nuevo))) };
    },

    guardarObjetivo: (id, min, max) => {
      const a = svc.tipo(id);
      return a ? svc.editar(id, { min, max }) : err('id', 'no-existe');
    },

    activar(id, activo) {
      const t = svc.tipo(id);
      if (!t) return err('id', 'no-existe');
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, D.filaTipo({ ...t, activo: !!activo }))) };
    },

    // Moves a content `delta` positions (-1 up, +1 down) within its category. -> {ok, movido}
    mover(id, delta) {
      const t = svc.tipo(id);
      if (!t) return err('id', 'no-existe');
      const lista = tipos().filter((x) => x.categoria === t.categoria);
      const i = lista.findIndex((x) => x.id === id), j = i + delta;
      if (j < 0 || j >= lista.length) return { ok: true, movido: false };
      const ordenes = lista.map((x) => x.orden).sort((a, b) => a - b);
      lista.splice(j, 0, lista.splice(i, 1)[0]);
      const distintos = new Set(ordenes).size === ordenes.length;
      lista.forEach((x, k) => {
        const orden = distintos ? ordenes[k] : ordenes[0] + k;
        if (orden !== x.orden) repo.upsert(HOJA_TIPOS, D.filaTipo({ ...x, orden }));
      });
      return { ok: true, movido: true };
    },

    // Deletes a custom content without loads. Predefined and in-use ones: no. -> {ok} | {ok:false, motivo, usos?}
    borrar(id) {
      const t = svc.tipo(id);
      if (!t) return { ok: false, motivo: 'no-existe' };
      if (t.predefinido) return { ok: false, motivo: 'predefinido' };
      const usos = cargasDe(t).length;
      if (usos) return { ok: false, motivo: 'en-uso', usos };
      repo.remove(HOJA_TIPOS, id);
      return { ok: true };
    },

    // Reassigns the loads of the custom content `origenId` to `destinoId` and deletes the source. -> {ok, reasignadas}
    fusionar(origenId, destinoId) {
      const o = svc.tipo(origenId), d = svc.tipo(destinoId);
      if (!o || !d) return { ok: false, motivo: 'no-existe' };
      if (o.id === d.id) return { ok: false, motivo: 'mismo' };
      if (o.predefinido) return { ok: false, motivo: 'predefinido' };
      const afectadas = cargasDe(o);
      afectadas.forEach((c) => repo.upsert(HOJA_CARGAS, { ...c, tipo: d.nombre }));
      renombrarEnPlanes(o.nombre, d.nombre);
      repo.remove(HOJA_TIPOS, o.id);
      return { ok: true, reasignadas: afectadas.length };
    },

    // ----- Cargas -----
    // data: {nadadorId, fecha, tipoId | tipo (nombre), metros, rpe, minutos, notas, entrenamientoId}
    // -> {ok, carga} | {ok:false, errores:[{campo, codigo}]}
    registrarCarga(data) {
      const tipo = data.tipoId ? svc.tipo(data.tipoId) : svc.resolver(data.tipo);
      const errores = D.validarCarga(data, {
        nadadorExiste: (id) => !!repo.get('Nadadores', id), tipo, sesionExiste: (id) => !!repo.get('Entrenamientos', id),
      });
      if (errores.length) return { ok: false, errores };
      const rpe = data.rpe === '' || data.rpe == null ? '' : Number(data.rpe);
      const minutos = data.minutos === '' || data.minutos == null ? '' : Number(data.minutos);
      const carga = repo.upsert(HOJA_CARGAS, {
        nadadorId: String(data.nadadorId), fecha: data.fecha, tipo: tipo.nombre, metros: Number(data.metros), rpe, minutos,
        notas: String(data.notas ?? '').trim(), entrenamientoId: data.entrenamientoId ? String(data.entrenamientoId) : '',
      });
      return { ok: true, carga };
    },
    // Deletes a load and returns the removed row so the caller can offer "Undo" (restaurarCarga).
    eliminarCarga(id) {
      const fila = repo.get(HOJA_CARGAS, id);
      repo.remove(HOJA_CARGAS, id);
      return fila;
    },
    restaurarCarga(fila) { return fila ? repo.upsert(HOJA_CARGAS, fila) : null; },

    // Saves the weekly targets of several contents at once. All or nothing: nothing is saved if one row is invalid.
    // entradas: [{ id, min, max }] -> { ok, guardados } | { ok: false, errores: [{ id, campo, codigo }] }
    guardarObjetivos(entradas) {
      const { errores, cambios } = D.validarObjetivos(entradas, tipos());
      if (errores.length) return { ok: false, errores };
      cambios.forEach((c) => svc.editar(c.id, { min: c.min, max: c.max }));
      return { ok: true, guardados: cambios.length };
    },

    // ----- Consultas -----
    // Sessions to link a load to: the most recent first.
    sesiones: () => repo.list('Entrenamientos').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.hora).localeCompare(String(a.hora))),
    cargas: () => repo.list(HOJA_CARGAS),
    // Week (Monday as 'YYYY-MM-DD' or a Date) -> {desde, hasta, agregado, evaluacion}. Empty nadadorId = average per swimmer.
    semana(lunes, nadadorId = '') {
      const { desde, hasta } = typeof lunes === 'string' ? D.semanaDe(lunes) : D.rangoSemana(lunes);
      const t = tipos();
      const agregado = D.agregarSemana({ cargas: repo.list(HOJA_CARGAS), tipos: t, desde, hasta, nadadorId });
      return { desde, hasta, tipos: t, agregado, evaluacion: D.evaluarSemana(agregado, t) };
    },
  };
  return svc;
}
