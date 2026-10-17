// Calendar domain: PURE logic (no DOM, no network, no storage, no clock: "today" always arrives as an argument).
// Dates are 'YYYY-MM-DD' and times 'HH:MM' (club-local wall time, no zone). Day arithmetic uses Date.UTC so the
// browser's own daylight-saving rules never leak in.

export const TZ_DEFECTO = 'Europe/Madrid';
export const DOMINIO_UID = 'cnl-plataforma';
export const PRODID = '-//CNL Plataforma//Calendario//ES';
export const DURACION_DEFECTO_MIN = 60;

// Default labels (Spanish). The application layer passes the translated ones.
export const ETQ_DEFECTO = {
  calle: (n) => `Calle ${n}`,
  piscina: (p) => `Piscina ${p} m`,
  enfoque: 'Enfoque',
  volumen: 'Volumen',
  grupo: 'Grupo',
  todos: 'Todos los grupos',
};

const pad2 = (n) => String(n).padStart(2, '0');
const str = (v) => (v === undefined || v === null ? '' : String(v));

// ---------- Dates ----------
export function parseFecha(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s).trim());
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
export const fechaValida = (s) => parseFecha(s) !== null;
export const aDias = (f) => {
  const p = parseFecha(f);
  return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000) : NaN;
};
export function deDias(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
export const addDias = (f, n) => deDias(aDias(f) + n);
// 0 = lunes ... 6 = domingo
export const diaSemana = (f) => (new Date(aDias(f) * 86400000).getUTCDay() + 6) % 7;
export const lunesDe = (f) => addDias(f, -diaSemana(f));
export const inicioMes = (f) => f.slice(0, 7) + '-01';
export function finMes(f) {
  const p = parseFecha(f);
  return deDias(Math.round(Date.UTC(p.y, p.m, 1) / 86400000) - 1);
}
export function addMeses(f, n) {
  const p = parseFecha(f);
  const t = p.y * 12 + (p.m - 1) + n;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}-01`;
}
export const fechaDeDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Predefined ranges for export. -> {desde, hasta} (both inclusive)
export function rangoPredefinido(tipo, hoy, cursor) {
  if (tipo === 'mes') {
    const c = cursor || hoy;
    return { desde: inicioMes(c), hasta: finMes(c) };
  }
  if (tipo === 'temporada') {
    // swimming season: 1 Sep - 31 Aug
    const p = parseFecha(hoy);
    const y = p.m >= 9 ? p.y : p.y - 1;
    return { desde: `${y}-09-01`, hasta: `${y + 1}-08-31` };
  }
  const dias = Number(String(tipo).replace('proximos', '')) || 90;
  return { desde: hoy, hasta: addDias(hoy, dias - 1) };
}

export function parseHora(h) {
  if (typeof h === 'number') return h >= 0 && h < 1 ? Math.round(h * 1440) : null; // Sheets may return a fraction of a day
  const m = /^(\d{1,2}):(\d{2})/.exec(str(h).trim());
  if (!m) return null;
  const hh = +m[1],
    mm = +m[2];
  return hh > 23 || mm > 59 ? null : hh * 60 + mm;
}
export const horaStr = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const norm = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const numOr = (v, d) => {
  const n = Number(v);
  return v !== '' && isFinite(n) ? n : d;
};

// End of an event (date + local time) -> {fecha, hora}
export const duracionEvento = (ev) =>
  numOr(ev.duracionMin, DURACION_DEFECTO_MIN) > 0 ? numOr(ev.duracionMin, DURACION_DEFECTO_MIN) : DURACION_DEFECTO_MIN;
export function finEvento(ev) {
  const ini = parseHora(ev.hora);
  const dur = duracionEvento(ev);
  const total = ini + dur;
  return { fecha: addDias(ev.fecha, Math.floor(total / 1440)), hora: horaStr(total % 1440) };
}

// ---------- Event sources ----------
// A source is {id, genera(datos, rango, etq) -> evento[]}. New sources (e.g. pool planning)
// are added with registrarFuente() or by passing their own list to eventosEnRango().
// Evento: {id, origen, fecha, hora, duracionMin, titulo, grupoId, grupoNombre, piscina, piscinaNombre, calle, enfoque,
//          volumenMin, volumenMax, descripcion, estado}
const enRango = (f, r) => f >= r.desde && f <= r.hasta;
const nombreGrupo = (grupos, id) => (grupos.find((g) => g.id === id) || {}).nombre || '';

export function eventosDeSesiones(datos, rango) {
  const grupos = datos.Grupos || [];
  return (datos.Entrenamientos || [])
    .map((e) => {
      const fecha = str(e.fecha).slice(0, 10);
      if (!fechaValida(fecha) || !enRango(fecha, rango)) return null;
      return {
        id: `ses-${e.id}`,
        origen: 'sesion',
        fecha,
        hora: parseHora(e.hora) === null ? '' : horaStr(parseHora(e.hora)),
        duracionMin: numOr(e.duracionMin, DURACION_DEFECTO_MIN),
        titulo: str(e.titulo) || str(e.enfoque) || nombreGrupo(grupos, e.grupoId),
        grupoId: str(e.grupoId),
        grupoNombre: nombreGrupo(grupos, e.grupoId),
        piscina: str(e.piscina),
        piscinaNombre: '',
        calle: '',
        enfoque: str(e.enfoque),
        volumenMin: str(e.volumenMin),
        volumenMax: str(e.volumenMax),
        descripcion: str(e.descripcion),
        estado: str(e.estado),
      };
    })
    .filter(Boolean);
}

// AsignacionesCalle (pool-planning sheet): id, piscinaId, dia (1 = Monday ... 7), fecha (optional),
// horaInicio, horaFin, calleDesde, calleHasta, grupoId, entrenadorId, notas.
//  - No fecha: WEEKLY assignment -> expanded to every date of the range that falls on that weekday.
//  - With fecha: one-off exception -> a single occurrence; replaces the weekly one of the same group that day.
//  - If that day already has a concrete session (Entrenamientos) of the same group, the session wins and the assignment is not duplicated.
export function diaDeAsignacion(v) {
  const n = Number(str(v).trim());
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n - 1 : null;
}
function rangoCalles(a) {
  // "3" or "3-4"
  const d = str(a.calleDesde),
    h = str(a.calleHasta);
  return !h || d === h ? d || h : `${d}-${h}`;
}
export function eventosDeAsignaciones(datos, rango, etq = ETQ_DEFECTO) {
  const grupos = datos.Grupos || [];
  const piscinas = datos.Piscinas || [];
  const ocupados = new Set((datos.Entrenamientos || []).map((e) => `${str(e.fecha).slice(0, 10)}|${str(e.grupoId)}`));
  const asig = datos.AsignacionesCalle || [];
  const puntuales = new Set(
    asig.filter((a) => fechaValida(a.fecha)).map((a) => `${str(a.fecha).slice(0, 10)}|${str(a.grupoId)}`),
  );
  const ini = aDias(rango.desde),
    fin = aDias(rango.hasta);
  const out = [];
  if (!Number.isFinite(ini) || !Number.isFinite(fin)) return out;
  const crear = (a, fecha) => {
    const t0 = parseHora(a.horaInicio),
      t1 = parseHora(a.horaFin);
    if (t0 === null || ocupados.has(`${fecha}|${str(a.grupoId)}`)) return;
    const gn = nombreGrupo(grupos, a.grupoId);
    const pis = piscinas.find((p) => p.id === str(a.piscinaId)) || {};
    const calle = rangoCalles(a);
    out.push({
      id: `calle-${a.id}-${fecha}`,
      origen: 'calle',
      fecha,
      hora: horaStr(t0),
      duracionMin: t1 !== null && t1 > t0 ? t1 - t0 : DURACION_DEFECTO_MIN,
      titulo: [gn || etq.todos, calle && etq.calle(calle)].filter(Boolean).join(' · '),
      grupoId: str(a.grupoId),
      grupoNombre: gn,
      piscina: str(pis.longitudM),
      piscinaNombre: str(pis.nombre),
      calle,
      enfoque: '',
      volumenMin: '',
      volumenMax: '',
      descripcion: str(a.notas),
      estado: 'planificado',
    });
  };
  asig.forEach((a) => {
    if (fechaValida(a.fecha)) {
      const f = str(a.fecha).slice(0, 10);
      if (enRango(f, rango)) crear(a, f);
      return;
    }
    const dow = diaDeAsignacion(a.dia);
    if (dow === null) return;
    const primero = ini + ((dow - diaSemana(rango.desde) + 7) % 7);
    for (let d = primero; d <= fin; d += 7) {
      const fecha = deDias(d);
      if (!puntuales.has(`${fecha}|${str(a.grupoId)}`)) crear(a, fecha);
    }
  });
  return out;
}

export const FUENTES_EVENTOS = [
  { id: 'sesiones', genera: (datos, rango) => eventosDeSesiones(datos, rango) },
  { id: 'asignaciones-calle', genera: (datos, rango, etq) => eventosDeAsignaciones(datos, rango, etq) },
];
export function registrarFuente(fuente) {
  if (!FUENTES_EVENTOS.some((f) => f.id === fuente.id)) FUENTES_EVENTOS.push(fuente);
}

const cmpEv = (a, b) => (a.fecha + (a.hora || '00:00') + a.id).localeCompare(b.fecha + (b.hora || '00:00') + b.id);

// datos = {Entrenamientos, Grupos, AsignacionesCalle?...}; rango = {desde, hasta}
export function eventosEnRango(datos, rango, { fuentes = FUENTES_EVENTOS, etq = ETQ_DEFECTO } = {}) {
  const todos = [];
  fuentes.forEach((f) => {
    try {
      todos.push(...f.genera(datos, rango, etq));
    } catch (e) {
      /* a broken source does not bring the calendar down */
    }
  });
  const vistos = new Set();
  return todos.filter((e) => (vistos.has(e.id) ? false : vistos.add(e.id))).sort(cmpEv);
}

// filtros: {grupoIds: null|string[] (null = no limit), piscina: ''|'25'|'50', incluirGenerales}
// Sessions without a group (empty grupoId) are for the whole club and are always shown.
export function filtrarEventos(eventos, { grupoIds = null, piscina = '' } = {}) {
  return eventos.filter((e) => {
    if (grupoIds && e.grupoId && !grupoIds.includes(e.grupoId)) return false;
    if (piscina && e.piscina && e.piscina !== piscina) return false;
    return true;
  });
}

// ---------- Group colours ----------
// The domain only decides WHICH colour slot a group gets; the presentation paints it from design tokens (so light and dark
// mode both work and no hex lives here). A colour is either {tono: <hue 0-359>} (groups) or {semantico: 'danger'|'warn'|...}
// (events with their own meaning, see domain/temporada.js colorEventoCalendario) or the neutral {neutro: true}.
export const TONOS_GRUPO = [215, 150, 30, 285, 5, 185, 55, 235];
export const COLOR_SIN_GRUPO = { neutro: true };
export function colorGrupo(grupoId, grupos) {
  if (!grupoId) return COLOR_SIN_GRUPO;
  const orden = grupos.map((g) => g.id).sort();
  const i = orden.indexOf(grupoId);
  return { tono: TONOS_GRUPO[(i < 0 ? 0 : i) % TONOS_GRUPO.length] };
}

// ---------- Time zones (no tz database: deduced with Intl) ----------
const dtfCache = new Map();
function dtf(zona) {
  if (!dtfCache.has(zona)) {
    dtfCache.set(
      zona,
      new Intl.DateTimeFormat('en-US', {
        timeZone: zona,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return dtfCache.get(zona);
}
export function zonaValida(zona) {
  if (!zona || typeof zona !== 'string') return false;
  try {
    dtf(zona);
    return true;
  } catch (e) {
    return false;
  }
}
export const zonaOrDefecto = (z) => (zonaValida(str(z).trim()) ? str(z).trim() : TZ_DEFECTO);

// Offset (minutes east of UTC) of a zone at a given instant.
export function offsetMin(zona, utcMs) {
  const parts = dtf(zona).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}
const fmtOffset = (min) => `${min < 0 ? '-' : '+'}${pad2(Math.floor(Math.abs(min) / 60))}${pad2(Math.abs(min) % 60)}`;
function nombreOffset(zona, utcMs) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, timeZoneName: 'short' })
      .formatToParts(new Date(utcMs))
      .find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch (e) {
    return '';
  }
}
const localCompact = (fecha, hhmm, ss = '00') => `${fecha.replace(/-/g, '')}T${hhmm.replace(':', '')}${ss}`;
const fmtOffsetRfc3339 = (min) =>
  `${min < 0 ? '-' : '+'}${pad2(Math.floor(Math.abs(min) / 60))}:${pad2(Math.abs(min) % 60)}`;

// Resolves a club wall-clock time to a real instant, handling the two daylight-saving edge cases the way RFC 5545 §3.3.5 says:
//  - NON-EXISTENT time (spring gap, e.g. Europe/Madrid 2026-03-29 02:30): interpreted with the offset BEFORE the gap, so it
//    lands on the first valid minute after it (03:30 summer time).
//  - AMBIGUOUS time (autumn overlap, e.g. Europe/Madrid 2026-10-25 02:30): the FIRST occurrence (summer offset) is used.
// -> {estado: 'normal'|'inexistente'|'ambigua', ms (UTC instant), offsetMin, fecha, hora (wall time of that instant in the zone)}
export function resolverHoraLocal(zona, fecha, hora) {
  zona = zonaOrDefecto(zona);
  const p = parseFecha(fecha);
  const min = parseHora(hora);
  if (!p || min === null) return null;
  const pared = Date.UTC(p.y, p.m - 1, p.d, Math.floor(min / 60), min % 60);
  const antes = offsetMin(zona, pared - 86400000);
  const despues = offsetMin(zona, pared + 86400000);
  const t1 = pared - antes * 60000;
  const t2 = pared - despues * 60000;
  const v1 = offsetMin(zona, t1) === antes;
  const v2 = offsetMin(zona, t2) === despues;
  let ms,
    off,
    estado = 'normal';
  if (v1 && v2 && antes !== despues) {
    estado = 'ambigua';
    ms = Math.min(t1, t2);
    off = antes > despues ? antes : despues;
  } else if (v1) {
    ms = t1;
    off = antes;
  } else if (v2) {
    ms = t2;
    off = despues;
  } else {
    estado = 'inexistente';
    ms = t1;
    off = despues;
  } // instant computed with the pre-gap offset, shown with the post-gap one
  const real = new Date(ms + (estado === 'inexistente' ? despues : off) * 60000);
  const f = `${real.getUTCFullYear()}-${pad2(real.getUTCMonth() + 1)}-${pad2(real.getUTCDate())}`;
  return { estado, ms, offsetMin: off, fecha: f, hora: `${pad2(real.getUTCHours())}:${pad2(real.getUTCMinutes())}` };
}

// Offset changes between two dates (inclusive): [{ms, de, a}] with minute precision.
export function transiciones(zona, desde, hasta) {
  const ini = (aDias(desde) - 2) * 86400000,
    fin = (aDias(hasta) + 3) * 86400000;
  const out = [];
  let prev = offsetMin(zona, ini);
  for (let t = ini; t < fin; t += 86400000) {
    const next = offsetMin(zona, t + 86400000);
    if (next !== prev) {
      let lo = t,
        hi = t + 86400000; // offset(lo) = prev, offset(hi) = next
      while (hi - lo > 60000) {
        const mid = Math.floor((lo + hi) / 120000) * 60000;
        if (offsetMin(zona, mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ ms: hi, de: prev, a: next });
      prev = next;
    }
  }
  return out;
}

// VTIMEZONE block (RFC 5545 §3.6.5) with the real transitions of the range (no RRULE). -> string[] of lines
export function generarVTimezone(zona, desde, hasta) {
  const trs = transiciones(zona, desde, hasta);
  const o0 = offsetMin(zona, (aDias(desde) - 2) * 86400000);
  const offsets = [o0, ...trs.map((x) => x.a)];
  const minOff = Math.min(...offsets);
  const tipo = (o) => (trs.length && o > minOff ? 'DAYLIGHT' : 'STANDARD');
  const loc = (ms, off) => {
    // UTC instant -> local time with the given offset
    const d = new Date(ms + off * 60000);
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00`;
  };
  const l = ['BEGIN:VTIMEZONE', `TZID:${zona}`];
  const obs = (t, dtstart, de, a, ms) => {
    l.push(`BEGIN:${t}`, `DTSTART:${dtstart}`, `TZOFFSETFROM:${fmtOffset(de)}`, `TZOFFSETTO:${fmtOffset(a)}`);
    const n = nombreOffset(zona, ms);
    if (n) l.push(`TZNAME:${n}`);
    l.push(`END:${t}`);
  };
  obs(tipo(o0), '19700101T000000', o0, o0, (aDias(desde) - 2) * 86400000);
  trs.forEach((x) => obs(tipo(x.a), loc(x.ms, x.de), x.de, x.a, x.ms));
  l.push('END:VTIMEZONE');
  return l;
}

