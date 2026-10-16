// Pure rules about training groups (no DOM, no storage).
import { esActivo } from './nadadores.js';
import { ordenCategoria } from './categorias.js';
import { claveBusqueda } from './nombres.js';

const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'es');
const porApellidos = (a, b) => cmp(a.apellidos, b.apellidos) || cmp(a.nombre, b.nombre);

// Groups by category order (youngest first), then by name. Returns a new array.
export function ordenarGrupos(grupos) {
  return [...grupos].sort((a, b) => ordenCategoria(a.categoria) - ordenCategoria(b.categoria) || cmp(a.nombre, b.nombre));
}

// Active members of a group, ordered by surname then name.
export function miembrosActivos(nadadores, grupoId) {
  return nadadores.filter((n) => n.grupoId === grupoId && esActivo(n)).sort(porApellidos);
}

// Everybody assigned to the group, active or not (what a deletion affects).
export const asignados = (nadadores, grupoId) => nadadores.filter((n) => n.grupoId === grupoId);

// Active swimmers without a group, or whose group no longer exists.
export function sinGrupo(nadadores, grupos) {
  const ids = new Set(grupos.map((g) => g.id));
  return nadadores.filter((n) => esActivo(n) && (!n.grupoId || !ids.has(n.grupoId))).sort(porApellidos);
}

// Another group already uses this name (ignoring case, accents and the group being edited)?
export function nombreDuplicado(grupos, nombre, idPropio = '') {
  const n = claveBusqueda(nombre);
  return !!n && grupos.some((g) => g.id !== idPropio && claveBusqueda(g.nombre) === n);
}

// -> [{campo, codigo}]. Codes: nombre-obligatorio, nombre-duplicado.
export function validarGrupo(fila, grupos = []) {
  if (!String(fila.nombre || '').trim()) return [{ campo: 'nombre', codigo: 'nombre-obligatorio' }];
  if (nombreDuplicado(grupos, fila.nombre, fila.id)) return [{ campo: 'nombre', codigo: 'nombre-duplicado' }];
  return [];
}

// The category badge is redundant when the group is named after its category ("Alevín" in category Alevín).
export function categoriaVisible(grupo) {
  const c = String(grupo.categoria || '').trim();
  return c && claveBusqueda(c) !== claveBusqueda(grupo.nombre) ? c : '';
}
