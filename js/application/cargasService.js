// Servicio de aplicación de las cargas de entrenamiento: orquesta el dominio y la persistencia.
// El repositorio (list/get/upsert/remove, p. ej. el store) se inyecta: no importa store, DOM ni red,
// así que se prueba con un repositorio en memoria.
import * as D from '../domain/cargas.js';

export const HOJA_TIPOS = 'TiposCarga';
export const HOJA_CARGAS = 'Cargas';
export const HOJA_OBJETIVOS = 'ObjetivosCarga';

const idPorDefecto = () => D.PREFIJO_ID + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// puedeEditar: () => boolean (p. ej. el rol no es nadador). Las escrituras lanzan 'sin-permiso' si es false.
export function crearCargasService(repo, { puedeEditar = () => true, generarId = idPorDefecto } = {}) {
  const exigir = () => {
    if (!puedeEditar()) { const e = new Error('sin-permiso'); e.code = 'sin-permiso'; throw e; }
  };
  const err = (campo, codigo) => ({ ok: false, errores: [{ campo, codigo }] });
  const tipos = () => D.ordenarTipos(repo.list(HOJA_TIPOS).map(D.normalizarTipo));
  const cargasDe = (tipo) => {
    const k = D.normalizarNombre(tipo.nombre);
    return repo.list(HOJA_CARGAS).filter((c) => D.normalizarNombre(c.tipo) === k);
  };

  const svc = {
    puedeEditar: () => !!puedeEditar(),
    tipos,
    activos: () => D.filtrarActivos(tipos()),
    grupos: () => D.agruparPorCategoria(tipos()),
    tipo(id) { const r = repo.get(HOJA_TIPOS, id); return r ? D.normalizarTipo(r) : null; },
    resolver: (valor) => D.resolverTipo(valor, tipos()),
    usos: (id) => { const t = svc.tipo(id); return t ? cargasDe(t).length : 0; },
    // Mapa id de contenido -> nº de cargas registradas con él.
    conteoUsos() {
      const cuenta = new Map();
      repo.list(HOJA_CARGAS).forEach((c) => { const k = D.normalizarNombre(c.tipo); cuenta.set(k, (cuenta.get(k) || 0) + 1); });
      return new Map(tipos().map((t) => [t.id, cuenta.get(D.normalizarNombre(t.nombre)) || 0]));
    },

    // Siembra el catálogo predefinido que falte y migra datos antiguos. Idempotente. -> nº de filas tocadas.
    asegurarCatalogo() {
      const plan = D.prepararCatalogo({ tipos: tipos(), cargas: repo.list(HOJA_CARGAS), objetivos: repo.list(HOJA_OBJETIVOS), generarId });
      plan.crear.concat(plan.actualizar).forEach((t) => repo.upsert(HOJA_TIPOS, D.filaTipo(t)));
      plan.eliminarObjetivos.forEach((id) => repo.remove(HOJA_OBJETIVOS, id));
      return plan.crear.length + plan.actualizar.length + plan.eliminarObjetivos.length;
    },

    // ----- Gestión de contenidos -----
    // data: {nombre, descripcion, color, min, max} -> {ok, tipo} | {ok:false, errores}
    crear(data) {
      exigir();
      const existentes = tipos();
      const errores = D.validarTipo(data, existentes);
      if (errores.length) return { ok: false, errores };
      const fila = D.filaTipo({
        id: generarId(), nombre: String(data.nombre).trim(), descripcion: String(data.descripcion ?? '').trim(),
        color: D.colorValido(data.color) ? data.color : D.siguienteColor(existentes), categoria: 'personalizado',
        orden: D.siguienteOrden(existentes), activo: true, predefinido: false,
        min: Number(data.min) > 0 ? Number(data.min) : null, max: Number(data.max) > 0 ? Number(data.max) : null,
      });
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, fila)) };
    },

    // Edita un contenido. Predefinido: sólo descripción, color y objetivos (el nombre se conserva).
    // Renombrar uno personalizado actualiza las cargas que lo usan.
    editar(id, data) {
      exigir();
      const actual = svc.tipo(id);
      if (!actual) return err('id', 'no-existe');
      const nuevo = { ...actual, nombre: actual.predefinido ? actual.nombre : String(data.nombre ?? actual.nombre).trim() };
      const propuesta = {
        nombre: nuevo.nombre, descripcion: data.descripcion ?? actual.descripcion, color: data.color ?? actual.color,
        min: 'min' in data ? data.min : actual.min, max: 'max' in data ? data.max : actual.max,
      };
      const errores = D.validarTipo(propuesta, tipos(), { id });
      if (errores.length) return { ok: false, errores };
      nuevo.descripcion = String(propuesta.descripcion ?? '').trim();
      nuevo.color = D.colorValido(propuesta.color) ? propuesta.color.toLowerCase() : actual.color;
      nuevo.min = Number(propuesta.min) > 0 ? Number(propuesta.min) : null;
      nuevo.max = Number(propuesta.max) > 0 ? Number(propuesta.max) : null;
      if (!actual.predefinido && nuevo.nombre !== actual.nombre) {
        cargasDe(actual).forEach((c) => repo.upsert(HOJA_CARGAS, { ...c, tipo: nuevo.nombre }));
      }
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, D.filaTipo(nuevo))) };
    },

    guardarObjetivo: (id, min, max) => {
      const a = svc.tipo(id);
      return a ? svc.editar(id, { min, max }) : err('id', 'no-existe');
    },

    activar(id, activo) {
      exigir();
      const t = svc.tipo(id);
      if (!t) return err('id', 'no-existe');
      return { ok: true, tipo: D.normalizarTipo(repo.upsert(HOJA_TIPOS, D.filaTipo({ ...t, activo: !!activo }))) };
    },

    // Mueve un contenido `delta` posiciones (-1 arriba, +1 abajo) dentro de su categoría. -> {ok, movido}
    mover(id, delta) {
      exigir();
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

    // Borra un contenido personalizado sin cargas. Predefinidos y en uso: no. -> {ok} | {ok:false, motivo, usos?}
    borrar(id) {
      exigir();
      const t = svc.tipo(id);
      if (!t) return { ok: false, motivo: 'no-existe' };
      if (t.predefinido) return { ok: false, motivo: 'predefinido' };
      const usos = cargasDe(t).length;
      if (usos) return { ok: false, motivo: 'en-uso', usos };
      repo.remove(HOJA_TIPOS, id);
      return { ok: true };
    },

    // Reasigna las cargas del contenido personalizado `origenId` a `destinoId` y borra el origen. -> {ok, reasignadas}
    fusionar(origenId, destinoId) {
      exigir();
      const o = svc.tipo(origenId), d = svc.tipo(destinoId);
      if (!o || !d) return { ok: false, motivo: 'no-existe' };
      if (o.id === d.id) return { ok: false, motivo: 'mismo' };
      if (o.predefinido) return { ok: false, motivo: 'predefinido' };
      const afectadas = cargasDe(o);
      afectadas.forEach((c) => repo.upsert(HOJA_CARGAS, { ...c, tipo: d.nombre }));
      repo.remove(HOJA_TIPOS, o.id);
      return { ok: true, reasignadas: afectadas.length };
    },

    // ----- Cargas -----
    // data: {nadadorId, fecha, tipoId | tipo (nombre), metros, rpe, minutos, notas, entrenamientoId}
    // -> {ok, carga} | {ok:false, errores:[{campo, codigo}]}
    registrarCarga(data) {
      exigir();
      const errores = [];
      const metros = Number(data.metros);
      if (!data.nadadorId || !repo.get('Nadadores', data.nadadorId)) errores.push({ campo: 'nadadorId', codigo: 'nadador' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.fecha ?? ''))) errores.push({ campo: 'fecha', codigo: 'fecha' });
      if (!(metros > 0)) errores.push({ campo: 'metros', codigo: 'metros' });
      const rpe = data.rpe === '' || data.rpe == null ? '' : Number(data.rpe);
      if (rpe !== '' && !(rpe >= 1 && rpe <= 10)) errores.push({ campo: 'rpe', codigo: 'rpe' });
      const minutos = data.minutos === '' || data.minutos == null ? '' : Number(data.minutos);
      if (minutos !== '' && !(minutos > 0)) errores.push({ campo: 'minutos', codigo: 'minutos' });
      const tipo = data.tipoId ? svc.tipo(data.tipoId) : svc.resolver(data.tipo);
      if (!tipo) errores.push({ campo: 'tipo', codigo: 'tipo-inexistente' });
      else if (!tipo.activo) errores.push({ campo: 'tipo', codigo: 'tipo-inactivo' });
      const sesion = data.entrenamientoId ? String(data.entrenamientoId) : '';
      if (sesion && !repo.get('Entrenamientos', sesion)) errores.push({ campo: 'entrenamientoId', codigo: 'sesion-inexistente' });
      if (errores.length) return { ok: false, errores };
      const carga = repo.upsert(HOJA_CARGAS, {
        nadadorId: String(data.nadadorId), fecha: data.fecha, tipo: tipo.nombre, metros, rpe, minutos,
        notas: String(data.notas ?? '').trim(), entrenamientoId: sesion,
      });
      return { ok: true, carga };
    },
    eliminarCarga(id) { exigir(); repo.remove(HOJA_CARGAS, id); },

    // ----- Consultas -----
    // Sesiones para vincular una carga: las más recientes primero.
    sesiones: () => repo.list('Entrenamientos').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.hora).localeCompare(String(a.hora))),
    cargas: () => repo.list(HOJA_CARGAS),
    // Semana (lunes) -> {desde, hasta, agregado, evaluacion}. nadadorId vacío = media por nadador.
    semana(lunes, nadadorId = '') {
      const { desde, hasta } = D.rangoSemana(lunes);
      const t = tipos();
      const agregado = D.agregarSemana({ cargas: repo.list(HOJA_CARGAS), tipos: t, desde, hasta, nadadorId });
      return { desde, hasta, tipos: t, agregado, evaluacion: D.evaluarSemana(agregado, t) };
    },
  };
  return svc;
}