// ---------- iCalendar (RFC 5545) ----------
export function escaparTexto(s) {
  return (
    str(s)
      // eslint-disable-next-line no-control-regex -- strips control characters on purpose
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n')
  );
}

// Folding to 75 UTF-8 octets per line (without splitting characters); continuations start with a space.
export function plegarLinea(linea) {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes = [];
  let cur = '',
    bytes = 0,
    max = 75;
  for (const ch of linea) {
    const b = enc.encode(ch).length;
    if (bytes + b > max) {
      partes.push(cur);
      cur = '';
      bytes = 0;
      max = 74;
    }
    cur += ch;
    bytes += b;
  }
  partes.push(cur);
  return partes.join('\r\n ');
}

const uidSeguro = (id) => str(id).replace(/[^A-Za-z0-9._-]/g, '-');
export const uidEvento = (ev) => `${uidSeguro(ev.id)}@${DOMINIO_UID}`;
const stampUtc = (d) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

export function ubicacionEvento(ev, etq = ETQ_DEFECTO) {
  const pis = ev.piscinaNombre
    ? ev.piscina
      ? `${ev.piscinaNombre} (${ev.piscina} m)`
      : ev.piscinaNombre
    : ev.piscina
      ? etq.piscina(ev.piscina)
      : '';
  return [pis, ev.calle ? etq.calle(ev.calle) : ''].filter(Boolean).join(', ');
}
export function descripcionEvento(ev, etq = ETQ_DEFECTO) {
  const vol =
    ev.volumenMin !== '' && ev.volumenMax !== ''
      ? `${ev.volumenMin}-${ev.volumenMax} m`
      : ev.volumenMax !== ''
        ? `${ev.volumenMax} m`
        : ev.volumenMin !== ''
          ? `${ev.volumenMin} m`
          : '';
  return [
    ev.grupoNombre ? `${etq.grupo}: ${ev.grupoNombre}` : '',
    ev.enfoque ? `${etq.enfoque}: ${ev.enfoque}` : '',
    vol ? `${etq.volumen}: ${vol}` : '',
    ev.descripcion,
  ]
    .filter(Boolean)
    .join('\n');
}

