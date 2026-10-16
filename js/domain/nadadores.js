// Pure helpers about swimmer records (no DOM, no storage).

const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'falso', 'inactivo']);

// A swimmer is active unless `activo` is explicitly a "false-like" value.
// The stored value is the string 'true' / 'false'; spreadsheet imports may bring booleans or Spanish words.
export function esActivo(nadador) {
  if (!nadador) return false;
  const v = nadador.activo;
  if (v === false || v === 0) return false;
  return !FALSE_VALUES.has(String(v ?? '').trim().toLowerCase());
}
