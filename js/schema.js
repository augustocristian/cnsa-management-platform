// Esquema de hojas del Excel (fila 1 = cabeceras exactas).
export const SHEETS = {
  Club: ['clave', 'valor'], // nombre, lema, logo(dataURL), colorPrimario, colorSecundario
  Usuarios: ['id', 'email', 'nombre', 'rol', 'nadadorId'],
  Nadadores: ['id', 'nombre', 'apellidos', 'fechaNacimiento', 'sexo', 'categoria', 'grupoId', 'email', 'telefono', 'tutor', 'licencia', 'notas', 'activo'],
  Grupos: ['id', 'nombre', 'categoria', 'entrenador'],
  Entrenamientos: ['id', 'fecha', 'hora', 'duracionMin', 'grupoId', 'titulo', 'descripcion', 'estado', 'piscina', 'volumenMin', 'volumenMax', 'enfoque'],
  Asistencia: ['id', 'entrenamientoId', 'nadadorId', 'estado', 'nota'],
  Cargas: ['id', 'entrenamientoId', 'nadadorId', 'fecha', 'metros', 'rpe', 'minutos', 'tipo', 'notas'],
  Marcas: ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas'],
  Comunicaciones: ['id', 'fecha', 'titulo', 'texto', 'grupoId', 'autor'],
  ObjetivosCarga: ['id', 'tipo', 'minSemanalM', 'maxSemanalM'],
  Banador: ['id', 'nadadorId', 'talla', 'estado', 'fecha', 'notas'],
};

// Hojas de entidad (todas salvo Club, que es clave/valor).
export const ENTITY_SHEETS = Object.keys(SHEETS).filter((s) => s !== 'Club');

export const CATEGORIAS = ['Prebenjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Máster'];
export const ROLES = ['admin', 'entrenador', 'nadador'];
export const ESTADOS_ENTRENAMIENTO = ['planificado', 'realizado'];
export const ESTADOS_ASISTENCIA = ['presente', 'ausente', 'justificado'];
export const TIPOS_CARGA = ['Aeróbico', 'Velocidad', 'Piernas', 'Técnica', 'Fuerza'];
export const ESTADOS_BANADOR = ['pendiente', 'entregado'];
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL'];
export const PISCINAS = ['25', '50'];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