// Start/end lines of a timed event. A normal start keeps the zone with the club wall times. When the start is a DST edge case the
// end is the real instant plus the duration (elapsed time, not wall-clock arithmetic): a non-existent start keeps the zone with the
// wall time of the real instant; an AMBIGUOUS one is written in UTC so every client picks the same (first) occurrence.
function lineasInicioFin(zona, ev) {
  const ini = resolverHoraLocal(zona, ev.fecha, ev.hora);
  const fin = finEvento(ev);
  if (!ini)
    return [
      `DTSTART;TZID=${zona}:${localCompact(ev.fecha, ev.hora)}`,
      `DTEND;TZID=${zona}:${localCompact(fin.fecha, fin.hora)}`,
    ];
  if (ini.estado === 'normal')
    return [
      `DTSTART;TZID=${zona}:${localCompact(ev.fecha, ev.hora)}`,
      `DTEND;TZID=${zona}:${localCompact(fin.fecha, fin.hora)}`,
    ];
  const finMs = ini.ms + duracionEvento(ev) * 60000;
  if (ini.estado === 'ambigua') return [`DTSTART:${stampUtc(new Date(ini.ms))}`, `DTEND:${stampUtc(new Date(finMs))}`];
  const pared = new Date(finMs + offsetMin(zona, finMs) * 60000); // wall time in the zone at the end instant
  const f = `${pared.getUTCFullYear()}${pad2(pared.getUTCMonth() + 1)}${pad2(pared.getUTCDate())}T${pad2(pared.getUTCHours())}${pad2(pared.getUTCMinutes())}00`;
  return [`DTSTART;TZID=${zona}:${localCompact(ini.fecha, ini.hora)}`, `DTEND;TZID=${zona}:${f}`];
}

