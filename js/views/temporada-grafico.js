// Gráficos de la Planificación de temporada (SVG propio, accesible y responsive). Sólo presentan: reciben el modelo de
// temporadaService.resumen() y devuelven nodos DOM. Los eventos se diferencian por FORMA y TEXTO, no sólo por color.
import { t, tNum, locale, tContenido } from '../i18n.js';
import { COLOR_PRIORIDAD, COLOR_EVENTO, diasEntre, addDias } from '../domain/temporada.js';
import { ordenarTipos } from '../domain/cargas.js';

const NS = 'http://www.w3.org/2000/svg';
export function S(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const sinOrden = (x) => x;

// ---------- Formatos ----------
const parse = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtM = (v) => `${tNum(Math.round(v || 0))} m`;
export const fmtCorta = (f) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(parse(f));
export const fmtNumerica = (f) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric' }).format(parse(f));
export const fmtLarga = (f) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(parse(f));
export const fmtRango = (a, b) => (a === b ? fmtCorta(a) : `${fmtCorta(a)} – ${fmtCorta(b)}`);
export const fmtMes = (f) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(parse(f)).replace('.', '');
export const fmtPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${tNum(Math.round(p))} %`);
export const textoEstado = (e) => t('tp.estado.' + e);
export const nombreFase = (f) => (f ? f.nombre : t('tp.sin-fase'));
export const nombrePrioridad = (e) => (e.tipo === 'competicion' && e.prioridad ? t('tp.prioridad-n', { p: e.prioridad }) : t('tp.evento.' + e.tipo));

export function ariaSemana(s) {
  const evs = s.eventos.map((e) => `${e.nombre} (${nombrePrioridad(e)})`).join('; ');
  return t('tp.g.semana-aria', {
    n: s.n, fechas: fmtRango(s.desde, s.hasta), fase: nombreFase(s.fase), previsto: s.plan.volumen > 0 ? fmtM(s.plan.volumen) : t('tp.sin-previsto'),
    real: fmtM(s.real.total), estado: textoEstado(s.estado), desv: fmtPct(s.desv.pct), eventos: evs || t('tp.sin-eventos'),
  });
}

// ---------- Marcadores de evento ----------
// A = rombo, B = cuadrado, C = círculo (con su letra); el resto de eventos = recuadro redondeado con su abreviatura.
export function formaMarcador(e, cx, cy, r = 8) {
  const g = S('g', { class: 'tp-marca' });
  if (e.tipo === 'competicion' && e.prioridad) {
    const col = COLOR_PRIORIDAD[e.prioridad];
    const forma = e.prioridad === 'A' ? S('polygon', { points: `${cx},${cy - r - 2} ${cx + r + 2},${cy} ${cx},${cy + r + 2} ${cx - r - 2},${cy}`, fill: col })
      : e.prioridad === 'B' ? S('rect', { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, rx: 1.5, fill: col }) : S('circle', { cx, cy, r, fill: col });
    g.append(forma, S('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', class: 'tp-marca-t' }, e.prioridad));
  } else {
    const col = e.tipo === 'competicion' ? COLOR_EVENTO.competicion : COLOR_EVENTO[e.tipo];
    g.append(S('rect', { x: cx - 10, y: cy - 7, width: 20, height: 14, rx: 4, fill: col }), S('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', class: 'tp-marca-t tp-marca-s' }, t('tp.evento-abrev.' + e.tipo)));
  }
  return g;
}

// Icono pequeño HTML/SVG para leyendas y listas.
export function insigniaEvento(e, h) {
  const svg = S('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false', class: 'tp-insignia' });
  svg.appendChild(formaMarcador(e, 12, 12, 7));
  return h ? svg : svg;
}

// ---------- Escala ----------
function escala(max) {
  const pasos = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  const paso = pasos.find((p) => max / p <= 5) || 20000;
  const top = Math.max(paso, Math.ceil(max / paso) * paso);
  const ticks = [];
  for (let v = 0; v <= top; v += paso) ticks.push(v);
  return { top, ticks };
}

// ---------- Gráfico de barras apiladas ----------
// opciones: {m, desde, hasta (n de semana), sel (n), onSelect(n), contenedor}
export function graficoSemanas({ m, desde, hasta, sel, onSelect }) {
  const semanas = m.semanas.filter((s) => s.n >= desde && s.n <= hasta);
  const count = Math.max(1, semanas.length);
  const colW = Math.max(22, Math.min(64, Math.floor(880 / count)));
  const padL = 58, padR = 14, topFase = 0, hFase = 22, yEv = 30, plotTop = 82, plotH = 210, plotBot = plotTop + plotH, H = plotBot + 56;
  const W = padL + padR + count * colW;
  const tipos = ordenarTipos(m.tipos);
  const max = Math.max(1, ...semanas.map((s) => Math.max(s.plan.volumen || 0, s.real.total || 0))) * 1.08;
  const { top, ticks } = escala(max);
  const y = (v) => plotBot - (v / top) * plotH;
  const xs = (i) => padL + i * colW;
  const svg = S('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'tp-svg', role: 'group',
    'aria-label': t('tp.g.aria', { desde: semanas[0] ? semanas[0].n : 0, hasta: semanas.length ? semanas[semanas.length - 1].n : 0 }),
  });
  const defs = S('defs');
  const pat = S('pattern', { id: 'tp-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(S('rect', { width: 6, height: 6, fill: '#d6dbe3' }), S('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#7b8594', 'stroke-width': 2 }));
  defs.append(pat);
  svg.append(defs);

  // Bandas de fase
  const grupos = [];
  semanas.forEach((s, i) => {
    const ult = grupos[grupos.length - 1];
    if (ult && ult.fase && s.fase && ult.fase.id === s.fase.id) ult.fin = i; else grupos.push({ fase: s.fase, ini: i, fin: i });
  });
  grupos.forEach((g) => {
    if (!g.fase) return;
    const x = xs(g.ini), w = (g.fin - g.ini + 1) * colW;
    const clip = `tp-clip-${g.fase.id}-${g.ini}`.replace(/[^\w-]/g, '_');
    const cp = S('clipPath', { id: clip });
    cp.append(S('rect', { x, y: topFase, width: w, height: hFase }));
    defs.append(cp);
    svg.append(
      S('rect', { x, y: plotTop, width: w, height: plotH, fill: g.fase.color, 'fill-opacity': 0.09 }),
      S('rect', { x, y: topFase, width: w, height: hFase, fill: g.fase.color, 'fill-opacity': 0.2 }),
      S('rect', { x, y: topFase, width: w, height: 3, fill: g.fase.color }),
      S('line', { x1: x, y1: topFase, x2: x, y2: plotBot, stroke: g.fase.color, 'stroke-opacity': 0.55, 'stroke-dasharray': '2 3' }),
    );
    const tx = S('text', { x: x + 6, y: topFase + 16, class: 'tp-fase-t', 'clip-path': `url(#${clip})` }, g.fase.nombre);
    svg.append(tx);
  });

  // Rejilla y eje Y
  ticks.forEach((v) => {
    svg.append(S('line', { x1: padL, y1: y(v), x2: W - padR, y2: y(v), class: 'tp-grid' }), S('text', { x: padL - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'tp-eje' }, v >= 1000 ? `${tNum(v / 1000)}k` : String(v)));
  });
  svg.append(S('text', { x: 12, y: plotTop + plotH / 2, class: 'tp-eje', transform: `rotate(-90 12 ${plotTop + plotH / 2})`, 'text-anchor': 'middle' }, t('tp.g.eje-y')));

  // Semana actual y seleccionada
  semanas.forEach((s, i) => {
    if (s.tiempo === 'actual') svg.append(S('rect', { x: xs(i), y: plotTop - 4, width: colW, height: plotH + 30, class: 'tp-hoy' }), S('text', { x: xs(i) + colW / 2, y: plotTop - 8, 'text-anchor': 'middle', class: 'tp-hoy-t' }, t('tp.hoy')));
  });

  // Barras apiladas (real) + contorno discontinuo si procede de los planes de entreno
  semanas.forEach((s, i) => {
    const bw = Math.max(8, Math.round(colW * 0.62)), bx = xs(i) + (colW - bw) / 2;
    let acum = 0;
    const grupo = S('g', { class: 'tp-barra', 'data-n': s.n });
    tipos.forEach((tp) => {
      const v = s.real.metros[tp.id] || 0;
      if (v <= 0) return;
      grupo.append(S('rect', { x: bx, y: y(acum + v), width: bw, height: Math.max(0.5, y(acum) - y(acum + v)), fill: tp.color, 'fill-opacity': s.real.fuente === 'planes' ? 0.55 : 0.95 }));
      acum += v;
    });
    if (s.real.sinClasificar > 0) {
      grupo.append(S('rect', { x: bx, y: y(acum + s.real.sinClasificar), width: bw, height: Math.max(0.5, y(acum) - y(acum + s.real.sinClasificar)), fill: 'url(#tp-hatch)' }));
      acum += s.real.sinClasificar;
    }
    if (acum > 0 && s.real.fuente === 'planes') grupo.append(S('rect', { x: bx, y: y(acum), width: bw, height: y(0) - y(acum), fill: 'none', stroke: '#1f2a3a', 'stroke-dasharray': '3 2', 'stroke-width': 1 }));
    svg.append(grupo);
  });

  // Línea de volumen previsto (tramos continuos)
  let tramo = [];
  const cerrar = () => { if (tramo.length > 1) svg.append(S('polyline', { points: tramo.join(' '), class: 'tp-previsto' })); tramo = []; };
  semanas.forEach((s, i) => {
    if (s.plan.volumen > 0) tramo.push(`${xs(i) + colW / 2},${y(s.plan.volumen)}`); else cerrar();
  });
  cerrar();
  semanas.forEach((s, i) => { if (s.plan.volumen > 0) svg.append(S('circle', { cx: xs(i) + colW / 2, cy: y(s.plan.volumen), r: 3.2, class: 'tp-previsto-p' })); });

  // Eje X: número y fecha
  svg.append(S('line', { x1: padL, y1: plotBot, x2: W - padR, y2: plotBot, class: 'tp-eje-l' }));
  const paso = colW >= 44 ? 1 : colW >= 30 ? 2 : 3;
  let anioPrev = '';
  semanas.forEach((s, i) => {
    const cx = xs(i) + colW / 2;
    svg.append(S('text', { x: cx, y: plotBot + 14, 'text-anchor': 'middle', class: 'tp-eje tp-eje-n' }, String(s.n)));
    const anio = s.lunes.slice(0, 4);
    if (i % paso === 0 || i === semanas.length - 1 && paso === 1) {
      svg.append(S('text', { x: cx, y: plotBot + 27, 'text-anchor': 'middle', class: 'tp-eje' }, fmtNumerica(s.lunes)));
      if (anio !== anioPrev) { svg.append(S('text', { x: cx, y: plotBot + 40, 'text-anchor': 'middle', class: 'tp-eje tp-eje-a' }, anio)); anioPrev = anio; }
    }
  });
  svg.append(S('text', { x: padL - 6, y: plotBot + 14, 'text-anchor': 'end', class: 'tp-eje' }, t('tp.g.eje-x')));

  // Eventos
  const filas = [[], []];
  semanas.forEach((s, i) => {
    s.eventos.forEach((e) => {
      if (e.inicio < s.lunes && i > 0) return; // un evento multisemana se marca en su primera semana visible
      const dia = Math.max(0, Math.min(6, diasEntre(s.lunes, e.inicio < s.lunes ? s.lunes : e.inicio)));
      const cx = xs(i) + ((dia + 0.5) / 7) * colW;
      const fila = filas.findIndex((f) => f.every((x) => Math.abs(x - cx) > 21)) ;
      const r = fila < 0 ? 1 : fila;
      filas[r].push(cx);
      const cy = yEv + r * 22 + 10;
      const g = S('g', { class: 'tp-evento', role: 'img', tabindex: 0, 'aria-label': `${e.nombre}. ${nombrePrioridad(e)}. ${fmtRango(e.inicio, e.fin)}${e.lugar ? '. ' + e.lugar : ''}`, 'data-evento': e.id });
      g.append(S('title', {}, `${e.nombre} · ${nombrePrioridad(e)} · ${fmtRango(e.inicio, e.fin)}`));
      if (e.tipo === 'competicion' && e.prioridad === 'A') g.append(S('line', { x1: cx, y1: cy + 10, x2: cx, y2: plotBot, class: 'tp-evento-l' }));
      g.append(formaMarcador(e, cx, cy));
      g.addEventListener('click', () => onSelect && onSelect(s.n));
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect && onSelect(s.n); } });
      svg.append(g);
    });
  });

  // Columnas interactivas (foco por teclado + tooltip)
  const caja = document.createElement('div');
  caja.className = 'tp-grafico';
  const tip = document.createElement('div');
  tip.className = 'tp-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  const colEls = [];
  const mostrar = (i) => {
    const s = semanas[i];
    const lin = [`${t('tp.semana-n', { n: s.n })} · ${fmtRango(s.desde, s.hasta)}`, nombreFase(s.fase),
      `${t('tp.previsto')}: ${s.plan.volumen > 0 ? fmtM(s.plan.volumen) : '—'}`, `${t('tp.real')}: ${fmtM(s.real.total)} (${t('tp.fuente.' + s.real.fuente)})`,
      `${t('tp.desviacion')}: ${fmtPct(s.desv.pct)} · ${textoEstado(s.estado)}`, ...s.eventos.map((e) => `${e.nombre} (${nombrePrioridad(e)})`)];
    tip.replaceChildren(...lin.map((x, k) => { const d = document.createElement(k === 0 ? 'strong' : 'div'); d.textContent = x; return d; }));
    tip.hidden = false;
    const w = svg.getBoundingClientRect().width || W;
    const px = ((xs(i) + colW / 2) / W) * w;
    tip.style.left = `${Math.max(4, Math.min(px - 90, Math.max(4, w - 190)))}px`;
  };
  const ocultar = () => { tip.hidden = true; };
  semanas.forEach((s, i) => {
    const g = S('g', { class: 'tp-col' + (s.n === sel ? ' tp-col-sel' : ''), role: 'button', tabindex: s.n === sel || (!semanas.some((x) => x.n === sel) && i === 0) ? 0 : -1, 'aria-label': ariaSemana(s), 'aria-pressed': s.n === sel ? 'true' : 'false', 'data-n': s.n });
    g.append(S('rect', { x: xs(i), y: plotTop - 2, width: colW, height: plotH + 32, class: 'tp-col-r' }));
    g.addEventListener('mouseenter', () => mostrar(i));
    g.addEventListener('mouseleave', ocultar);
    g.addEventListener('focus', () => mostrar(i));
    g.addEventListener('blur', ocultar);
    g.addEventListener('click', () => onSelect && onSelect(s.n));
    g.addEventListener('keydown', (ev) => {
      const ir = (j) => { const c = colEls[Math.max(0, Math.min(colEls.length - 1, j))]; if (c) { colEls.forEach((x) => x.setAttribute('tabindex', '-1')); c.setAttribute('tabindex', '0'); c.focus(); } };
      if (ev.key === 'ArrowRight') { ev.preventDefault(); ir(i + 1); } else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ir(i - 1); } else if (ev.key === 'Home') { ev.preventDefault(); ir(0); } else if (ev.key === 'End') { ev.preventDefault(); ir(colEls.length - 1); } else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect && onSelect(s.n); } else if (ev.key === 'Escape') ocultar();
    });
    colEls.push(g);
    svg.append(g);
  });
  caja.append(svg, tip);
  return caja;
}

