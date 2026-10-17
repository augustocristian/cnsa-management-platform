// Swim times: the ONE implementation of parsing, masking and formatting (pure, no DOM).
// js/presentation/ui.js re-exports these as fmtTime / maskTime / parseTime; do not duplicate them elsewhere.
// A time is stored as integer milliseconds (Marcas.tiempoMs); precision is hundredths of a second.

// ms -> "mm:ss.cc" ('' when the value is not a valid duration)
export function fmtTiempo(ms) {
  ms = Number(ms);
  if (!isFinite(ms) || ms < 0) return '';
  const cs = Math.round(ms / 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(cs / 6000))}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`;
}

// Numeric mask for swim times: only digits count; the last two are hundredths and the two before are seconds.
// Typing "1:02.34" by hand gives the same result as typing 10234.
//   '10245' -> '1:02.45'   '2845' -> '28.45'   '545' -> '5.45'   '28' -> '28'
export function maskTiempo(str) {
  const d = String(str ?? '').replace(/\D/g, '').slice(0, 6);
  if (d.length <= 2) return d;
  const cc = d.slice(-2);
  const ss = d.slice(-4, -2);
  const mm = d.slice(0, -4);
  return mm ? `${Number(mm)}:${ss}.${cc}` : `${Number(ss)}.${cc}`;
}

// "1:02.34" | "62.34" | "02:05,5" -> ms; also with the numeric mask: "10245" -> 1:02.45 (NaN if invalid)
export function parseTiempo(str) {
  const txt = String(str ?? '').trim().replace(',', '.');
  if (/^\d{3,6}$/.test(txt)) {
    const cs = Number(txt.slice(-2));
    const ss = Number(txt.slice(-4, -2));
    const mm = txt.length > 4 ? Number(txt.slice(0, -4)) : 0;
    if (mm > 0 && ss > 59) return NaN;
    return Math.round((mm * 60 + ss + cs / 100) * 1000);
  }
  const m = txt.match(/^(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)$/);
  if (!m) return NaN;
  if (m[1] !== undefined && Number(m[2]) >= 60) return NaN; // 1:75.50 is not a time (the mask can produce it from 17550)
  return Math.round((Number(m[1] || 0) * 60 + Number(m[2])) * 1000);
}

// What the user typed, interpreted for live feedback.
// -> { estado: 'vacio' | 'ok' | 'error', ms, texto }  (texto = canonical mm:ss.cc, only when ok)
export function interpretarTiempo(str) {
  const txt = String(str ?? '').trim();
  if (!txt) return { estado: 'vacio', ms: NaN, texto: '' };
  const ms = parseTiempo(txt);
  if (!(ms > 0)) return { estado: 'error', ms: NaN, texto: '' };
  return { estado: 'ok', ms, texto: fmtTiempo(ms) };
}