// opciones: {nombreCalendario, zona, alarmaMin (0 = no alarm), ahora: Date (REQUIRED, the caller's clock), secuencia, etq}
// With a time => DTSTART;TZID=<zona> and a generated VTIMEZONE; without a time => all-day event (VALUE=DATE).
export function generarICS(
  eventos,
  { nombreCalendario = 'CNL', zona = TZ_DEFECTO, alarmaMin = 0, ahora, secuencia = 0, etq = ETQ_DEFECTO } = {},
) {
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime()))
    throw new TypeError('generarICS: "ahora" (Date) is required');
  zona = zonaOrDefecto(zona);
  const l = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(nombreCalendario)}`,
    `X-WR-TIMEZONE:${zona}`,
  ];
  const conHora = eventos.filter((e) => e.hora);
  if (conHora.length) {
    const fs = conHora.map((e) => e.fecha).sort();
    l.push(...generarVTimezone(zona, fs[0], addDias(fs[fs.length - 1], 1)));
  }
  const stamp = stampUtc(ahora);
  eventos.forEach((ev) => {
    l.push(
      'BEGIN:VEVENT',
      `UID:${uidEvento(ev)}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${Math.max(0, Math.floor(secuencia))}`,
    );
    if (ev.hora) {
      l.push(...lineasInicioFin(zona, ev));
    } else {
      l.push(
        `DTSTART;VALUE=DATE:${ev.fecha.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDias(ev.fecha, 1).replace(/-/g, '')}`,
      );
    }
    l.push(`SUMMARY:${escaparTexto(ev.titulo)}`);
    const loc = ubicacionEvento(ev, etq);
    if (loc) l.push(`LOCATION:${escaparTexto(loc)}`);
    const desc = descripcionEvento(ev, etq);
    if (desc) l.push(`DESCRIPTION:${escaparTexto(desc)}`);
    if (ev.grupoNombre) l.push(`CATEGORIES:${escaparTexto(ev.grupoNombre)}`);
    l.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE');
    if (alarmaMin > 0 && ev.hora) {
      l.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escaparTexto(ev.titulo)}`,
        `TRIGGER:-PT${Math.floor(alarmaMin)}M`,
        'END:VALARM',
      );
    }
    l.push('END:VEVENT');
  });
  l.push('END:VCALENDAR');
  return l.map(plegarLinea).join('\r\n') + '\r\n';
}

