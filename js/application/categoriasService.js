// Servicio de aplicación de las categorías: orquesta el dominio (js/domain/categorias.js) con la persistencia.
// Recibe el repositorio por parámetro (list/upsert + club/setClub, p. ej. el store) y el reloj: no importa el store,
// ni el DOM, ni fetch, así que se prueba con un repositorio en memoria.
//
// Claves de la configuración del club que usa:
//  - temporadaActual   '' (automática: la de la fecha de hoy) o '2026-2027' (fijada por el usuario)
//  - temporadaAplicada última temporada para la que se recalcularon las categorías
//  - categoriasConfig  JSON con {edadMinimaMaster, edades:{F:{...}, M:{...}}}; vacío = valores por defecto
import * as D from '../domain/categorias.js';
import { fechaDeDate } from '../domain/calendario.js';

export const HOJA_NADADORES = 'Nadadores';

export function crearCategoriasService(repo, { ahora = () => new Date() } = {}) {
  const club = () => (repo.club && typeof repo.club === 'object' ? repo.club : {});
  const guardarClub = (cambios) => { repo.setClub({ ...club(), ...cambios }); };
  const nombre = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();

  const svc = {
    hoy: () => fechaDeDate(ahora()),
    // Temporada de la fecha de hoy (año de inicio)
    temporadaHoy: () => D.temporadaDe(svc.hoy()),
    // Temporada vigente: la fijada en la configuración o, si no hay, la de hoy.
    temporadaActual() {
      const fijada = D.parseTemporada(club().temporadaActual);
      return fijada === null ? svc.temporadaHoy() : fijada;
    },
    esAutomatica: () => D.parseTemporada(club().temporadaActual) === null,
    etiqueta: (t = svc.temporadaActual()) => D.etiquetaTemporada(t),
    temporadaAplicada: () => D.parseTemporada(club().temporadaAplicada),

    // ----- Configuración -----
    config: () => D.normalizarConfig(club().categoriasConfig),
    // -> {ok, errores?}. Guarda la tabla de edades por sexo y la edad mínima máster y recalcula las categorías.
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
    // Categoría vigente de un nadador (manual si la tiene) en la temporada actual
    vigente: (n, temporada = svc.temporadaActual()) => D.categoriaVigente(n, temporada, svc.config()),
    // Vista previa en vivo del formulario: {categoria, manual, origen, avisos, rango:{desde,hasta,...}|null, temporada}
    previsualizar(datos, temporada = svc.temporadaActual()) {
      const v = svc.vigente(datos || {}, temporada);
      const calc = D.categoriaDe(datos || {}, temporada, svc.config());
      const rango = calc.categoria ? D.rangoAnios(calc.categoria, temporada, { sexo: calc.sexo, config: svc.config() }) : null;
      return { ...v, rango, temporada, calculadaRango: rango };
    },

    // ----- Escritura -----
    // Fila de nadador con `categoria` materializada según las reglas (sin guardarla). Sin fecha válida ni categoría manual
    // se conserva la categoría que tuviera.
    conCategoria(fila, temporada = svc.temporadaActual()) {
      const v = svc.vigente(fila, temporada);
      return { ...fila, categoria: v.categoria || (v.origen === 'sin-fecha' || v.origen === 'sin-sexo' ? (fila.categoria || '') : '') };
    },
    // Crea o edita un nadador (categoría incluida). -> fila guardada
    guardarNadador(fila) {
      return repo.upsert(HOJA_NADADORES, svc.conCategoria(fila));
    },
    // Recalcula la categoría materializada de los nadadores que NO tienen categoría manual.
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
    // Al abrir el club: si la temporada vigente no es la última aplicada, recalcula. -> resumen | null
    alAbrirClub() {
      const t = svc.temporadaActual();
      if (t === null) return null;
      return svc.temporadaAplicada() === t ? null : svc.recalcular(t);
    },

    // ----- Cambio de temporada -----
    // Vista previa: quién cambia de categoría al pasar de la temporada actual a `destino`.
    previsualizarCambio(destino) {
      const a = D.parseTemporada(destino);
      if (a === null) return [];
      return D.cambiosDeTemporada(repo.list(HOJA_NADADORES), svc.temporadaActual(), a, svc.config());
    },
    // destino: año/etiqueta de la nueva temporada o ''/null para volver a la automática (según la fecha de hoy).
    // Si el destino coincide con la temporada de hoy queda como automática. -> resumen del recalculado
    cambiarTemporada(destino) {
      const a = D.parseTemporada(destino);
      guardarClub({ temporadaActual: a === null || a === svc.temporadaHoy() ? '' : D.etiquetaTemporada(a) });
      return svc.recalcular();
    },
  };
  return svc;
}
