// Home dashboard view. Presentation only: the model comes from application/inicioService.js (clock and repository
// injected: ctx.ahora, ctx.inicio, ctx.prefs) and the rules live in domain/inicio.js. Styles: css/views/inicio.css.
import { icon } from '../icons.js';
import { t, tDate, tNum, tContenido, locale } from '../i18n.js';
import { useStyles } from '../styles.js';
import { crearInicioService } from '../application/inicioService.js';
import { fechaDe } from '../domain/inicio.js';
import preferencias from '../preferencias.js';
import { primerosPasos } from './primerospasos.js';
import { graficoSemanal, donutAsistencia } from './inicio-grafico.js';

const fmtM = (n) => tNum(Math.round(Number(n) || 0), { useGrouping: 'always', maximumFractionDigits: 0 });
const plural = (base, n) => t(`${base}.${n === 1 ? 'uno' : 'otros'}`, { n: tNum(n) });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Today", "Tomorrow" or "Thursday 22 October" for a session `dias` days from today.
function cuando(dias, fecha) {
  if (dias === 0) return t('home.hoy-palabra');
  if (dias === 1) return t('home.manana');
  return capital(new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(fechaDe(fecha)));
}

function relativo(dias, fecha) {
  if (dias == null) return '';
  if (dias > 30) return tDate(fecha);
  return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-dias, 'day');
}

const volumenTexto = (s) => {
  if (s.volumenMin && s.volumenMax && s.volumenMin !== s.volumenMax) return `${fmtM(s.volumenMin)}-${fmtM(s.volumenMax)} m`;
  const v = s.volumenMax || s.volumenMin;
  return v ? `${fmtM(v)} m` : '';
};
const detalleSesion = (s) => [s.piscina ? t('home.piscina-m', { m: s.piscina }) : '', volumenTexto(s), s.enfoque || s.titulo].filter(Boolean).join(' · ');

const MOMENTOS = { pasada: ['neutral', 'home.momento.pasada'], 'en-curso': ['ok', 'home.momento.en-curso'], pendiente: ['info', 'home.momento.pendiente'] };