// Safe file name: "CNL - Club Natación.ics" -> "cnl-club-natacion.ics"
export function nombreFicheroICS(club, sufijo = '') {
  const base =
    norm(club)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calendario';
  return `${base}${sufijo ? '-' + sufijo : ''}.ics`;
}

// ---------- Google Calendar synchronisation ----------
// RFC 3339 dateTime for the Google API. Normal times stay as the plain wall time; a non-existent time is moved to the real
// instant and an ambiguous one carries an explicit offset (first occurrence), so Google never has to guess.
function dateTimeGoogle(zona, fecha, hora) {
  const r = resolverHoraLocal(zona, fecha, hora);
  if (!r || r.estado === 'normal') return `${fecha}T${hora}:00`;
  return `${r.fecha}T${r.hora}:00${r.estado === 'ambigua' ? fmtOffsetRfc3339(r.offsetMin) : ''}`;
}

// Google API event body built from a domain event.
export function aEventoGoogle(ev, { zona = TZ_DEFECTO, alarmaMin = 0, clubId = '', etq = ETQ_DEFECTO } = {}) {
  zona = zonaOrDefecto(zona);
  const out = { summary: ev.titulo };
  const loc = ubicacionEvento(ev, etq);
  if (loc) out.location = loc;
  out.description = descripcionEvento(ev, etq);
  if (ev.hora) {
    const ini = resolverHoraLocal(zona, ev.fecha, ev.hora);
    const fin = finEvento(ev);
    out.start = { dateTime: dateTimeGoogle(zona, ev.fecha, ev.hora), timeZone: zona };
    if (ini && ini.estado !== 'normal') {
      // DST edge case: end = real instant + duration, written with an explicit offset
      const finMs = ini.ms + duracionEvento(ev) * 60000;
      const off = offsetMin(zona, finMs);
      const pared = new Date(finMs + off * 60000);
      out.end = {
        dateTime: `${pared.getUTCFullYear()}-${pad2(pared.getUTCMonth() + 1)}-${pad2(pared.getUTCDate())}T${pad2(pared.getUTCHours())}:${pad2(pared.getUTCMinutes())}:00${fmtOffsetRfc3339(off)}`,
        timeZone: zona,
      };
    } else out.end = { dateTime: `${fin.fecha}T${fin.hora}:00`, timeZone: zona };
  } else {
    out.start = { date: ev.fecha };
    out.end = { date: addDias(ev.fecha, 1) };
  }
  out.reminders = {
    useDefault: false,
    overrides: alarmaMin > 0 && ev.hora ? [{ method: 'popup', minutes: Math.floor(alarmaMin) }] : [],
  };
  out.extendedProperties = { private: { cnlId: ev.id, cnlClub: str(clubId) } };
  return out;
}

