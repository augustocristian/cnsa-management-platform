// Esquema de las hojas del club: pestañas del Excel exportable (fila 1 = cabeceras exactas) y secciones de cnl/<Club>.json.
import { CATALOGO_PREDEFINIDO } from './domain/cargas.js';

export const SHEETS = {
  Club: ['clave', 'valor'], // nombre, lema, logo(dataURL), colorPrimario, colorSecundario
  Nadadores: ['id', 'nombre', 'apellidos', 'fechaNacimiento', 'sexo', 'categoria', 'grupoId', 'email', 'telefono', 'tutor', 'licencia', 'notas', 'activo', 'licenciaMaster', 'categoriaManual'], // categoria = categoría vigente materializada (se calcula por año de nacimiento, sexo y temporada: domain/categorias.js); categoriaManual (texto) manda sobre el cálculo; licenciaMaster = 'true'|'false'
  Grupos: ['id', 'nombre', 'categoria', 'entrenador'],
  Entrenamientos: ['id', 'fecha', 'hora', 'duracionMin', 'grupoId', 'titulo', 'descripcion', 'estado', 'piscina', 'volumenMin', 'volumenMax', 'enfoque', 'tipoSesion', 'materialDia', 'notasGenerales'],
  EntrenoLineas: ['id', 'entrenamientoId', 'set', 'orden', 'tiempoMin', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'material', 'notas', 'componentes', 'estilo'], // plan detallado de la sesión: filas agrupadas por set; componentes = JSON [{contenido, metrosPorRep, modo, pct?}] (reparto de la distancia por repetición entre contenidos); estilo = nombre o JSON [{estilo, metrosPorRep}]
  Asistencia: ['id', 'entrenamientoId', 'nadadorId', 'estado', 'nota'],
  Cargas: ['id', 'entrenamientoId', 'nadadorId', 'fecha', 'metros', 'rpe', 'minutos', 'tipo', 'notas'],
  Marcas: ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas', 'banadorId'], // banadorId = bañador usado al lograr la marca (opcional; referencia blanda a Banadores, sin cascada)
  Comunicaciones: ['id', 'fecha', 'titulo', 'texto', 'grupoId', 'autor'],
  ObjetivosCarga: ['id', 'tipo', 'minSemanalM', 'maxSemanalM'], // LEGADO: se migra a TiposCarga.minSemanalM/maxSemanalM al abrir el club
  TiposCarga: ['id', 'nombre', 'descripcion', 'color', 'categoria', 'orden', 'activo', 'predefinido', 'minSemanalM', 'maxSemanalM', 'alias'], // contenidos de entrenamiento; alias = abreviaturas separadas por comas (AeL, Tope...); categoria = intensidad|especifico|personalizado
  Banadores: ['id', 'tipo', 'marca', 'modelo', 'activo', 'notas'], // catálogo del club (no son datos personales): tipo = entrenamiento|competicion (competicion = bañador técnico / fast-skin); activo = 'true'|'false'
  Piscinas: ['id', 'nombre', 'longitudM', 'numCalles', 'intervaloMin', 'maxPorCalle', 'horario'], // horario = JSON por día {"1":{"abre":"07:00","cierra":"22:00"},...,"7":null}
  AsignacionesCalle: ['id', 'piscinaId', 'dia', 'fecha', 'horaInicio', 'horaFin', 'calleDesde', 'calleHasta', 'grupoId', 'entrenadorId', 'notas'], // dia 1=lunes..7=domingo; fecha (opcional) = excepción puntual
  Temporadas: ['id', 'nombre', 'fechaInicio', 'fechaFin', 'activa', 'grupoId', 'notas'], // planificación de temporada; una activa
  Fases: ['id', 'temporadaId', 'nombre', 'tipo', 'fechaInicio', 'fechaFin', 'objetivo', 'color', 'orden'], // fases (macrociclos)
  SemanasPlan: ['id', 'temporadaId', 'lunes', 'volumenPrevisto', 'contenidos', 'intensidad', 'objetivo', 'notas'], // semanas (microciclos) editadas; contenidos = JSON {tipoId: metros}
  EventosTemporada: ['id', 'temporadaId', 'tipo', 'nombre', 'fechaInicio', 'fechaFin', 'lugar', 'prioridad', 'pruebas', 'categoria', 'grupoId', 'notas'], // competiciones, concentraciones, tests, descansos...
};

// Hojas que ya no existen: si un fichero antiguo las trae se descartan al leerlo y no se vuelven a escribir.
// Banador = antiguo seguimiento de entrega de bañador por nadador (datos personales; sustituido por el catálogo Banadores).
export const HOJAS_RETIRADAS = ['Banador'];

// Hojas de entidad (todas salvo Club, que es clave/valor).
export const ENTITY_SHEETS = Object.keys(SHEETS).filter((s) => s !== 'Club');

export const CATEGORIAS = ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Master'];
export const ESTADOS_ENTRENAMIENTO = ['planificado', 'realizado'];
export const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'justificado'];
// Nombres de los contenidos predefinidos (derivado del catálogo; los contenidos reales viven en la hoja TiposCarga).
export const TIPOS_CARGA = CATALOGO_PREDEFINIDO.map((c) => c.nombre);
export const PISCINAS = ['25', '50'];

// Unique id: UUID v4 (crypto.randomUUID) so two devices/tabs never generate the same one; without crypto, time + randomness.
export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
