// Dominio del calendario: lógica PURA (sin DOM, sin red, sin localStorage).
// Fechas = 'YYYY-MM-DD' y horas = 'HH:MM' (hora local del club, sin zona). Aritmética por días con Date.UTC
// para que el horario de verano del navegador no influya.

export const TZ_DEFECTO = 'Europe/Madrid';
export const DOMINIO_UID = 'cnl-plataforma';
export const PRODID = '-//CNL Plataforma//Calendario//ES';
export const DURACION_DEFECTO_MIN = 60;

// Etiquetas por defecto (español). La capa de aplicación pasa las traducidas.
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

// ---------- Fechas ----------
export function parseFecha(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s).trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
export const fechaValida = (s) => parseFecha(s) !== null;
export const aDias = (f) => { const p = parseFecha(f); return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000) : NaN; };
export function deDias(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
export const addDias = (f, n) => deDias(aDias(f) + n);
// 0 = lunes ... 6 = domingo
export const diaSemana = (f) => (((new Date(aDias(f) * 86400000)).getUTCDay() + 6) % 7);
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

// Rangos predefinidos para exportar. -> {desde, hasta} (ambos incluidos)
export function rangoPredefinido(tipo, hoy, cursor) {
  if (tipo === 'mes') { const c = cursor || hoy; return { desde: inicioMes(c), hasta: finMes(c) }; }
  if (tipo === 'temporada') { // temporada de natación: 1 sep - 31 ago
    const p = parseFecha(hoy);
    const y = p.m >= 9 ? p.y : p.y - 1;
    return { desde: `${y}-09-01`, hasta: `${y + 1}-08-31` };
  }
  const dias = Number(String(tipo).replace('proximos', '')) || 90;
  return { desde: hoy, hasta: addDias(hoy, dias - 1) };
}

export function parseHora(h) {
  if (typeof h === 'number') return h >= 0 && h < 1 ? Math.round(h * 1440) : null; // Sheets puede devolver fracción de día
  const m = /^(\d{1,2}):(\d{2})/.exec(str(h).trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  return hh > 23 || mm > 59 ? null : hh * 60 + mm;
}
export const horaStr = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const norm = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const numOr = (v, d) => { const n = Number(v); return v !== '' && isFinite(n) ? n : d; };

// Fin de un evento (fecha + hora local) -> {fecha, hora}
export function finEvento(ev) {
  const ini = parseHora(ev.hora);
  const dur = numOr(ev.duracionMin, DURACION_DEFECTO_MIN) > 0 ? numOr(ev.duracionMin, DURACION_DEFECTO_MIN) : DURACION_DEFECTO_MIN;
  const total = ini + dur;
  return { fecha: addDias(ev.fecha, Math.floor(total / 1440)), hora: horaStr(total % 1440) };
}

// ---------- Fuentes de eventos ----------
// Una fuente es {id, genera(datos, rango, etq) -> evento[]}. Nuevas funciones (p. ej. Planificación de piscina)
// se añaden con registrarFuente() o pasando su propia lista a eventosEnRango().
// Evento: {id, origen, fecha, hora, duracionMin, titulo, grupoId, grupoNombre, piscina, piscinaNombre, calle, enfoque,
//          volumenMin, volumenMax, descripcion, estado}
const enRango = (f, r) => f >= r.desde && f <= r.hasta;
const nombreGrupo = (grupos, id) => (grupos.find((g) => g.id === id) || {}).nombre || '';

export function eventosDeSesiones(datos, rango) {
  const grupos = datos.Grupos || [];
  return (datos.Entrenamientos || []).map((e) => {
    const fecha = str(e.fecha).slice(0, 10);
    if (!fechaValida(fecha) || !enRango(fecha, rango)) return null;
    return {
      id: `ses-${e.id}`, origen: 'sesion', fecha, hora: parseHora(e.hora) === null ? '' : horaStr(parseHora(e.hora)),
      duracionMin: numOr(e.duracionMin, DURACION_DEFECTO_MIN), titulo: str(e.titulo) || str(e.enfoque) || nombreGrupo(grupos, e.grupoId),
      grupoId: str(e.grupoId), grupoNombre: nombreGrupo(grupos, e.grupoId), piscina: str(e.piscina), piscinaNombre: '', calle: '',
      enfoque: str(e.enfoque), volumenMin: str(e.volumenMin), volumenMax: str(e.volumenMax), descripcion: str(e.descripcion), estado: str(e.estado),
    };
  }).filter(Boolean);
}

// AsignacionesCalle (hoja de Planificación de piscina): id, piscinaId, dia (1 = lunes ... 7), fecha (opcional),
// horaInicio, horaFin, calleDesde, calleHasta, grupoId, entrenadorId, notas.
//  - Sin fecha: asignación SEMANAL -> se expande a cada fecha del rango que cae en ese día de la semana.
//  - Con fecha: excepción puntual -> una única ocurrencia; sustituye a la semanal del mismo grupo ese día.
//  - Si ese día ya hay una sesión concreta (Entrenamientos) del mismo grupo, la sesión manda y la asignación no se duplica.
export function diaDeAsignacion(v) {
  const n = Number(str(v).trim());
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n - 1 : null;
}
function rangoCalles(a) { // "3" o "3-4"
  const d = str(a.calleDesde), h = str(a.calleHasta);
  return !h || d === h ? d || h : `${d}-${h}`;
}
export function eventosDeAsignaciones(datos, rango, etq = ETQ_DEFECTO) {
  const grupos = datos.Grupos || [];
  const piscinas = datos.Piscinas || [];
  const ocupados = new Set((datos.Entrenamientos || []).map((e) => `${str(e.fecha).slice(0, 10)}|${str(e.grupoId)}`));
  const asig = datos.AsignacionesCalle || [];
  const puntuales = new Set(asig.filter((a) => fechaValida(a.fecha)).map((a) => `${str(a.fecha).slice(0, 10)}|${str(a.grupoId)}`));
  const ini = aDias(rango.desde), fin = aDias(rango.hasta);
  const out = [];
  if (!Number.isFinite(ini) || !Number.isFinite(fin)) return out;
  const crear = (a, fecha) => {
    const t0 = parseHora(a.horaInicio), t1 = parseHora(a.horaFin);
    if (t0 === null || ocupados.has(`${fecha}|${str(a.grupoId)}`)) return;
    const gn = nombreGrupo(grupos, a.grupoId);
    const pis = piscinas.find((p) => p.id === str(a.piscinaId)) || {};
    const calle = rangoCalles(a);
    out.push({
      id: `calle-${a.id}-${fecha}`, origen: 'calle', fecha, hora: horaStr(t0),
      duracionMin: t1 !== null && t1 > t0 ? t1 - t0 : DURACION_DEFECTO_MIN,
      titulo: [gn || etq.todos, calle && etq.calle(calle)].filter(Boolean).join(' · '), grupoId: str(a.grupoId), grupoNombre: gn,
      piscina: str(pis.longitudM), piscinaNombre: str(pis.nombre), calle,
      enfoque: '', volumenMin: '', volumenMax: '', descripcion: str(a.notas), estado: 'planificado',
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
  fuentes.forEach((f) => { try { todos.push(...f.genera(datos, rango, etq)); } catch (e) { /* una fuente rota no tumba el calendario */ } });
  const vistos = new Set();
  return todos.filter((e) => (vistos.has(e.id) ? false : vistos.add(e.id))).sort(cmpEv);
}

// filtros: {grupoIds: null|string[] (null = sin límite), piscina: ''|'25'|'50', incluirGenerales}
// Las sesiones sin grupo (grupoId vacío) son para todo el club y se muestran siempre.
export function filtrarEventos(eventos, { grupoIds = null, piscina = '' } = {}) {
  return eventos.filter((e) => {
    if (grupoIds && e.grupoId && !grupoIds.includes(e.grupoId)) return false;
    if (piscina && e.piscina && e.piscina !== piscina) return false;
    return true;
  });
}

// ---------- Colores por grupo ----------
// Pares [fondo suave, borde/acento, texto]. Contraste del texto >= 4.5 sobre el fondo.
export const PALETA = [
  { fondo: '#e3effd', acento: '#1a73e8', texto: '#0b3d91' },
  { fondo: '#e0f4ea', acento: '#1e9e5a', texto: '#0d5a33' },
  { fondo: '#fdecd0', acento: '#e37400', texto: '#7a3e00' },
  { fondo: '#f3e1f7', acento: '#a142b8', texto: '#5c1a70' },
  { fondo: '#fde3e1', acento: '#d93025', texto: '#7f1d16' },
  { fondo: '#d9f1f4', acento: '#12a4b8', texto: '#0a5560' },
  { fondo: '#f1ecc4', acento: '#a39200', texto: '#575000' },
  { fondo: '#e4e6f7', acento: '#5865c4', texto: '#2a336e' },
];
export const COLOR_SIN_GRUPO = { fondo: '#eceff3', acento: '#6b778a', texto: '#2f3a4a' };
export function colorGrupo(grupoId, grupos) {
  if (!grupoId) return COLOR_SIN_GRUPO;
  const orden = grupos.map((g) => g.id).sort();
  const i = orden.indexOf(grupoId);
  return PALETA[(i < 0 ? 0 : i) % PALETA.length];
}

// ---------- Zonas horarias (sin base de datos tz: se deduce con Intl) ----------
const dtfCache = new Map();
function dtf(zona) {
  if (!dtfCache.has(zona)) {
    dtfCache.set(zona, new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return dtfCache.get(zona);
}
export function zonaValida(zona) {
  if (!zona || typeof zona !== 'string') return false;
  try { dtf(zona); return true; } catch (e) { return false; }
}
export const zonaOrDefecto = (z) => (zonaValida(str(z).trim()) ? str(z).trim() : TZ_DEFECTO);

// Desfase (minutos al este de UTC) de una zona en un instante.
export function offsetMin(zona, utcMs) {
  const parts = dtf(zona).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}
const fmtOffset = (min) => `${min < 0 ? '-' : '+'}${pad2(Math.floor(Math.abs(min) / 60))}${pad2(Math.abs(min) % 60)}`;
function nombreOffset(zona, utcMs) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, timeZoneName: 'short' }).formatToParts(new Date(utcMs)).find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch (e) { return ''; }
}
const localCompact = (fecha, hhmm, ss = '00') => `${fecha.replace(/-/g, '')}T${hhmm.replace(':', '')}${ss}`;

// Cambios de desfase entre dos fechas (inclusive): [{ms, de, a}] con precisión de minuto.
export function transiciones(zona, desde, hasta) {
  const ini = (aDias(desde) - 2) * 86400000, fin = (aDias(hasta) + 3) * 86400000;
  const out = [];
  let prev = offsetMin(zona, ini);
  for (let t = ini; t < fin; t += 86400000) {
    const next = offsetMin(zona, t + 86400000);
    if (next !== prev) {
      let lo = t, hi = t + 86400000; // offset(lo) = prev, offset(hi) = next
      while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 120000) * 60000; if (offsetMin(zona, mid) === prev) lo = mid; else hi = mid; }
      out.push({ ms: hi, de: prev, a: next });
      prev = next;
    }
  }
  return out;
}

// Bloque VTIMEZONE (RFC 5545 §3.6.5) con las transiciones reales del rango (sin RRULE). -> string[] de líneas
export function generarVTimezone(zona, desde, hasta) {
  const trs = transiciones(zona, desde, hasta);
  const o0 = offsetMin(zona, (aDias(desde) - 2) * 86400000);
  const offsets = [o0, ...trs.map((x) => x.a)];
  const minOff = Math.min(...offsets);
  const tipo = (o) => (trs.length && o > minOff ? 'DAYLIGHT' : 'STANDARD');
  const loc = (ms, off) => { // instante UTC -> hora local con el desfase indicado
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
  return str(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

// Plegado a 75 octetos UTF-8 por línea (sin partir caracteres); las continuaciones empiezan con un espacio.
export function plegarLinea(linea) {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes = [];
  let cur = '', bytes = 0, max = 75;
  for (const ch of linea) {
    const b = enc.encode(ch).length;
    if (bytes + b > max) { partes.push(cur); cur = ''; bytes = 0; max = 74; }
    cur += ch; bytes += b;
  }
  partes.push(cur);
  return partes.join('\r\n ');
}

const uidSeguro = (id) => str(id).replace(/[^A-Za-z0-9._-]/g, '-');
export const uidEvento = (ev) => `${uidSeguro(ev.id)}@${DOMINIO_UID}`;
const stampUtc = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

export function ubicacionEvento(ev, etq = ETQ_DEFECTO) {
  const pis = ev.piscinaNombre ? (ev.piscina ? `${ev.piscinaNombre} (${ev.piscina} m)` : ev.piscinaNombre) : (ev.piscina ? etq.piscina(ev.piscina) : '');
  return [pis, ev.calle ? etq.calle(ev.calle) : ''].filter(Boolean).join(', ');
}
export function descripcionEvento(ev, etq = ETQ_DEFECTO) {
  const vol = ev.volumenMin !== '' && ev.volumenMax !== '' ? `${ev.volumenMin}-${ev.volumenMax} m`
    : (ev.volumenMax !== '' ? `${ev.volumenMax} m` : (ev.volumenMin !== '' ? `${ev.volumenMin} m` : ''));
  return [
    ev.grupoNombre ? `${etq.grupo}: ${ev.grupoNombre}` : '',
    ev.enfoque ? `${etq.enfoque}: ${ev.enfoque}` : '',
    vol ? `${etq.volumen}: ${vol}` : '',
    ev.descripcion,
  ].filter(Boolean).join('\n');
}

// opciones: {nombreCalendario, zona, alarmaMin (0 = sin aviso), ahora: Date, secuencia, etq}
// Con hora => DTSTART;TZID=<zona> y un VTIMEZONE generado; sin hora => evento de día completo (VALUE=DATE).
export function generarICS(eventos, { nombreCalendario = 'CNL', zona = TZ_DEFECTO, alarmaMin = 0, ahora = new Date(), secuencia = 0, etq = ETQ_DEFECTO } = {}) {
  zona = zonaOrDefecto(zona);
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(nombreCalendario)}`, `X-WR-TIMEZONE:${zona}`];
  const conHora = eventos.filter((e) => e.hora);
  if (conHora.length) {
    const fs = conHora.map((e) => e.fecha).sort();
    l.push(...generarVTimezone(zona, fs[0], addDias(fs[fs.length - 1], 1)));
  }
  const stamp = stampUtc(ahora);
  eventos.forEach((ev) => {
    l.push('BEGIN:VEVENT', `UID:${uidEvento(ev)}`, `DTSTAMP:${stamp}`, `SEQUENCE:${Math.max(0, Math.floor(secuencia))}`);
    if (ev.hora) {
      const fin = finEvento(ev);
      l.push(`DTSTART;TZID=${zona}:${localCompact(ev.fecha, ev.hora)}`, `DTEND;TZID=${zona}:${localCompact(fin.fecha, fin.hora)}`);
    } else {
      l.push(`DTSTART;VALUE=DATE:${ev.fecha.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDias(ev.fecha, 1).replace(/-/g, '')}`);
    }
    l.push(`SUMMARY:${escaparTexto(ev.titulo)}`);
    const loc = ubicacionEvento(ev, etq);
    if (loc) l.push(`LOCATION:${escaparTexto(loc)}`);
    const desc = descripcionEvento(ev, etq);
    if (desc) l.push(`DESCRIPTION:${escaparTexto(desc)}`);
    if (ev.grupoNombre) l.push(`CATEGORIES:${escaparTexto(ev.grupoNombre)}`);
    l.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE');
    if (alarmaMin > 0 && ev.hora) {
      l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escaparTexto(ev.titulo)}`, `TRIGGER:-PT${Math.floor(alarmaMin)}M`, 'END:VALARM');
    }
    l.push('END:VEVENT');
  });
  l.push('END:VCALENDAR');
  return l.map(plegarLinea).join('\r\n') + '\r\n';
}