// Stable fingerprint (32-bit FNV-1a) of the body: if it does not change, the API is not called.
export function huella(obj) {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + s.length;
}

// deseados: [{id, fecha, cuerpo}]; mapa: {cnlId: {gid, huella, fecha}}; desde: only mapped events with fecha >= desde are deleted
// (earlier ones are already past and are kept). -> {crear[], actualizar[], borrar[], iguales}
export function diffSync(deseados, mapa = {}, desde = '') {
  const crear = [],
    actualizar = [],
    borrar = [];
  let iguales = 0;
  const ids = new Set();
  deseados.forEach((d) => {
    ids.add(d.id);
    const h = huella(d.cuerpo);
    const m = mapa[d.id];
    if (!m || !m.gid) crear.push({ id: d.id, fecha: d.fecha, cuerpo: d.cuerpo, huella: h });
    else if (m.huella !== h) actualizar.push({ id: d.id, gid: m.gid, fecha: d.fecha, cuerpo: d.cuerpo, huella: h });
    else iguales++;
  });
  Object.keys(mapa).forEach((id) => {
    if (ids.has(id)) return;
    const m = mapa[id];
    if (m && m.gid && (!desde || !m.fecha || m.fecha >= desde)) borrar.push({ id, gid: m.gid, fecha: m.fecha || '' });
  });
  return { crear, actualizar, borrar, iguales };
}