export async function render(container, params, ctx) {
  useStyles('inicio');
  const { h, empty } = ctx.ui;
  const prefs = ctx.prefs || preferencias;
  const svc = ctx.inicio || crearInicioService(ctx.store, { ahora: ctx.ahora, prefs, cargas: ctx.cargas });
  const M = svc.panel();

  const enlace = (href, texto, clase = 'btn btn--primary', ic = null) => h('a', { class: clase, href }, ic ? icon(ic, { size: 18 }) : null, texto);
  const tarjeta = (id, titulo, clase, ...hijos) => h('section', { class: `card ini-card ${clase || ''}`.trim(), id: `ini-${id}`, 'aria-labelledby': `ini-${id}-t` },
    h('div', { class: 'card-head' }, h('h2', { id: `ini-${id}-t` }, titulo)), ...hijos);
  const vacio = (ic, titulo, texto, href, cta) => empty({ icon: ic, title: titulo, text: texto, action: enlace(href, cta) });

  const barra = (pct, etiqueta) => {
    const b = h('div', { class: 'progress progress--ok', role: 'progressbar', 'aria-label': etiqueta, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span'));
    b.style.setProperty('--value', `${pct}%`);
    return b;
  };

  // ----- Banner -----
  const titular = M.titular.sesiones
    ? t('home.titular.hoy', { sesiones: plural('home.n-sesiones', M.titular.sesiones), esperados: plural('home.n-esperados', M.titular.esperados) })
    : M.proxima ? t('home.titular.sin-hoy', { cuando: cuando(M.proxima.dias, M.proxima.fecha), hora: M.proxima.hora || '-' }) : t('home.titular.nada');
  const kpi = (valor, etiqueta) => h('div', { class: 'ini-kpi' }, h('dd', null, tNum(valor)), h('dt', null, etiqueta));
  const titulo = h('h1', { tabindex: '-1' }, M.club.nombre || t('nav.inicio'));
  const wave = (d, clase) => h('path', { class: clase, d });
  const banner = h('header', { class: 'ini-banner' },
    h('svg', { class: 'ini-wave', viewBox: '0 0 400 80', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      wave('M0 30 q25 -16 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0', 'ini-wave-1'),
      wave('M0 52 q25 -16 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0', 'ini-wave-2'),
      wave('M0 74 q25 -16 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0', 'ini-wave-3')),
    h('div', { class: 'ini-banner-main' },
      h('p', { class: 'ini-eyebrow' }, capital(tDate(fechaDe(M.hoy), 'long'))),
      titulo,
      h('p', { class: 'ini-headline' }, titular)),
    h('dl', { class: 'ini-kpis' },
      kpi(M.kpis.nadadoresActivos, t('home.kpi.nadadores')),
      kpi(M.kpis.semana.total, t('home.kpi.semana'))));

  // ----- Today -----
  const hoyCard = tarjeta('hoy', t('home.hoy.titulo'), '');
  const bloqueProxima = (p) => h('div', { class: 'ini-proxima' },
    h('h3', null, t('home.proxima.titulo')),
    h('p', { class: 'ini-proxima-cuando' }, h('strong', null, `${cuando(p.dias, p.fecha)}${p.hora ? ` · ${p.hora}` : ''}`), p.grupoNombre ? ` · ${p.grupoNombre}` : ` · ${t('home.todos')}`),
    detalleSesion(p) ? h('p', { class: 'muted' }, detalleSesion(p)) : null);
  if (M.hoySesiones.length) {
    hoyCard.append(h('ul', { class: 'ini-sesiones' }, M.hoySesiones.map((s) => {
      const [tono, clave] = MOMENTOS[s.momento];
      return h('li', { class: `ini-sesion ini-sesion--${s.momento}` },
        h('div', { class: 'ini-sesion-hora' }, h('time', null, s.hora || '--:--')),
        h('div', { class: 'ini-sesion-info' },
          h('p', { class: 'ini-sesion-titulo' }, s.grupoNombre || t('home.todos')),
          detalleSesion(s) ? h('p', { class: 'muted ini-sesion-detalle' }, detalleSesion(s)) : null),
        h('span', { class: `badge badge--${tono}` }, t(clave)));
    })));
    const aSesion = M.sesionAsistencia;
    hoyCard.append(h('div', { class: 'ini-acciones-card' }, enlace(`#/asistencia/${aSesion.id}`, t('home.hoy.pasar-lista'), 'btn btn--primary', 'asistencia')));
    if (M.proxima && !M.hoySesiones.some((s) => s.momento !== 'pasada')) hoyCard.append(bloqueProxima(M.proxima));
  } else if (M.proxima) {
    hoyCard.append(h('p', { class: 'muted' }, t('home.hoy.sin-sesiones')), bloqueProxima(M.proxima),
      h('div', { class: 'ini-acciones-card' }, enlace('#/entrenamientos', t('home.hoy.ver-sesiones'), 'btn', 'entrenamientos')));
  } else {
    hoyCard.append(vacio('entrenamientos', t('home.hoy.sin-sesiones'), t('home.hoy.sin-sesiones-texto'), '#/entrenamientos', t('home.hoy.programar')));
  }

  // ----- Attendance today -----
  const asisCard = tarjeta('asistencia', t('home.asis.titulo'), '');
  const A = M.asistencia;
  if (!M.hoySesiones.length) {
    asisCard.append(vacio('asistencia', t('home.asis.sin-sesiones'), t('home.asis.sin-sesiones-texto'), '#/asistencia', t('home.asis.abrir')));
  } else if (!A.total.esperados) {
    asisCard.append(vacio('nadadores', t('home.asis.sin-nadadores'), t('home.asis.sin-nadadores-texto'), '#/nadadores', t('home.asis.anadir-nadadores')));
  } else {
    const fila = (clase, etiqueta, n) => h('li', null, h('span', { class: `ini-dot ini-dot--${clase}`, 'aria-hidden': 'true' }), h('span', { class: 'ini-leg-et' }, etiqueta), h('strong', { class: 'num' }, tNum(n)));
    asisCard.append(
      h('div', { class: 'ini-asis' },
        donutAsistencia(A.total),
        h('ul', { class: 'ini-leg' },
          fila('presente', t('home.asis.presentes'), A.total.presentes), fila('ausente', t('home.asis.ausentes'), A.total.ausentes),
          fila('justificado', t('home.asis.justificados'), A.total.justificados), fila('sin', t('home.asis.sin-confirmar'), A.total.sinConfirmar))),
      h('ul', { class: 'ini-asis-sesiones' }, M.hoySesiones.map((s) => {
        const a = s.asistencia;
        return h('li', null,
          h('div', { class: 'ini-asis-linea' }, h('span', null, `${s.hora || '--:--'} · ${s.grupoNombre || t('home.todos')}`),
            h('span', { class: 'num' }, t('home.asis.de', { presentes: a.presentes, esperados: a.esperados }) + (a.porcentaje == null ? '' : ` · ${a.porcentaje}%`))),
          barra(a.porcentaje ?? 0, `${s.hora || ''} ${s.grupoNombre || t('home.todos')}`.trim()));
      })));
  }

  // ----- Load alerts -----
  const alertCard = tarjeta('alertas', t('home.alertas.titulo'), '');
  const C = M.carga;
  const dot = (tipo) => { const d = h('span', { class: 'ini-dot', 'aria-hidden': 'true' }); d.style.setProperty('--dot', tipo.color); return d; };
  if (!C.hayObjetivos) {
    alertCard.append(vacio('cargas', t('home.alertas.sin-objetivos'), t('home.alertas.sin-objetivos-texto'), '#/cargas', t('home.alertas.definir')));
  } else if (!C.serie.hayCargas) {
    alertCard.append(h('div', { class: 'alert alert--info' }, icon('info', { size: 20 }), h('div', null, h('p', { class: 'alert-title' }, t('home.alertas.sin-cargas')), h('p', null, t('home.alertas.sin-cargas-texto')))),
      h('div', { class: 'ini-acciones-card' }, enlace('#/cargas/nueva', t('home.acc.carga'), 'btn', 'cargas')));
  } else if (!C.alertas.length) {
    alertCard.append(h('div', { class: 'alert alert--ok' }, icon('check', { size: 20 }), h('div', null, h('p', { class: 'alert-title' }, t('home.alertas.todo-ok')))));
  } else {
    alertCard.append(h('ul', { class: 'ini-alertas' }, C.alertas.map((a) => h('li', { class: `alert alert--${a.estado === 'alto' ? 'danger' : 'warn'}` },
      icon('aviso', { size: 20 }),
      h('div', null, h('p', { class: 'alert-title ini-alert-tipo' }, dot(a.tipo), tContenido(a.tipo)),
        h('p', null, t(a.estado === 'alto' ? 'tc.exceso' : 'tc.faltan', { m: fmtM(a.diferencia) })),
        h('p', { class: 'muted ini-alert-detalle' }, t('home.alertas.detalle', { m: fmtM(a.metros) })))))),
    h('div', { class: 'ini-acciones-card' }, enlace('#/cargas', t('home.alertas.ver-cargas'), 'btn btn-sm', 'cargas')));
  }

  // ----- Quick actions (things you DO; the modules are already in the menu) -----
  const acciones = [
    ['asistencia', t('home.acc.asistencia'), M.sesionAsistencia ? `#/asistencia/${M.sesionAsistencia.id}` : '#/asistencia'],
    ['cargas', t('home.acc.carga'), '#/cargas/nueva'],
    ['marcas', t('home.acc.marca'), '#/marcas/nueva'],
    ['comunicaciones', t('home.acc.aviso'), '#/comunicaciones/nueva'],
  ];
  const accCard = tarjeta('acciones', t('home.acc.titulo'), '',
    h('ul', { class: 'ini-acciones' }, acciones.map(([ic, txt, href]) => h('li', null,
      h('a', { class: 'ini-accion', href }, h('span', { class: 'ini-accion-ico' }, icon(ic, { size: 22 })), h('span', null, txt))))));

  // ----- Weekly load chart -----
  const chartCard = tarjeta('grafico', t('home.grafico.titulo'), 'ini-span-2');
  chartCard.querySelector('.card-head').append(h('div', { class: 'card-head-actions' }, enlace('#/cargas', t('home.alertas.ver-cargas'), 'btn btn-sm btn--ghost')));
  if (!C.serie.hayCargas && !C.hayObjetivos) {
    chartCard.append(vacio('grafica', t('home.grafico.vacio'), t('home.grafico.vacio-texto'), '#/cargas/nueva', t('home.acc.carga')));
  } else {
    chartCard.append(h('p', { class: 'muted ini-sub' }, t('home.grafico.sub')), graficoSemanal(h, C));
    if (!C.serie.hayCargas) chartCard.append(h('p', { class: 'muted' }, t('home.grafico.sin-cargas')));
  }

  // ----- Recent notes -----
  const avisosCard = tarjeta('avisos', t('home.avisos.titulo'), 'ini-span-2');
  if (!M.avisos.length) {
    avisosCard.append(vacio('comunicaciones', t('home.avisos.vacio'), t('home.avisos.vacio-texto'), '#/comunicaciones/nueva', t('home.avisos.escribir')));
  } else {
    avisosCard.append(h('ul', { class: 'ini-avisos' }, M.avisos.map((a) => h('li', { class: 'ini-aviso' },
      h('div', { class: 'ini-aviso-cab' },
        h('p', { class: 'ini-aviso-titulo' }, a.titulo || t('home.avisos.sin-titulo')),
        h('time', { class: 'muted', datetime: a.fecha }, relativo(a.dias, a.fecha))),
      h('p', { class: 'ini-aviso-texto muted' }, a.vistaPrevia),
      h('span', { class: 'badge badge--info' }, a.destino.tipo === 'grupo' ? a.destino.nombre : t('home.todos'))))),
    h('div', { class: 'ini-acciones-card' }, enlace('#/comunicaciones', t('home.avisos.ver-todos'), 'btn btn-sm', 'comunicaciones')));
  }

  // ----- Next season event -----
  const evCard = tarjeta('evento', t('home.evento.titulo'), '');
  const E = M.evento;
  if (!E) {
    evCard.append(vacio('calendario', t('home.evento.vacio'), t('home.evento.vacio-texto'), '#/planificacion', t('home.evento.planificar')));
  } else {
    const rango = E.fin && E.fin !== E.inicio ? `${tDate(E.inicio)} - ${tDate(E.fin)}` : tDate(E.inicio);
    const cuandoEv = E.dias > 0 ? t('home.evento.en-dias', { n: E.dias }) : t(E.dias === 0 ? 'home.evento.hoy' : 'home.evento.en-curso');
    evCard.append(h('div', { class: 'ini-evento' },
      h('p', { class: 'ini-evento-nombre' }, E.nombre),
      h('p', { class: 'ini-evento-cuando' }, h('strong', null, cuandoEv), ` · ${rango}`),
      E.lugar ? h('p', { class: 'muted' }, E.lugar) : null,
      h('p', null, h('span', { class: 'badge badge--neutral' }, t(`tp.evento.${E.tipo}`)), E.prioridad ? ' ' : null, E.prioridad ? h('span', { class: 'badge badge--info' }, t('tp.prioridad-n', { p: E.prioridad })) : null)),
      h('div', { class: 'ini-acciones-card' }, enlace('#/planificacion', t('home.evento.ver'), 'btn btn-sm', 'planificacion')));
  }

  // ----- First steps (dismissible, ticks itself) -----
  const pasos = primerosPasos(ctx, M.primerosPasos, {
    onOcultar: () => { svc.ocultarPasos(); pasos.remove(); titulo.focus(); },
  });

  container.replaceChildren(h('div', { class: 'ini-page' }, banner, pasos,
    h('div', { class: 'ini-host' }, h('div', { class: 'ini-grid' }, hoyCard, asisCard, alertCard, accCard, chartCard, avisosCard, evCard))));
}
