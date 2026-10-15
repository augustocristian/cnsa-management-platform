// Servicio de aplicación del plan de entreno: orquesta el dominio y la persistencia.
// Recibe el repositorio por parámetro (cualquier objeto con list/get/upsert/remove, p. ej. el store):
// no importa el store, ni el DOM ni fetch, así que se puede probar con un repositorio en memoria.
import * as D from '../domain/entreno.js';

export const HOJA_SESIONES = 'Entrenamientos';
export const HOJA_LINEAS = 'EntrenoLineas';

const dia10 = (f) => String(f ?? '').slice(0, 10);
const COLUMNAS_LINEA = ['id', 'entrenamientoId', 'set', 'orden', 'tiempoMin', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'material', 'notas'];

// opciones: puedeEditar() -> boolean; genId() -> string único; club() -> {nombre, lema, logo, colorPrimario, colorSecundario}
export function crearEntrenoService(repo, { puedeEditar = () => true, genId = defaultGenId, club = () => ({}) } = {}) {
  const exigir = () => {
    if (!puedeEditar()) { const e = new Error('sin-permiso'); e.code = 'sin-permiso'; throw e; }
  };
  const lineasDe = (id) => D.renumerar(repo.list(HOJA_LINEAS).filter((l) => String(l.entrenamientoId) === String(id)));
  const grupoNombre = (id) => { const g = id ? repo.get('Grupos', id) : null; return g ? g.nombre : ''; };
  const piscinaTexto = (s) => (s.piscina ? `${s.piscina} m` : '');

  const svc = {
    puedeEditar: () => !!puedeEditar(),
    sesion: (id) => repo.get(HOJA_SESIONES, id),
    lineas: lineasDe,
    tienePlan: (id) => repo.list(HOJA_LINEAS).some((l) => String(l.entrenamientoId) === String(id)),
    resumen: (id) => D.resumen(lineasDe(id)),

    // Valida un borrador (lineas) de la sesión `id` con la carga registrada y los objetivos de la sesión.
    validar(id, lineas, sesion = null) {
      const s = sesion || repo.get(HOJA_SESIONES, id) || {};
      return D.validarSesion({ sesion: s, lineas, cargaMedia: D.cargaRegistrada(repo.list('Cargas'), id) });
    },

    // Guarda el plan de la sesión: campos nuevos de la sesión + líneas (sustituye las anteriores).
    // -> { ok, avisos, errores? }. Los errores (números no válidos) impiden guardar; los avisos no.
    guardarPlan(id, { tipoSesion = '', materialDia = '', notasGenerales = '', lineas = [] } = {}) {
      exigir();
      const sesion = repo.get(HOJA_SESIONES, id);
      if (!sesion) return { ok: false, errores: [{ severidad: 'error', codigo: 'sesion-inexistente' }], avisos: [] };
      const limpias = D.renumerar(lineas.filter((l) => !D.filaVacia(D.normalizarLinea(l))));
      const avisos = D.validarSesion({ sesion, lineas: limpias, cargaMedia: D.cargaRegistrada(repo.list('Cargas'), id) });
      if (D.hayErrores(avisos)) return { ok: false, errores: avisos.filter((a) => a.severidad === 'error'), avisos };
      repo.upsert(HOJA_SESIONES, { ...sesion, tipoSesion, materialDia, notasGenerales });
      const previas = repo.list(HOJA_LINEAS).filter((l) => String(l.entrenamientoId) === String(id));
      const conservar = new Set();
      limpias.forEach((l) => {
        const fila = filaLinea({ ...l, entrenamientoId: String(id), id: l.id || genId() });
        conservar.add(fila.id);
        repo.upsert(HOJA_LINEAS, fila);
      });
      previas.forEach((l) => { if (!conservar.has(l.id)) repo.remove(HOJA_LINEAS, l.id); });
      return { ok: true, avisos, lineas: lineasDe(id) };
    },

    // Elimina la sesión y su plan.
    eliminarSesion(id) {
      exigir();
      repo.list(HOJA_LINEAS).filter((l) => String(l.entrenamientoId) === String(id)).forEach((l) => repo.remove(HOJA_LINEAS, l.id));
      repo.remove(HOJA_SESIONES, id);
    },

    // Duplica la sesión (y su plan) con `cambios` (fecha, hora, grupoId, titulo...). -> sesión nueva
    duplicarSesion(id, cambios = {}) {
      exigir();
      const origen = repo.get(HOJA_SESIONES, id);
      if (!origen) return null;
      const d = D.duplicarSesion(origen, lineasDe(id), cambios);
      const nueva = repo.upsert(HOJA_SESIONES, d.sesion);
      d.lineas.forEach((l) => repo.upsert(HOJA_LINEAS, filaLinea({ ...l, id: genId(), entrenamientoId: nueva.id })));
      return nueva;
    },

    // Copia el plan (campos y líneas) de una sesión en otra ya existente, sustituyendo el que tuviera.
    copiarPlan(origenId, destinoId) {
      exigir();
      const p = svc.planDesdeSesion(origenId);
      if (!p) return { ok: false };
      return svc.guardarPlan(destinoId, p);
    },

    // Líneas de otra sesión o de una plantilla listas para cargar en el editor (sin ids). -> { lineas, tipoSesion, materialDia, notasGenerales }
    planDesdeSesion(origenId) {
      const s = repo.get(HOJA_SESIONES, origenId);
      if (!s) return null;
      return { ...D.camposPlan(s), lineas: D.clonarLineas(lineasDe(origenId)) };
    },
    planDesdePlantilla(plantillaId) {
      const p = D.plantilla(plantillaId);
      return p ? { tipoSesion: p.tipoSesion, materialDia: p.materialDia, notasGenerales: '', lineas: D.lineasDePlantilla(plantillaId) } : null;
    },
    plantillas: () => D.PLANTILLAS.map((p) => ({ id: p.id, tipoSesion: p.tipoSesion, resumen: D.resumen(p.lineas) })),
    // Sesiones con plan (para "copiar desde otra sesión"), las más recientes primero; excluye `salvo`.
    sesionesConPlan({ salvo = '', limite = 30 } = {}) {
      const con = new Set(repo.list(HOJA_LINEAS).map((l) => String(l.entrenamientoId)));
      return repo.list(HOJA_SESIONES).filter((s) => con.has(String(s.id)) && String(s.id) !== String(salvo))
        .sort((a, b) => dia10(b.fecha).localeCompare(dia10(a.fecha)) || String(b.hora).localeCompare(String(a.hora))).slice(0, limite);
    },

    // Valores usados antes en un campo (autocompletar), más frecuentes primero.
    sugerencias: (campo, extra = []) => D.sugerencias(repo.list(HOJA_LINEAS), campo, { extra }),

    // Datos listos para el generador de PDF: { club, sesion, grupo, sets, totales, avisos }
    ficha(id, borrador = null) {
      const s = repo.get(HOJA_SESIONES, id);
      if (!s) return null;
      return fichaDe(s, borrador);
    },
    // Fichas de todas las sesiones de la semana que empieza en `lunes` (YYYY-MM-DD) (opcional: de un grupo).
    fichasSemana(lunes, { grupoId = '' } = {}) {
      const fin = sumar(lunes, 6);
      return repo.list(HOJA_SESIONES)
        .filter((s) => dia10(s.fecha) >= lunes && dia10(s.fecha) <= fin && (!grupoId || s.grupoId === grupoId))
        .sort((a, b) => dia10(a.fecha).localeCompare(dia10(b.fecha)) || D.horaTexto(a.hora).localeCompare(D.horaTexto(b.hora)))
        .map((s) => fichaDe(s));
    },
  };

  function fichaDe(s, borrador = null) {
    const lineas = borrador ? D.renumerar(borrador.lineas || []) : lineasDe(s.id);
    const llenas = lineas.filter((l) => !D.filaVacia(l));
    const sesion = { ...s, ...(borrador ? { tipoSesion: borrador.tipoSesion ?? s.tipoSesion, materialDia: borrador.materialDia ?? s.materialDia, notasGenerales: borrador.notasGenerales ?? s.notasGenerales } : {}) };
    return {
      club: club() || {},
      sesion: {
        id: s.id, fecha: dia10(s.fecha), hora: D.horaTexto(s.hora), titulo: s.titulo || '', descripcion: s.descripcion || '',
        grupo: grupoNombre(s.grupoId), piscina: piscinaTexto(s), duracionMin: s.duracionMin,
        tipoSesion: sesion.tipoSesion || '', materialDia: sesion.materialDia || '', notasGenerales: sesion.notasGenerales || '',
      },
      sets: D.agruparSets(llenas),
      totales: D.totales(llenas),
    };
  }

  return svc;
}

function filaLinea(l) {
  const n = D.normalizarLinea(l);
  const o = {};
  COLUMNAS_LINEA.forEach((c) => { o[c] = n[c] === undefined || Number.isNaN(n[c]) ? '' : n[c]; });
  return o;
}

function sumar(f, n) {
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

let contador = 0;
function defaultGenId() {
  contador++;
  return 'l' + Date.now().toString(36) + contador.toString(36) + Math.random().toString(36).slice(2, 6);
}