// ---------- View model (pure helpers the calendar view relies on) ----------
export const VISTAS = ['mes', 'semana', 'agenda'];
export const AGENDA_DIAS = 30; // the agenda is a rolling window that STARTS at the cursor (today when it opens)

// First view: the stored choice if valid, otherwise Agenda on a phone and Month elsewhere. A stored "month" is ignored on a
// phone (preferences follow the person across devices and a month grid is unusable on a narrow screen).
export function vistaInicial({ guardada, movil = false } = {}) {
  if (!VISTAS.includes(guardada)) return movil ? 'agenda' : 'mes';
  if (movil && guardada === 'mes') return 'agenda';
  return guardada;
}

// Dates shown by a view: {desde, hasta} inclusive. Month = whole weeks around the month, Week = Monday..Sunday,
// Agenda = AGENDA_DIAS days starting AT the cursor.
export function rangoVista(vista, cursor) {
  if (vista === 'semana') {
    const l = lunesDe(cursor);
    return { desde: l, hasta: addDias(l, 6) };
  }
  if (vista === 'mes') return { desde: lunesDe(inicioMes(cursor)), hasta: addDias(lunesDe(finMes(cursor)), 6) };
  return { desde: cursor, hasta: addDias(cursor, AGENDA_DIAS - 1) };
}