// Nombre de fichero seguro: "CNL - Club Natación.ics" -> "cnl-club-natacion.ics"
export function nombreFicheroICS(club, sufijo = '') {
  const base = norm(club).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendario';
  return `${base}${sufijo ? '-' + sufijo : ''}.ics`;
}

// ---------- Sincronización con Google Calendar ----------
// Cuerpo de evento de la API de Google a partir de un evento del dominio.
export function aEventoGoogle(ev, { zona = TZ_DEFECTO, alarmaMin = 0, clubId = '', etq = ETQ_DEFECTO } = {}) {
  zona = zonaOrDefecto(zona);
  const out = { summary: ev.titulo };
  const loc = ubicacionEvento(ev, etq);
  if (loc) out.location = loc;
  out.description = descripcionEvento(ev, etq);
  if (ev.hora) {
    const fin = finEvento(ev);
    out.start = { dateTime: `${ev.fecha}T${ev.hora}:00`, timeZone: zona };
    out.end = { dateTime: `${fin.fecha}T${fin.hora}:00`, timeZone: zona };
  } else {
    out.start = { date: ev.fecha };
    out.end = { date: addDias(ev.fecha, 1) };
  }
  out.reminders = { useDefault: false, overrides: alarmaMin > 0 && ev.hora ? [{ method: 'popup', minutes: Math.floor(alarmaMin) }] : [] };
  out.extendedProperties = { private: { cnlId: ev.id, cnlClub: str(clubId) } };
  return out;
}

// Huella estable (FNV-1a 32 bits) del cuerpo: si no cambia, no se llama a la API.
export function huella(obj) {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + s.length;
}

// deseados: [{id, fecha, cuerpo}]; mapa: {cnlId: {gid, huella, fecha}}; desde: sólo se borran los mapeados con fecha >= desde
// (lo anterior ya pasó y se conserva). -> {crear[], actualizar[], borrar[], iguales}
export function diffSync(deseados, mapa = {}, desde = '') {
  const crear = [], actualizar = [], borrar = [];
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
