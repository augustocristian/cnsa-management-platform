// Pure helpers about people names and text search (no DOM, no storage, no i18n).

// Search key: no accents, no upper case, single spaces. "  Lucia  FERNANDEZ " -> "lucia fernandez".
export function claveBusqueda(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// True when every word of `consulta` appears in `texto` (accent and case insensitive, any order).
// An empty query matches everything.
export function coincideBusqueda(texto, consulta) {
  const palabras = claveBusqueda(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  const clave = claveBusqueda(texto);
  return palabras.every((p) => clave.includes(p));
}

// "Name Surname" as the coach would say it.
export function nombreCompleto(nadador) {
  if (!nadador) return '';
  return `${nadador.nombre || ''} ${nadador.apellidos || ''}`.trim();
}

// "Surname, Name" for lists sorted by surname.
export function nombreApellidosPrimero(nadador) {
  if (!nadador) return '';
  const ap = String(nadador.apellidos || '').trim();
  const no = String(nadador.nombre || '').trim();
  return ap && no ? `${ap}, ${no}` : ap || no;
}

// Sorts a copy of the swimmers by "Surname, Name" using the given locale (default Spanish).
export function ordenarPorApellidos(nadadores, locale = 'es') {
  const col = new Intl.Collator(locale, { sensitivity: 'base' });
  return nadadores.slice().sort((a, b) => col.compare(nombreApellidosPrimero(a), nombreApellidosPrimero(b)));
}
