// Pure rules for the bell counter ("unread notices"). No DOM, storage or clock: dates arrive as arguments.
export const VENTANA_DIAS = 7;

const dos = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DD' in local time.
export function aIso(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// First day (inclusive) of the window of recent notices.
export function desdeIso(ahora, dias = VENTANA_DIAS) {
  const d = new Date(ahora.getTime());
  d.setDate(d.getDate() - dias);
  return aIso(d);
}

// Notices inside the window (fecha >= desde) written after the last time the user opened the notices view (fecha > visto).
export function contarNoLeidos(comunicaciones, { desde, visto } = {}) {
  const lista = Array.isArray(comunicaciones) ? comunicaciones : [];
  return lista.filter((c) => {
    const f = String(c?.fecha ?? '');
    if (!f || (desde && f < desde)) return false;
    return !visto || f > visto;
  }).length;
}
