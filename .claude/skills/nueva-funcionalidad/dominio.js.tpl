// Domain of <module>: PURE logic (no DOM, network, storage, i18n or clock; dates always arrive as parameters).
// Messages are returned as codes + params; the presentation translates them with t('<prefix>.c.<code>').

export const HOJA = '<Hoja>'; // sheet name in js/domain/schema.js
export const ESTADOS = ['activo', 'cerrado']; // stored values: neutral, in Spanish

const texto = (v) => String(v ?? '').trim();
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

// Stored row (all text) -> normalised object
export function normalizar(fila = {}) {
  return {
    id: texto(fila.id),
    nombre: texto(fila.nombre),
    fecha: esFecha(fila.fecha) ? String(fila.fecha) : '',
    estado: ESTADOS.includes(texto(fila.estado)) ? texto(fila.estado) : ESTADOS[0],
    notas: texto(fila.notas),
  };
}

// Normalised object -> row to store (columns from js/domain/schema.js, all text)
export function aFila(x) {
  const n = normalizar(x);
  return { id: n.id, nombre: n.nombre, fecha: n.fecha, estado: n.estado, notas: n.notas };
}

// Errors block saving; warnings do not (the view asks for confirmation)
export function validar(x, { existentes = [] } = {}) {
  const n = normalizar(x);
  const errores = [];
  const avisos = [];
  if (!n.nombre) errores.push({ codigo: 'nombre-vacio' });
  if (!n.fecha) errores.push({ codigo: 'fecha-invalida' });
  if (existentes.some((o) => o.id !== n.id && texto(o.nombre).toLowerCase() === n.nombre.toLowerCase())) {
    avisos.push({ codigo: 'nombre-repetido', params: { nombre: n.nombre } });
  }
  return { errores, avisos };
}
