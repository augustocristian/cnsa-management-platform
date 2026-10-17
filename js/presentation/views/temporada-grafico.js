// Season charts (own SVG, accessible and responsive). They only present: they receive the model of temporadaService.resumen() and
// return DOM nodes. Colours come from CSS classes on design tokens (css/views/temporada.css) so light and dark both work; the
// colours of content types and phases are STORED data and are applied inline. Events are told apart by SHAPE and TEXT, not colour:
// A = diamond, B = square, C = circle, each with its letter; other kinds are a rounded box with an abbreviation.
import { h } from '../ui.js';
import { t, tNum, tContenido } from '../i18n/i18n.js';
import {
  tonoEvento,
  diasEntre,
  addDias,
  escalaEjeY,
  bandasDeFase,
  filaLibre,
  semanasEnRango,
} from '../../domain/temporada.js';
import { ordenarTipos } from '../../domain/cargas.js';
import { fmtCorta, fmtNumerica, fmtLarga, fmtMes, fmtRango } from './formatos-fecha.js';

export { fmtCorta, fmtNumerica, fmtLarga, fmtMes, fmtRango };

// ---------- Formats ----------
export const fmtM = (v) => `${tNum(Math.round(v || 0))} m`;
export const fmtPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${tNum(Math.round(p))} %`);
export const textoEstado = (e) => t('tp.estado.' + e);
export const nombreFase = (f) => (f ? f.nombre : t('tp.sin-fase'));
export const nombrePrioridad = (e) =>
  e.tipo === 'competicion' && e.prioridad ? t('tp.prioridad-n', { p: e.prioridad }) : t('tp.evento.' + e.tipo);

export function ariaSemana(s) {
  const evs = s.eventos.map((e) => `${e.nombre} (${nombrePrioridad(e)})`).join('; ');
  return t('tp.g.semana-aria', {
    n: s.n,
    fechas: fmtRango(s.desde, s.hasta),
    fase: nombreFase(s.fase),
    previsto: s.plan.volumen > 0 ? fmtM(s.plan.volumen) : t('tp.sin-previsto'),
    real: fmtM(s.real.total),
    estado: textoEstado(s.estado),
    desv: fmtPct(s.desv.pct),
    eventos: evs || t('tp.sin-eventos'),
  });
}

// ---------- Event markers ----------
export function formaMarcador(e, cx, cy, r = 8) {
  const g = h('g', { class: 'tp-marca tp-t-' + tonoEvento(e) });
  if (e.tipo === 'competicion' && e.prioridad) {
    const forma =
      e.prioridad === 'A'
        ? h('polygon', {
            points: `${cx},${cy - r - 2} ${cx + r + 2},${cy} ${cx},${cy + r + 2} ${cx - r - 2},${cy}`,
            class: 'tp-marca-f',
          })
        : e.prioridad === 'B'
          ? h('rect', { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, rx: 1.5, class: 'tp-marca-f' })
          : h('circle', { cx, cy, r, class: 'tp-marca-f' });
    g.append(forma, h('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle', class: 'tp-marca-t' }, e.prioridad));
  } else {
    g.append(
      h('rect', { x: cx - 10, y: cy - 7, width: 20, height: 14, rx: 4, class: 'tp-marca-f' }),
      h(
        'text',
        { x: cx, y: cy + 3.5, 'text-anchor': 'middle', class: 'tp-marca-t tp-marca-s' },
        t('tp.evento-abrev.' + e.tipo),
      ),
    );
  }
  return g;
}

// Small icon for legends and lists.
export function insigniaEvento(e) {
  return h(
    'svg',
    { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false', class: 'tp-insignia' },
    formaMarcador(e, 12, 12, 7),
  );
}

// Truncates text to what fits in `px` pixels at ~6.4 px per character.
function recortar(texto, px) {
  const max = Math.floor(px / 6.4);
  if (max < 3) return '';
  return texto.length > max ? texto.slice(0, Math.max(1, max - 1)) + '…' : texto;
}

// ---------- Stacked bar chart ----------
// opciones: {m, desde, hasta (week numbers), sel (n), onSelect(n)} -> <div class="tp-grafico">
export function graficoSemanas({ m, desde, hasta, sel, onSelect }) {
  const semanas = semanasEnRango(m, desde, hasta);
  const count = Math.max(1, semanas.length);
  const colW = Math.max(22, Math.min(64, Math.floor(880 / count)));
  const padL = 58,
    padR = 14,
    hFase = 22,
    yEv = 30,
    plotTop = 82,
    plotH = 210,
    plotBot = plotTop + plotH,
    H = plotBot + 56;
  const W = padL + padR + count * colW;
  const tipos = ordenarTipos(m.tipos);
  const max = Math.max(1, ...semanas.map((s) => Math.max(s.plan.volumen || 0, s.real.total || 0))) * 1.08;
  const { top, ticks } = escalaEjeY(max);
  const y = (v) => plotBot - (v / top) * plotH;
  const xs = (i) => padL + i * colW;
  const svg = h('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    class: 'tp-svg',
    role: 'group',
    'aria-label': t('tp.g.aria', {
      desde: semanas[0] ? semanas[0].n : 0,
      hasta: semanas.length ? semanas[semanas.length - 1].n : 0,
    }),
  });

  // Phase bands (colour = stored phase colour)
  bandasDeFase(semanas).forEach((g) => {
    if (!g.fase) return;
    const x = xs(g.ini),
      w = (g.fin - g.ini + 1) * colW;
    svg.append(
      h('rect', { x, y: plotTop, width: w, height: plotH, fill: g.fase.color, 'fill-opacity': 0.09 }),
      h('rect', { x, y: 0, width: w, height: hFase, fill: g.fase.color, 'fill-opacity': 0.2 }),
      h('rect', { x, y: 0, width: w, height: 3, fill: g.fase.color }),
      h('line', {
        x1: x,
        y1: 0,
        x2: x,
        y2: plotBot,
        stroke: g.fase.color,
        'stroke-opacity': 0.55,
        'stroke-dasharray': '2 3',
      }),
      h('text', { x: x + 6, y: 16, class: 'tp-fase-t' }, recortar(g.fase.nombre, w - 10)),
    );
  });

  // Grid and Y axis
  ticks.forEach((v) => {
    svg.append(
      h('line', { x1: padL, y1: y(v), x2: W - padR, y2: y(v), class: 'tp-grid' }),
      h(
        'text',
        { x: padL - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'tp-eje' },
        v >= 1000 ? `${tNum(v / 1000)}k` : String(v),
      ),
    );
  });
  svg.append(
    h(
      'text',
      {
        x: 12,
        y: plotTop + plotH / 2,
        class: 'tp-eje',
        transform: `rotate(-90 12 ${plotTop + plotH / 2})`,
        'text-anchor': 'middle',
      },
      t('tp.g.eje-y'),
    ),
  );

  // Current week
  semanas.forEach((s, i) => {
    if (s.tiempo === 'actual')
      svg.append(
        h('rect', { x: xs(i), y: plotTop - 4, width: colW, height: plotH + 30, class: 'tp-hoy' }),
        h('text', { x: xs(i) + colW / 2, y: plotTop - 8, 'text-anchor': 'middle', class: 'tp-hoy-t' }, t('tp.hoy')),
      );
  });

  // Stacked bars (real) + dashed outline when they come from training plans
  semanas.forEach((s, i) => {
    const bw = Math.max(8, Math.round(colW * 0.62)),
      bx = xs(i) + (colW - bw) / 2;
    let acum = 0;
    const grupo = h('g', { class: 'tp-barra', 'data-n': s.n });
    tipos.forEach((tp) => {
      const v = s.real.metros[tp.id] || 0;
      if (v <= 0) return;
      grupo.append(
        h('rect', {
          x: bx,
          y: y(acum + v),
          width: bw,
          height: Math.max(0.5, y(acum) - y(acum + v)),
          fill: tp.color,
          'fill-opacity': s.real.fuente === 'planes' ? 0.55 : 0.95,
        }),
      );
      acum += v;
    });
    if (s.real.sinClasificar > 0) {
      grupo.append(
        h('rect', {
          x: bx,
          y: y(acum + s.real.sinClasificar),
          width: bw,
          height: Math.max(0.5, y(acum) - y(acum + s.real.sinClasificar)),
          class: 'tp-sin-clasif',
        }),
      );
      acum += s.real.sinClasificar;
    }
    if (acum > 0 && s.real.fuente === 'planes')
      grupo.append(h('rect', { x: bx, y: y(acum), width: bw, height: y(0) - y(acum), class: 'tp-planificado' }));
    svg.append(grupo);
  });

  // Planned volume line (continuous stretches)
  let tramo = [];
  const cerrar = () => {
    if (tramo.length > 1) svg.append(h('polyline', { points: tramo.join(' '), class: 'tp-previsto' }));
    tramo = [];
  };
  semanas.forEach((s, i) => {
    if (s.plan.volumen > 0) tramo.push(`${xs(i) + colW / 2},${y(s.plan.volumen)}`);
    else cerrar();
  });
  cerrar();
  semanas.forEach((s, i) => {
    if (s.plan.volumen > 0)
      svg.append(h('circle', { cx: xs(i) + colW / 2, cy: y(s.plan.volumen), r: 3.2, class: 'tp-previsto-p' }));
  });

  // X axis: week number and date
  svg.append(h('line', { x1: padL, y1: plotBot, x2: W - padR, y2: plotBot, class: 'tp-eje-l' }));
  const paso = colW >= 44 ? 1 : colW >= 30 ? 2 : 3;
  let anioPrev = '';
  semanas.forEach((s, i) => {
    const cx = xs(i) + colW / 2;
    svg.append(h('text', { x: cx, y: plotBot + 14, 'text-anchor': 'middle', class: 'tp-eje tp-eje-n' }, String(s.n)));
    const anio = s.lunes.slice(0, 4);
    if (i % paso === 0 || (i === semanas.length - 1 && paso === 1)) {
      svg.append(h('text', { x: cx, y: plotBot + 27, 'text-anchor': 'middle', class: 'tp-eje' }, fmtNumerica(s.lunes)));
      if (anio !== anioPrev) {
        svg.append(h('text', { x: cx, y: plotBot + 40, 'text-anchor': 'middle', class: 'tp-eje tp-eje-a' }, anio));
        anioPrev = anio;
      }
    }
  });
  svg.append(h('text', { x: padL - 6, y: plotBot + 14, 'text-anchor': 'end', class: 'tp-eje' }, t('tp.g.eje-x')));

  // Tooltip (shared by columns and events)
  const tip = h('div', { class: 'tp-tip', hidden: true, role: 'tooltip' });
  const colocar = (cx) => {
    const w = svg.getBoundingClientRect().width || W;
    tip.style.left = `${Math.max(4, Math.min((cx / W) * w - 90, Math.max(4, w - 190)))}px`;
  };
  const mostrarTip = (lineas, cx) => {
    tip.replaceChildren(...lineas.map((x, k) => h(k === 0 ? 'strong' : 'div', null, x)));
    tip.hidden = false;
    colocar(cx);
  };
  const ocultar = () => {
    tip.hidden = true;
  };

  // Events (two rows to avoid overlaps)
  const filas = [[], []];
  semanas.forEach((s, i) => {
    s.eventos.forEach((e) => {
      if (e.inicio < s.lunes && i > 0) return; // a multi-week event is marked on its first visible week
      const dia = Math.max(0, Math.min(6, diasEntre(s.lunes, e.inicio < s.lunes ? s.lunes : e.inicio)));
      const cx = xs(i) + ((dia + 0.5) / 7) * colW;
      const cy = yEv + filaLibre(filas, cx, 21) * 22 + 10;
      const g = h('g', {
        class: 'tp-evento',
        role: 'img',
        tabindex: 0,
        'aria-label': `${e.nombre}. ${nombrePrioridad(e)}. ${fmtRango(e.inicio, e.fin)}${e.lugar ? '. ' + e.lugar : ''}`,
        'data-evento': e.id,
      });
      if (e.tipo === 'competicion' && e.prioridad === 'A')
        g.append(h('line', { x1: cx, y1: cy + 10, x2: cx, y2: plotBot, class: 'tp-evento-l' }));
      g.append(formaMarcador(e, cx, cy));
      const info = [e.nombre, `${nombrePrioridad(e)} · ${fmtRango(e.inicio, e.fin)}`, ...(e.lugar ? [e.lugar] : [])];
      g.addEventListener('mouseenter', () => mostrarTip(info, cx));
      g.addEventListener('mouseleave', ocultar);
      g.addEventListener('focus', () => mostrarTip(info, cx));
      g.addEventListener('blur', ocultar);
      g.addEventListener('click', () => onSelect && onSelect(s.n));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onSelect && onSelect(s.n);
        }
      });
      svg.append(g);
    });
  });

  // Interactive columns (roving tabindex, keyboard selection, tooltip)
  const colEls = [];
  semanas.forEach((s, i) => {
    const g = h('g', {
      class: 'tp-col' + (s.n === sel ? ' tp-col-sel' : ''),
      role: 'button',
      tabindex: s.n === sel || (!semanas.some((x) => x.n === sel) && i === 0) ? 0 : -1,
      'aria-label': ariaSemana(s),
      'aria-pressed': s.n === sel ? 'true' : 'false',
      'data-n': s.n,
    });
    g.append(h('rect', { x: xs(i), y: plotTop - 2, width: colW, height: plotH + 32, class: 'tp-col-r' }));
    const info = () => [
      `${t('tp.semana-n', { n: s.n })} · ${fmtRango(s.desde, s.hasta)}`,
      nombreFase(s.fase),
      `${t('tp.previsto')}: ${s.plan.volumen > 0 ? fmtM(s.plan.volumen) : '—'}`,
      `${t('tp.real')}: ${fmtM(s.real.total)} (${t('tp.fuente.' + s.real.fuente)})`,
      `${t('tp.desviacion')}: ${fmtPct(s.desv.pct)} · ${textoEstado(s.estado)}`,
      ...s.eventos.map((e) => `${e.nombre} (${nombrePrioridad(e)})`),
    ];
    g.addEventListener('mouseenter', () => mostrarTip(info(), xs(i) + colW / 2));
    g.addEventListener('mouseleave', ocultar);
    g.addEventListener('focus', () => mostrarTip(info(), xs(i) + colW / 2));
    g.addEventListener('blur', ocultar);
    g.addEventListener('click', () => onSelect && onSelect(s.n));
    g.addEventListener('keydown', (ev) => {
      const ir = (j) => {
        const c = colEls[Math.max(0, Math.min(colEls.length - 1, j))];
        if (c) {
          colEls.forEach((x) => x.setAttribute('tabindex', '-1'));
          c.setAttribute('tabindex', '0');
          c.focus();
        }
      };
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        ir(i + 1);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        ir(i - 1);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        ir(0);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        ir(colEls.length - 1);
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onSelect && onSelect(s.n);
      } else if (ev.key === 'Escape') ocultar();
    });
    colEls.push(g);
    svg.append(g);
  });
  return h('div', { class: 'tp-grafico' }, svg, tip);
}

// ---------- Compact timeline (phases Gantt + events) ----------
export function lineaTiempo({ m, onSelect }) {
  const sem = m.semanas;
  const W = 760,
    padL = 8,
    padR = 8,
    anchoUtil = W - padL - padR;
  const ini = sem[0].lunes,
    fin = sem[sem.length - 1].domingo;
  const dias = diasEntre(ini, fin) + 1;
  const x = (f) => padL + (Math.max(0, Math.min(dias, diasEntre(ini, f))) / dias) * anchoUtil;
  const H = 128;
  const svg = h('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'tp-svg-tl',
    role: 'img',
    'aria-label': t('tp.tl.aria', { fases: m.fases.length, eventos: m.eventos.length, semanas: sem.length }),
  });
  // Months
  let mes = '';
  sem.forEach((s) => {
    const k = s.lunes.slice(0, 7);
    if (k === mes) return;
    mes = k;
    const xx = x(s.lunes);
    svg.append(
      h('line', { x1: xx, y1: 14, x2: xx, y2: H - 6, class: 'tp-grid' }),
      h(
        'text',
        { x: xx + 3, y: 11, class: 'tp-eje' },
        k.slice(5) === '01' || xx === padL ? `${fmtMes(s.lunes)} ${s.lunes.slice(2, 4)}` : fmtMes(s.lunes),
      ),
    );
  });
  // Phases
  m.fases.forEach((f) => {
    if (f.fin < ini || f.inicio > fin) return;
    const x0 = x(f.inicio < ini ? ini : f.inicio),
      x1 = x(addDias(f.fin > fin ? fin : f.fin, 1));
    svg.append(
      h(
        'g',
        { class: 'tp-tl-fase' },
        h('rect', {
          x: x0,
          y: 20,
          width: Math.max(2, x1 - x0 - 1),
          height: 30,
          rx: 5,
          fill: f.color,
          'fill-opacity': 0.22,
          stroke: f.color,
          'stroke-width': 1.5,
        }),
        h('text', { x: x0 + 6, y: 39, class: 'tp-fase-t' }, recortar(f.nombre, x1 - x0 - 8)),
      ),
    );
  });
  // Events (three rows to avoid overlaps)
  const filas = [[], [], []];
  m.eventos
    .slice()
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
    .forEach((e) => {
      if (e.inicio < ini || e.inicio > fin) return;
      const cx = x(e.inicio);
      const cy = 66 + filaLibre(filas, cx, 22) * 20;
      const g = h('g', { class: 'tp-evento tp-t-' + tonoEvento(e), 'data-evento': e.id });
      if (e.fin > e.inicio)
        g.append(h('line', { x1: cx, y1: cy, x2: x(addDias(e.fin, 1)), y2: cy, class: 'tp-evento-rango' }));
      g.append(formaMarcador(e, cx, cy, 7));
      g.addEventListener('click', () => {
        const s = sem.find((w) => e.inicio >= w.lunes && e.inicio <= w.domingo);
        if (s && onSelect) onSelect(s.n);
      });
      svg.append(g);
    });
  // Today
  if (m.hoy >= ini && m.hoy <= fin)
    svg.append(
      h('line', { x1: x(m.hoy), y1: 14, x2: x(m.hoy), y2: H - 4, class: 'tp-tl-hoy' }),
      h(
        'text',
        {
          x: x(m.hoy) + 3,
          y: H - 8,
          class: 'tp-hoy-t',
          'text-anchor': m.hoy > addDias(ini, Math.floor(dias * 0.85)) ? 'end' : 'start',
        },
        t('tp.hoy'),
      ),
    );
  return svg;
}

// ---------- Legend ----------
export function leyenda({ m, desde, hasta }) {
  const sem = semanasEnRango(m, desde, hasta);
  const usados = new Set();
  sem.forEach((s) =>
    Object.keys(s.real.metros).forEach((k) => {
      if (s.real.metros[k] > 0) usados.add(k);
    }),
  );
  const item = (...hijos) => h('li', { class: 'tp-ley-i' }, hijos);
  const sw = (col) => h('span', { class: 'tp-sw', style: { background: col } });
  const lista = ordenarTipos(m.tipos)
    .filter((tp) => usados.has(tp.id))
    .map((tp) => item(sw(tp.color), tContenido(tp)));
  if (sem.some((s) => s.real.sinClasificar > 0))
    lista.push(item(h('span', { class: 'tp-sw tp-sw-hatch' }), t('tp.sin-clasificar')));
  lista.push(item(h('span', { class: 'tp-sw-linea' }), t('tp.g.previsto')));
  lista.push(item(h('span', { class: 'tp-sw tp-sw-dash' }), t('tp.g.planificado')));
  ['A', 'B', 'C'].forEach((p) =>
    lista.push(item(insigniaEvento({ tipo: 'competicion', prioridad: p }), t('tp.g.prioridad-leyenda', { p }))),
  );
  ['concentracion', 'test', 'descanso', 'otro'].forEach((tp) =>
    lista.push(item(insigniaEvento({ tipo: tp, prioridad: '' }), t('tp.evento.' + tp))),
  );
  const fases = m.fases
    .filter((f) => sem.some((s) => s.fase && s.fase.id === f.id))
    .map((f) => item(sw(f.color), f.nombre));
  return h('ul', { class: 'tp-ley', 'aria-label': t('tp.g.leyenda') }, lista, fases);
}
