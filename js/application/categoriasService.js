// Application service for categories: orchestrates the domain (js/domain/categorias.js) with persistence.
// It receives the repository as a parameter (list/upsert + club/setClub, e.g. the store) and the clock: it does not import the store,
// the DOM or fetch, so it is tested with an in-memory repository.
//
// Club configuration keys it uses:
//  - temporadaActual   '' (automatic: the one of today's date) or '2026-2027' (set by the user)
//  - temporadaAplicada last season for which the categories were recalculated
//  - categoriasConfig  JSON with {edadMinimaMaster, edades:{F:{...}, M:{...}}}; empty = defaults
import * as D from '../domain/categorias.js';
import { fechaDeDate } from '../domain/calendario.js';

export const HOJA_NADADORES = 'Nadadores';

export function crearCategoriasService(repo, { ahora } = {}) {
  const club = () => (repo.club && typeof repo.club === 'object' ? repo.club : {});
  const guardarClub = (cambios) => { repo.setClub({ ...club(), ...cambios }); };
  const nombre = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();

  const svc = {
    hoy: () => fechaDeDate(ahora()),
    // Season of today's date (start year)
    temporadaHoy: () => D.temporadaDe(svc.hoy()),
    // Current season: the one set in the configuration or, if none, today's.
    temporadaActual() {
      const fijada = D.parseTemporada(club().temporadaActual);
      return fijada === null ? svc.temporadaHoy() : fijada;
    },
    esAutomatica: () => D.parseTemporada(club().temporadaActual) === null,
    etiqueta: (t = svc.temporadaActual()) => D.etiquetaTemporada(t),
    temporadaAplicada: () => D.parseTemporada(club().temporadaAplicada),

    // ----- Configuration -----
    config: () => D.normalizarConfig(club().categoriasConfig),
    // -> {ok, errores?}. Saves the age table per sex and the minimum master age and recalculates the categories.
    guardarConfig(cfg) {
      const errores = D.validarConfig(cfg);
      if (errores.length) return { ok: false, errores };
      const limpia = D.normalizarConfig(cfg);
      guardarClub({ categoriasConfig: JSON.stringify(limpia) });
      return { ok: true, resumen: svc.recalcular() };
    },
    restablecerConfig() {
      guardarClub({ categoriasConfig: '' });
      return svc.recalcular();
    },

    // ----- Consultas -----
    tabla: (temporada = svc.temporadaActual(), sexo = 'F') => D.tablaCategorias(temporada, { sexo, config: svc.config() }),
    // Current category of a swimmer (manual if set) in the current season
    vigente: (n, temporada = svc.temporadaActual()) => D.categoriaVigente(n, temporada, svc.config()),
    // Live preview of the form: {categoria, manual, origen, avisos, rango:{desde,hasta,...}|null, temporada}
    previsualizar(datos, temporada = svc.temporadaActual()) {
      const v = svc.vigente(datos || {}, temporada);
      const calc = D.categoriaDe(datos || {}, temporada, svc.config());
      const rango = calc.categoria ? D.rangoAnios(calc.categoria, temporada, { sexo: calc.sexo, config: svc.config() }) : null;
      return { ...v, rango, temporada, calculadaRango: rango };
    },

    // ----- Escritura -----
    // Swimmer row with `categoria` materialised according to the rules (without saving it). Without a valid date or manual category
    // the category it already had is kept.
    conCategoria(fila, temporada = svc.temporadaActual()) {
      const v = svc.vigente(fila, temporada);
      return { ...fila, categoria: v.categoria || (v.origen === 'sin-fecha' || v.origen === 'sin-sexo' ? (fila.categoria || '') : '') };
    },
    // Creates or edits a swimmer (category included). -> saved row
    guardarNadador(fila) {
      return repo.upsert(HOJA_NADADORES, svc.conCategoria(fila));
    },
    // Recalculates the materialised category of swimmers that do NOT have a manual category.
    // -> {temporada, etiqueta, total, cambios:[{id, nombre, de, a}], manuales, sinFecha}
    recalcular(temporada = svc.temporadaActual()) {
      const cfg = svc.config();
      const cambios = [];
      let manuales = 0, sinFecha = 0;
      const todos = repo.list(HOJA_NADADORES);
      todos.forEach((n) => {
        const v = D.categoriaVigente(n, temporada, cfg);
        if (v.manual) {
          manuales++;
          if (n.categoria !== v.categoria) repo.upsert(HOJA_NADADORES, { ...n, categoria: v.categoria });
          return;
        }
        if (!v.categoria) { sinFecha++; return; }
        if (n.categoria !== v.categoria) {
          cambios.push({ id: n.id, nombre: nombre(n), de: n.categoria || '', a: v.categoria });
          repo.upsert(HOJA_NADADORES, { ...n, categoria: v.categoria });
        }
      });
      guardarClub({ temporadaAplicada: D.etiquetaTemporada(temporada) });
      return { temporada, etiqueta: D.etiquetaTemporada(temporada), total: todos.length, cambios, manuales, sinFecha };
    },
    // When the club is opened: if the current season is not the last applied one, recalculates. -> summary | null
    alAbrirClub() {
      const t = svc.temporadaActual();
      if (t === null) return null;
      return svc.temporadaAplicada() === t ? null : svc.recalcular(t);
    },

    // ----- Season change -----
    // Preview: who changes category when going from the current season to `destino`.
    previsualizarCambio(destino) {
      const a = D.parseTemporada(destino);
      if (a === null) return [];
      return D.cambiosDeTemporada(repo.list(HOJA_NADADORES), svc.temporadaActual(), a, svc.config());
    },
    // destino: year/label of the new season or ''/null to go back to the automatic one (according to today's date).
    // If the destination equals today's season it becomes automatic. -> summary of the recalculation
    cambiarTemporada(destino) {
      const a = D.parseTemporada(destino);
      guardarClub({ temporadaActual: a === null || a === svc.temporadaHoy() ? '' : D.etiquetaTemporada(a) });
      return svc.recalcular();
    },
  };
  return svc;
}
