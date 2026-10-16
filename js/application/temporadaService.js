// Servicio de aplicación de la Planificación de temporada: orquesta el dominio (js/domain/temporada.js) y la persistencia.
// Recibe el repositorio por parámetro (cualquier objeto con list/get/upsert/remove, p. ej. el store): no importa el store,
// ni el DOM, ni fetch, así que se puede probar con un repositorio en memoria.
import * as D from '../domain/temporada.js';
import { fechaDeDate } from '../domain/calendario.js';
import { normalizarTipo } from '../domain/cargas.js';
import { totales as totalesSesion } from '../domain/entreno.js';

export const HOJA_TEMPORADAS = 'Temporadas';
export const HOJA_FASES = 'Fases';
export const HOJA_SEMANAS = 'SemanasPlan';
export const HOJA_EVENTOS = 'EventosTemporada';

// opciones: {ahora: () => Date, nombreFase: (tipo) => string (para las fases por defecto)}
export function crearTemporadaService(repo, { ahora = () => new Date(), nombreFase = (t) => t } = {}) {
  const hoy = () => fechaDeDate(ahora());
  const tipos = () => repo.list('TiposCarga').map(normalizarTipo);
  const enTemporada = (hoja, tid) => repo.list(hoja).filter((r) => r.temporadaId === String(tid));

  const svc = {
    hoy,
    tipos,
    grupos: () => repo.list('Grupos'),

    // ----- Temporadas -----
    temporadas: () => repo.list(HOJA_TEMPORADAS).map(D.normalizarTemporada).sort((a, b) => (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : 0)),
    temporada: (id) => { const r = repo.get(HOJA_TEMPORADAS, id); return r ? D.normalizarTemporada(r) : null; },
    activa() {
      const todas = svc.temporadas();
      return todas.find((t) => t.activa) || todas[0] || null;
    },
    // conFases: crea las fases por defecto (general, específica, competitiva, tapering y transición) repartidas en semanas completas.
    // -> {ok, errores?, temporada?}
    guardarTemporada(data, { conFases = false } = {}) {
      const errores = D.validarTemporada(data);
      if (errores.length) return { ok: false, errores };
      const otras = svc.temporadas().filter((t) => t.id !== String(data.id || ''));
      const activa = !!data.activa || !otras.some((t) => t.activa);
      const guardada = repo.upsert(HOJA_TEMPORADAS, D.filaTemporada({ ...data, activa }));
      if (activa) otras.filter((t) => t.activa).forEach((t) => repo.upsert(HOJA_TEMPORADAS, D.filaTemporada({ ...t, activa: false })));
      const temporada = D.normalizarTemporada(guardada);
      if (conFases && !data.id) {
        D.fasesPorDefecto(temporada.inicio, temporada.fin, nombreFase).forEach((f) => repo.upsert(HOJA_FASES, D.filaFase({ ...f, temporadaId: temporada.id })));
      }
      return { ok: true, temporada };
    },
    activar(id) {
      svc.temporadas().forEach((t) => { if (t.activa !== (t.id === String(id))) repo.upsert(HOJA_TEMPORADAS, D.filaTemporada({ ...t, activa: t.id === String(id) })); });
    },
    borrarTemporada(id) {
      [HOJA_FASES, HOJA_SEMANAS, HOJA_EVENTOS].forEach((h) => enTemporada(h, id).forEach((r) => repo.remove(h, r.id)));
      repo.remove(HOJA_TEMPORADAS, id);
      if (!svc.temporadas().some((t) => t.activa) && svc.temporadas()[0]) svc.activar(svc.temporadas()[0].id);
    },

    // ----- Fases -----
    fases: (tid) => D.ordenarFases(enTemporada(HOJA_FASES, tid).map(D.normalizarFase)),
    // -> {ok, errores?, requiereForzar?, conflictos?, avisos?, fase?}. Las fases solapadas necesitan forzar.
    guardarFase(data, { forzar = false } = {}) {
      const errores = D.validarFase(data);
      if (errores.length) return { ok: false, errores };
      const cand = D.normalizarFase({ ...data, fechaInicio: data.inicio, fechaFin: data.fin });
      const solapan = D.fasesQueSolapan(cand, svc.fases(data.temporadaId));
      if (solapan.length && !forzar) return { ok: false, requiereForzar: true, conflictos: solapan.map((f) => ({ tipo: 'fases-solapadas', fase: f.nombre })) };
      const t = svc.temporada(data.temporadaId);
      const avisos = t && (cand.inicio < t.inicio || cand.fin > t.fin) ? [{ tipo: 'fase-fuera-temporada' }] : [];
      const fases = svc.fases(data.temporadaId);
      const orden = data.orden == null || data.orden === '' ? (data.id ? undefined : fases.length + 1) : data.orden;
      const fase = repo.upsert(HOJA_FASES, D.filaFase({ ...cand, orden: orden ?? cand.orden }));
      return { ok: true, fase: D.normalizarFase(fase), avisos };
    },
    borrarFase(id) { repo.remove(HOJA_FASES, id); },

    // ----- Eventos -----
    eventos: (tid) => enTemporada(HOJA_EVENTOS, tid).map(D.normalizarEvento).sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0)),
    evento: (id) => { const r = repo.get(HOJA_EVENTOS, id); return r ? D.normalizarEvento(r) : null; },
    // -> {ok, errores?, avisos?, evento?}; un evento fuera de la temporada se guarda pero avisa.
    guardarEvento(data) {
      const errores = D.validarEvento(data);
      if (errores.length) return { ok: false, errores };
      const cand = D.normalizarEvento({ ...data, fechaInicio: data.inicio, fechaFin: data.fin || data.inicio });
      const t = svc.temporada(data.temporadaId);
      const evento = D.normalizarEvento(repo.upsert(HOJA_EVENTOS, D.filaEvento(cand)));
      return { ok: true, evento, avisos: D.eventoFuera(cand, t) ? [{ tipo: 'evento-fuera-temporada' }] : [] };
    },
    borrarEvento(id) { repo.remove(HOJA_EVENTOS, id); },

    // ----- Semanas -----
    semanasPlan: (tid) => enTemporada(HOJA_SEMANAS, tid).map(D.normalizarSemanaPlan),
    // cambios: {volumen, contenidos, intensidad, objetivo, notas} (parcial; se fusiona con lo guardado). Sin contenido útil borra la fila.
    // -> {ok, errores?}
    guardarSemana(tid, lunes, cambios) {
      const previo = svc.semanasPlan(tid).find((s) => s.lunes === lunes) || { temporadaId: String(tid), lunes, volumen: null, contenidos: {}, intensidad: null, objetivo: '', notas: '' };
      const mezcla = { ...previo, ...cambios };
      const errores = D.validarSemanaPlan(mezcla);
      if (errores.length) return { ok: false, errores };
      const s = D.normalizarSemanaPlan({ ...mezcla, volumenPrevisto: mezcla.volumen, temporadaId: tid, lunes });
      const id = D.idSemanaPlan(tid, lunes);
      if (D.semanaPlanVacia(s)) { repo.remove(HOJA_SEMANAS, id); return { ok: true, vacia: true }; }
      repo.upsert(HOJA_SEMANAS, D.filaSemanaPlan({ ...s, id, temporadaId: String(tid), lunes }));
      return { ok: true };
    },
    // Varias semanas de golpe (herramientas). cambios: [{lunes, volumen, contenidos, intensidad?}]
    guardarSemanas(tid, cambios) {
      cambios.forEach((c) => { const { lunes, ...resto } = c; svc.guardarSemana(tid, lunes, resto); });
      return cambios.length;
    },

    // ----- Resumen -----
    // Modelo completo para la vista: semanas con previsto/real, totales, validaciones y sugerencias.
    resumen(tid, { fuente = 'auto', tolerancia = D.TOLERANCIA } = {}) {
      const temporada = svc.temporada(tid);
      if (!temporada) return null;
      const fases = svc.fases(tid), eventos = svc.eventos(tid), tp = tipos();
      const h = hoy();
      const semanas = D.resumenSemanas({
        temporada, fases, semanasPlan: svc.semanasPlan(tid), eventos, tipos: tp, sesiones: repo.list('Entrenamientos'), lineas: repo.list('EntrenoLineas'),
        cargas: repo.list('Cargas'), nadadores: repo.list('Nadadores'), hoy: h, fuente, tolerancia,
      });
      const actual = semanas.find((s) => s.tiempo === 'actual');
      return {
        temporada, fases, eventos, tipos: tp, semanas, hoy: h, tolerancia, fuente,
        semanaActual: actual ? actual.n : 0, totales: D.totales(semanas, fases, tolerancia),
        validaciones: D.validarPlan({ temporada, fases, eventos }), sugerencias: D.sugerencias({ semanas, tipos: tp, hoy: h, tolerancia }),
        proxima: D.proximaCompeticion(eventos, h),
      };
    },

    // Entrenos (sesiones) de la semana: [{id, fecha, hora, titulo, grupoId, grupoNombre, estado, metros, minutos}]
    entrenosDeSemana(tid, lunes) {
      const t = svc.temporada(tid);
      if (!t) return [];
      const dom = D.addDias(lunes, 6);
      const grupos = repo.list('Grupos');
      return repo.list('Entrenamientos').filter((e) => String(e.fecha).slice(0, 10) >= lunes && String(e.fecha).slice(0, 10) <= dom && (!t.grupoId || e.grupoId === t.grupoId))
        .sort((a, b) => (String(a.fecha) + String(a.hora)).localeCompare(String(b.fecha) + String(b.hora)))
        .map((e) => {
          const lineas = repo.list('EntrenoLineas').filter((l) => l.entrenamientoId === e.id);
          const tot = totalesSesion(lineas);
          const g = grupos.find((x) => x.id === e.grupoId);
          return {
            id: e.id, fecha: String(e.fecha).slice(0, 10), hora: e.hora, titulo: e.titulo, grupoId: e.grupoId, grupoNombre: g ? g.nombre : '', estado: e.estado,
            metros: tot.metros || Math.round((Number(e.volumenMin) + Number(e.volumenMax)) / 2) || 0, conPlan: tot.filas > 0, minutos: tot.tiempoMin,
          };
        });
    },

    // ----- Herramientas -----
    // Copia el plan (volumen, reparto, intensidad, objetivo y notas) de una semana n a otra.
    copiarSemana(tid, nOrigen, nDestino, opciones) {
      const m = svc.resumen(tid, opciones);
      const o = m && m.semanas.find((s) => s.n === nOrigen), d = m && m.semanas.find((s) => s.n === nDestino);
      if (!o || !d || o.n === d.n) return { ok: false };
      return svc.guardarSemana(tid, d.lunes, D.copiarPlanSemana(o.plan));
    },
    // Plantilla de fase aplicada a todas sus semanas. -> {ok, cambios} ; volumenBase opcional (si no, se sugiere)
    plantillaFase(tid, faseId, { volumenBase, tipo, aplicar = true } = {}) {
      const m = svc.resumen(tid);
      const fase = m && m.fases.find((f) => f.id === String(faseId));
      if (!fase) return { ok: false, cambios: [] };
      const ns = m.semanas.filter((s) => s.fase && s.fase.id === fase.id).map((s) => s.n);
      if (!ns.length) return { ok: false, cambios: [] };
      const base = volumenBase > 0 ? Number(volumenBase) : D.volumenBaseSugerido(m.semanas, ns[0], ns[ns.length - 1]);
      const cambios = D.aplicarPlantillaFase(m.semanas, { nIni: ns[0], nFin: ns[ns.length - 1], tipo: tipo || fase.tipo, volumenBase: base, tipos: m.tipos });
      if (aplicar) { svc.guardarSemanas(String(tid), cambios); }
      return { ok: true, cambios, volumenBase: base };
    },
    // Escala (± %) o mueve (k semanas) el volumen previsto de las semanas [desde, hasta]. aplicar=false = sólo previsualiza.
    ajustarVolumen(tid, { desde, hasta, pct = 0, mover = 0, aplicar = false }) {
      const m = svc.resumen(tid);
      if (!m) return { ok: false, cambios: [] };
      const cambios = mover ? D.desplazarPlan(m.semanas, { desde, hasta, k: mover }) : D.ajustarVolumenes(m.semanas, { desde, hasta, pct });
      const filas = cambios.map((c) => ({ ...c, volumen: c.despues, lunes: c.lunes })).filter((c) => c.antes !== c.despues);
      if (aplicar) { svc.guardarSemanas(String(tid), filas.map((c) => ({ lunes: c.lunes, volumen: c.despues, contenidos: c.contenidos, ...(mover ? { intensidad: c.intensidad } : {}) }))); }
      return { ok: true, cambios: filas };
    },
    aplicarSugerencia(tid, sugerencia) {
      const m = svc.resumen(tid);
      const r = m && sugerencia.accion ? D.aplicarAccion(m.semanas, sugerencia.accion) : null;
      if (!r) return { ok: false };
      return svc.guardarSemana(String(tid), r.lunes, { volumen: r.volumen, contenidos: r.contenidos });
    },
  };
  return svc;
}
