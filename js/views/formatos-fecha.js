// Locale-aware date labels shared by the planning, season and calendar views. Input is always a 'YYYY-MM-DD' string; output is
// display-only text (stored values are never translated). Pure formatting: no state, no clock.
import { locale } from '../i18n.js';
import { parseFecha } from '../domain/calendario.js';

// Local Date at midnight for a 'YYYY-MM-DD' (the zone never matters because only the calendar fields are formatted)
const aDate = (f) => { const p = parseFecha(f); return p ? new Date(p.y, p.m - 1, p.d) : new Date(Number.NaN); };
export const intl = (f, opts) => new Intl.DateTimeFormat(locale(), opts).format(aDate(f));

export const fmtCorta = (f) => intl(f, { day: 'numeric', month: 'short' }); // 5 oct
export const fmtNumerica = (f) => intl(f, { day: 'numeric', month: 'numeric' }); // 5/10
export const fmtLarga = (f) => intl(f, { day: 'numeric', month: 'long', year: 'numeric' }); // 5 de octubre de 2026
export const fmtDiaLargo = (f) => intl(f, { weekday: 'long', day: 'numeric', month: 'long' }); // lunes, 5 de octubre
export const fmtMesAnio = (f) => intl(f, { month: 'long', year: 'numeric' }); // octubre de 2026
export const fmtMes = (f) => intl(f, { month: 'short' }).replace('.', ''); // oct
export const fmtRango = (a, b) => (a === b ? fmtCorta(a) : `${fmtCorta(a)} – ${fmtCorta(b)}`);

// Weekday name for 1 = Monday ... 7 = Sunday (2024-01-01 was a Monday). estilo: 'long' | 'short' | 'narrow'
export const nombreDia = (dia, estilo = 'long') => intl(`2024-01-${String(dia).padStart(2, '0')}`, { weekday: estilo });