// Cursor after pressing Previous (-1) / Next (+1).
export function moverCursor(vista, cursor, dir) {
  if (vista === 'semana') return addDias(cursor, 7 * dir);
  if (vista === 'agenda') return addDias(cursor, AGENDA_DIAS * dir);
  return addMeses(cursor, dir);
}

// Day that gets selected after moving: today when the new month contains it, otherwise the first day shown.
export function seleccionTrasMover(vista, cursor, hoy) {
  return vista === 'mes' && cursor.slice(0, 7) === hoy.slice(0, 7) ? hoy : cursor;
}

export function agruparPorDia(eventos) {
  const m = new Map();
  eventos.forEach((e) => {
    if (!m.has(e.fecha)) m.set(e.fecha, []);
    m.get(e.fecha).push(e);
  });
  return m;
}

// Month grid: array of weeks, each an array of 7 'YYYY-MM-DD' (Monday first), covering the whole month.
export function matrizMes(cursor) {
  const { desde, hasta } = rangoVista('mes', cursor);
  const semanas = [];
  for (let ini = desde; ini <= hasta; ini = addDias(ini, 7))
    semanas.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDias(ini, i)));
  return semanas;
}

// Days listed by the agenda, ascending: every day with events, plus the anchor day itself when it is today (so the list visibly
// opens on today even if nothing is scheduled).
export function diasDeAgenda(porDia, desde, hoy) {
  const dias = [...porDia.keys()];
  if (desde === hoy && !porDia.has(hoy)) dias.push(hoy);
  return dias.sort();
}

// Keyboard movement inside the month grid (WAI-ARIA grid): the date reached from `f` with `key`, or null for any other key.
// Arrows = +-1 day / +-1 week, Home/End = Monday/Sunday of the week, PageUp/PageDown = same day of the previous/next month.
export function fechaTrasTecla(key, f) {
  switch (key) {
    case 'ArrowLeft':
      return addDias(f, -1);
    case 'ArrowRight':
      return addDias(f, 1);
    case 'ArrowUp':
      return addDias(f, -7);
    case 'ArrowDown':
      return addDias(f, 7);
    case 'Home':
      return lunesDe(f);
    case 'End':
      return addDias(lunesDe(f), 6);
    case 'PageUp':
    case 'PageDown': {
      const primero = addMeses(f, key === 'PageUp' ? -1 : 1);
      const ultimo = +finMes(primero).slice(8);
      return primero.slice(0, 8) + pad2(Math.min(+f.slice(8), ultimo));
    }
    default:
      return null;
  }
}

// Start and end 'HH:MM' of a timed event, null for all-day events.
export function rangoHoraEvento(ev) {
  return ev.hora ? { ini: ev.hora, fin: finEvento(ev).hora } : null;
}

// Export range chosen in the UI: 'mes' | 'temporada' | 'proximos90' -> {rango, sufijo} (suffix used in the file name).
export function rangoExportacion(tipo, hoy, cursor) {
  if (tipo === 'temporada') return { rango: rangoPredefinido('temporada', hoy), sufijo: 'temporada' };
  if (tipo === 'proximos90') return { rango: rangoPredefinido('proximos90', hoy), sufijo: '90-dias' };
  return { rango: rangoPredefinido('mes', hoy, cursor), sufijo: cursor.slice(0, 7) };
}