// ---------- Línea de tiempo compacta (Gantt de fases + eventos) ----------
export function lineaTiempo({ m, onSelect }) {
  const sem = m.semanas;
  const W = 760, padL = 8, padR = 8, anchoUtil = W - padL - padR;
  const ini = sem[0].lunes, fin = sem[sem.length - 1].domingo;
  const dias = diasEntre(ini, fin) + 1;
  const x = (f) => padL + (Math.max(0, Math.min(dias, diasEntre(ini, f))) / dias) * anchoUtil;
  const H = 128;
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tp-svg-tl', role: 'img', 'aria-label': t('tp.tl.aria', { fases: m.fases.length, eventos: m.eventos.length, semanas: sem.length }) });
  svg.append(S('title', {}, t('tp.tl.titulo')));
  svg.append(S('desc', {}, [...m.fases.map((f) => `${f.nombre}: ${fmtRango(f.inicio, f.fin)}`), ...m.eventos.map((e) => `${e.nombre}: ${nombrePrioridad(e)}, ${fmtRango(e.inicio, e.fin)}`)].join('. ')));
  // Meses
  let mes = '';
  sem.forEach((s) => {
    const k = s.lunes.slice(0, 7);
    if (k !== mes) {
      mes = k;
      const xx = x(s.lunes);
      svg.append(S('line', { x1: xx, y1: 14, x2: xx, y2: H - 6, class: 'tp-grid' }), S('text', { x: xx + 3, y: 11, class: 'tp-eje' }, k.slice(5) === '01' || xx === padL ? `${fmtMes(s.lunes)} ${s.lunes.slice(2, 4)}` : fmtMes(s.lunes)));
    }
  });
  // Fases
  m.fases.forEach((f) => {
    if (f.fin < ini || f.inicio > fin) return;
    const x0 = x(f.inicio < ini ? ini : f.inicio), x1 = x(addDias(f.fin > fin ? fin : f.fin, 1));
    const g = S('g', { class: 'tp-tl-fase' });
    g.append(S('title', {}, `${f.nombre}: ${fmtRango(f.inicio, f.fin)}`), S('rect', { x: x0, y: 20, width: Math.max(2, x1 - x0 - 1), height: 30, rx: 5, fill: f.color, 'fill-opacity': 0.22, stroke: f.color, 'stroke-width': 1.5 }));
    const max = Math.floor((x1 - x0 - 8) / 6.4);
    if (max >= 3) g.append(S('text', { x: x0 + 6, y: 39, class: 'tp-fase-t' }, f.nombre.length > max ? f.nombre.slice(0, Math.max(1, max - 1)) + '…' : f.nombre));
    svg.append(g);
  });
  // Eventos (dos filas para evitar solapes)
  const filas = [[], [], []];
  m.eventos.slice().sort((a, b) => (a.inicio < b.inicio ? -1 : 1)).forEach((e) => {
    if (e.inicio < ini || e.inicio > fin) return;
    const cx = x(e.inicio) + (e.fin > e.inicio ? 0 : 0);
    let r = filas.findIndex((f) => f.every((v) => Math.abs(v - cx) > 22));
    if (r < 0) r = 2;
    filas[r].push(cx);
    const cy = 66 + r * 20;
    const g = S('g', { class: 'tp-evento', 'data-evento': e.id });
    g.append(S('title', {}, `${e.nombre} · ${nombrePrioridad(e)} · ${fmtRango(e.inicio, e.fin)}`));
    if (e.fin > e.inicio) g.append(S('line', { x1: cx, y1: cy, x2: x(addDias(e.fin, 1)), y2: cy, stroke: e.tipo === 'competicion' ? COLOR_PRIORIDAD[e.prioridad] || COLOR_EVENTO.competicion : COLOR_EVENTO[e.tipo], 'stroke-width': 3 }));
    g.append(formaMarcador(e, cx, cy, 7));
    g.addEventListener('click', () => { const s = sem.find((w) => e.inicio >= w.lunes && e.inicio <= w.domingo); if (s && onSelect) onSelect(s.n); });
    svg.append(g);
  });
  // Hoy
  if (m.hoy >= ini && m.hoy <= fin) svg.append(S('line', { x1: x(m.hoy), y1: 14, x2: x(m.hoy), y2: H - 4, class: 'tp-tl-hoy' }), S('text', { x: x(m.hoy) + 3, y: H - 8, class: 'tp-hoy-t', 'text-anchor': m.hoy > addDias(ini, Math.floor(dias * 0.85)) ? 'end' : 'start' }, t('tp.hoy')));
  return svg;
}

