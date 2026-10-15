// Esquema de las hojas del club: pestañas del Excel exportable (fila 1 = cabeceras exactas) y secciones de cnl/<Club>.json.
import { CATALOGO_PREDEFINIDO } from './domain/cargas.js';

export const SHEETS = {
  Club: ['clave', 'valor'], // nombre, lema, logo(dataURL), colorPrimario, colorSecundario
  Nadadores: ['id', 'nombre', 'apellidos', 'fechaNacimiento', 'sexo', 'categoria', 'grupoId', 'email', 'telefono', 'tutor', 'licencia', 'notas', 'activo'],
  Grupos: ['id', 'nombre', 'categoria', 'entrenador'],
  Entrenamientos: ['id', 'fecha', 'hora', 'duracionMin', 'grupoId', 'titulo', 'descripcion', 'estado', 'piscina', 'volumenMin', 'volumenMax', 'enfoque', 'tipoSesion', 'materialDia', 'notasGenerales'],
  EntrenoLineas: ['id', 'entrenamientoId', 'set', 'orden', 'tiempoMin', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'material', 'notas'], // plan detallado de la sesión: filas agrupadas por set
  Asistencia: ['id', 'entrenamientoId', 'nadadorId', 'estado', 'nota'],
  Cargas: ['id', 'entrenamientoId', 'nadadorId', 'fecha', 'metros', 'rpe', 'minutos', 'tipo', 'notas'],
  Marcas: ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas'],
  Comunicaciones: ['id', 'fecha', 'titulo', 'texto', 'grupoId', 'autor'],
  ObjetivosCarga: ['id', 'tipo', 'minSemanalM', 'maxSemanalM'], // LEGADO: se migra a TiposCarga.minSemanalM/maxSemanalM al abrir el club
  TiposCarga: ['id', 'nombre', 'descripcion', 'color', 'categoria', 'orden', 'activo', 'predefinido', 'minSemanalM', 'maxSemanalM'], // contenidos de entrenamiento; categoria = intensidad|especifico|personalizado
  Banador: ['id', 'nadadorId', 'talla', 'estado', 'fecha', 'notas'],
  Piscinas: ['id', 'nombre', 'longitudM', 'numCalles', 'intervaloMin', 'maxPorCalle', 'horario'], // horario = JSON por día {"1":{"abre":"07:00","cierra":"22:00"},...,"7":null}
  AsignacionesCalle: ['id', 'piscinaId', 'dia', 'fecha', 'horaInicio', 'horaFin', 'calleDesde', 'calleHasta', 'grupoId', 'entrenadorId', 'notas'], // dia 1=lunes..7=domingo; fecha (opcional) = excepción puntual
};

// Hojas de entidad (todas salvo Club, que es clave/valor).
export const ENTITY_SHEETS = Object.keys(SHEETS).filter((s) => s !== 'Club');

export const CATEGORIAS = ['Prebenjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Máster'];
export const ESTADOS_ENTRENAMIENTO = ['planificado', 'realizado'];
export const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'justificado'];
// Nombres de los contenidos predefinidos (derivado del catálogo; los contenidos reales viven en la hoja TiposCarga).
export const TIPOS_CARGA = CATALOGO_PREDEFINIDO.map((c) => c.nombre);
export const ESTADOS_BANADOR = ['pendiente', 'entregado'];
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];
export const PISCINAS = ['25', '50'];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
