// Schema of the club sheets: tabs of the exportable Excel (row 1 = exact headers) and sections of cnl/<Club>.json.
import { CATALOGO_PREDEFINIDO } from './domain/cargas.js';

export const SHEETS = {
  Club: ['clave', 'valor'], // nombre, lema, logo(dataURL), colorPrimario, colorSecundario
  Nadadores: ['id', 'nombre', 'apellidos', 'fechaNacimiento', 'sexo', 'categoria', 'grupoId', 'email', 'telefono', 'tutor', 'licencia', 'notas', 'activo', 'licenciaMaster', 'categoriaManual'], // categoria = current materialised category (computed from year of birth, sex and season: domain/categorias.js); categoriaManual (text) wins over the calculation; licenciaMaster = 'true'|'false'
  Grupos: ['id', 'nombre', 'categoria', 'entrenador'],
  Entrenamientos: ['id', 'fecha', 'hora', 'duracionMin', 'grupoId', 'titulo', 'descripcion', 'estado', 'piscina', 'volumenMin', 'volumenMax', 'enfoque', 'tipoSesion', 'materialDia', 'notasGenerales'],
  EntrenoLineas: ['id', 'entrenamientoId', 'set', 'orden', 'tiempoMin', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'material', 'notas', 'componentes', 'estilo'], // detailed plan of the session: rows grouped by set; componentes = JSON [{contenido, metrosPorRep, modo, pct?}] (split of the per-repetition distance among contents); estilo = name or JSON [{estilo, metrosPorRep}]
  Asistencia: ['id', 'entrenamientoId', 'nadadorId', 'estado', 'nota'],
  Cargas: ['id', 'entrenamientoId', 'nadadorId', 'fecha', 'metros', 'rpe', 'minutos', 'tipo', 'notas'],
  Marcas: ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas', 'banadorId'], // banadorId = swimsuit used when the mark was achieved (optional; soft reference to Banadores, no cascade)
  Comunicaciones: ['id', 'fecha', 'titulo', 'texto', 'grupoId', 'autor'],
  ObjetivosCarga: ['id', 'tipo', 'minSemanalM', 'maxSemanalM'], // LEGACY: migrated to TiposCarga.minSemanalM/maxSemanalM when the club is opened
  TiposCarga: ['id', 'nombre', 'descripcion', 'color', 'categoria', 'orden', 'activo', 'predefinido', 'minSemanalM', 'maxSemanalM', 'alias'], // training contents; alias = comma-separated abbreviations (AeL, Tope...); categoria = intensidad|especifico|personalizado
  Banadores: ['id', 'tipo', 'marca', 'modelo', 'activo', 'notas'], // club catalogue (not personal data): tipo = entrenamiento|competicion (competicion = tech suit / fast skin); activo = 'true'|'false'
  Piscinas: ['id', 'nombre', 'longitudM', 'numCalles', 'intervaloMin', 'maxPorCalle', 'horario'], // horario = JSON per day {"1":{"abre":"07:00","cierra":"22:00"},...,"7":null}
  AsignacionesCalle: ['id', 'piscinaId', 'dia', 'fecha', 'horaInicio', 'horaFin', 'calleDesde', 'calleHasta', 'grupoId', 'entrenadorId', 'notas'], // dia 1=Monday..7=Sunday; fecha (optional) = one-off exception
  Temporadas: ['id', 'nombre', 'fechaInicio', 'fechaFin', 'activa', 'grupoId', 'notas'], // season planning; one active
  Fases: ['id', 'temporadaId', 'nombre', 'tipo', 'fechaInicio', 'fechaFin', 'objetivo', 'color', 'orden'], // fases (macrociclos)
  SemanasPlan: ['id', 'temporadaId', 'lunes', 'volumenPrevisto', 'contenidos', 'intensidad', 'objetivo', 'notas'], // semanas (microciclos) editadas; contenidos = JSON {tipoId: metros}
  EventosTemporada: ['id', 'temporadaId', 'tipo', 'nombre', 'fechaInicio', 'fechaFin', 'lugar', 'prioridad', 'pruebas', 'categoria', 'grupoId', 'notas'], // competiciones, concentraciones, tests, descansos...
};

// Sheets that no longer exist: if an old file contains them they are dropped when read and are not written again.
// Banador = old per-swimmer swimsuit delivery tracking (personal data; replaced by the Banadores catalogue).
export const HOJAS_RETIRADAS = ['Banador'];

// Entity sheets (all except Club, which is key/value).
export const ENTITY_SHEETS = Object.keys(SHEETS).filter((s) => s !== 'Club');

export const CATEGORIAS = ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Master'];
export const ESTADOS_ENTRENAMIENTO = ['planificado', 'realizado'];
export const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'justificado'];
// Names of the predefined contents (derived from the catalogue; the real contents live in the TiposCarga sheet).
export const TIPOS_CARGA = CATALOGO_PREDEFINIDO.map((c) => c.nombre);
export const PISCINAS = ['25', '50'];

// Unique id: UUID v4 (crypto.randomUUID) so two devices/tabs never generate the same one; without crypto, time + randomness.
export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