// ---------- Leyenda ----------
export function leyenda({ m, h, desde, hasta }) {
  const sem = m.semanas.filter((s) => s.n >= desde && s.n <= hasta);
  const usados = new Set();
  sem.forEach((s) => Object.keys(s.real.metros).forEach((k) => { if (s.real.metros[k] > 0) usados.add(k); }));
  const item = (...hijos) => h('li', { class: 'tp-ley-i' }, hijos);
  const sw = (col) => h('span', { class: 'tp-sw', style: { background: col } });
  const lista = ordenarTipos(m.tipos).filter((tp) => usados.has(tp.id)).map((tp) => item(sw(tp.color), tContenido(tp)));
  if (sem.some((s) => s.real.sinClasificar > 0)) lista.push(item(h('span', { class: 'tp-sw tp-sw-hatch' }), t('tp.sin-clasificar')));
  lista.push(item(h('span', { class: 'tp-sw-linea' }), t('tp.g.previsto')));
  lista.push(item(h('span', { class: 'tp-sw tp-sw-dash' }), t('tp.g.planificado')));
  ['A', 'B', 'C'].forEach((p) => lista.push(item(insigniaEvento({ tipo: 'competicion', prioridad: p }, h), t('tp.g.prioridad-leyenda', { p }))));
  ['concentracion', 'test', 'descanso', 'otro'].forEach((tp) => lista.push(item(insigniaEvento({ tipo: tp, prioridad: '' }, h), t('tp.evento.' + tp))));
  const fases = m.fases.filter((f) => sem.some((s) => s.fase && s.fase.id === f.id)).map((f) => item(sw(f.color), f.nombre));
  return h('ul', { class: 'tp-ley', 'aria-label': t('tp.g.leyenda') }, lista, fases);
}

export { sinOrden };
