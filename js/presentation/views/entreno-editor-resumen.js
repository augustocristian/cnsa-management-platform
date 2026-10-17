// Session summary of the plan editor: a sticky bar with the live total + a collapsible panel (open on desktop, collapsed on
// mobile) with metres and % per content and per stroke, a plain-text version and the "copy" / "register loads" actions.
import { h, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/entreno.js';
import * as G from '../../domain/desglose.js';
import { COLOR_SIN_TIPO } from '../../domain/cargas.js';
import { fmt, pctTxt, mTxt, estiloTxt } from './entreno-editor-util.js';

// env: { uid, svc, sesionId, borrador, nombreDe(n), hayErrores(), guardar() }
export function crearResumen(env) {
  const barEl = h('button', { type: 'button', class: 'enp-res-bar', 'aria-controls': env.uid + '-res' });
  const panelEl = h('div', { class: 'enp-res', id: env.uid + '-res' });
  let abierto = !(typeof matchMedia === 'function' && matchMedia('(max-width: 999px)').matches);
  const aplicar = () => {
    panelEl.hidden = !abierto;
    barEl.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  };
  barEl.addEventListener('click', () => {
    abierto = !abierto;
    aplicar();
  });
  aplicar();

  const opcionesTexto = (conPct) => ({
    conPct,
    nombre: (c) => (c.tipoId ? c.corto : c.contenido),
    nombreEstilo: (e) => estiloTxt(e.estilo),
    metros: mTxt,
    pct: pctTxt,
    etq: {
      total: t('entreno.res.texto-total'),
      porEstilo: t('entreno.res.texto-estilo'),
      sinContenido: t('entreno.cont.sin-contenido'),
      sinEstilo: t('entreno.est.ninguno'),
      pctContenido: t('entreno.res.texto-pct-contenido'),
      pctEstilo: t('entreno.res.texto-pct-estilo'),
    },
  });
  const desglose = () => env.svc.desglose(env.sesionId, env.borrador.estado.lineas);

  async function copiar() {
    const txt = G.textoResumen(desglose(), opcionesTexto(true));
    try {
      await navigator.clipboard.writeText(txt);
      toast(t('entreno.res.copiado'));
    } catch (e) {
      try {
        const ta = h(
          'textarea',
          { 'aria-hidden': 'true', style: { position: 'fixed', left: '-1000px', top: '0' } },
          txt,
        );
        document.body.appendChild(ta);
        ta.select();
        const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
        ta.remove();
        toast(t(ok ? 'entreno.res.copiado' : 'entreno.res.err-copiar'));
      } catch (e2) {
        toast(t('entreno.res.err-copiar'));
      }
    }
  }

  async function registrar() {
    if (env.hayErrores()) {
      toast(t('entreno.err-corrige'));
      return;
    }
    if (!(await confirmDialog(t('entreno.res.registrar-confirmar'))) || !env.guardar()) return;
    const r = env.svc.registrarCargasDesdePlan(env.sesionId);
    if (!r.ok) toast(t('entreno.err-guardar'));
    else if (!r.contenidos) toast(t('entreno.res.registrar-nada'));
    else if (!r.nadadores) toast(t('entreno.res.registrar-sin-nadadores'));
    else
      toast(
        t(r.creadas ? 'entreno.res.registrado' : 'entreno.res.registrado-ya', { n: r.creadas, omitidas: r.omitidas }),
      );
  }

  const leyenda = (items, { color, dato }) =>
    h(
      'ul',
      { class: 'enp-leg' },
      items.map((it) =>
        h(
          'li',
          { 'data-clave': dato(it) },
          h('i', { style: { background: color(it) }, 'aria-hidden': 'true' }),
          h('span', null, it.etq),
          h('span', { class: 'enp-m' }, mTxt(it.metros)),
          h('b', null, pctTxt(it.pct)),
        ),
      ),
    );
  const barra = (items, color, texto) =>
    h(
      'div',
      { class: 'enp-bar', role: 'img', 'aria-label': texto },
      items.map((it) =>
        h('span', {
          style: { flex: `${it.metros} 0 0`, background: color(it) },
          title: `${it.etq}: ${mTxt(it.metros)} (${pctTxt(it.pct)})`,
        }),
      ),
    );

  // Redraws bar and panel from the breakdown `d` (desglose of the draft)
  function pintar(d) {
    const tot = D.totales(env.borrador.estado.lineas);
    const colorC = (c) => c.color || COLOR_SIN_TIPO;
    const cs = d.porContenido.map((c) => ({
      ...c,
      etq: c.contenido ? env.nombreDe(c.contenido) : t('entreno.cont.sin-contenido'),
    }));
    const es = d.porEstilo.map((e) => ({ ...e, etq: estiloTxt(e.estilo) }));
    const mini =
      d.totalM > 0
        ? h(
            'span',
            { class: 'enp-res-mini', 'aria-hidden': 'true' },
            cs.map((c) => h('span', { style: { flex: `${c.metros} 0 0`, background: colorC(c) } })),
          )
        : null;
    barEl.setAttribute('aria-label', `${t('entreno.res.titulo')}: ${fmt(d.totalM)} m · ${fmt(tot.tiempoMin)} min`);
    barEl.replaceChildren(
      icon('grafica', { size: 18 }),
      h('span', null, t('entreno.res.titulo')),
      h('span', { class: 'enp-res-total' }, `${fmt(d.totalM)} m · ${fmt(tot.tiempoMin)} min`),
      mini,
      icon('flecha-abajo', { size: 16, class: 'enp-res-chev' }),
    );
    panelEl.replaceChildren(
      d.totalM > 0
        ? h(
            'div',
            { class: 'enp-res-body' },
            h(
              'div',
              { class: 'enp-res-cols' },
              h(
                'div',
                { class: 'enp-res-cont' },
                h('h4', null, t('entreno.res.por-contenido')),
                barra(cs, colorC, cs.map((c) => `${c.etq} ${mTxt(c.metros)} ${pctTxt(c.pct)}`).join(', ')),
                leyenda(cs, { color: colorC, dato: (c) => c.contenido }),
              ),
              h(
                'div',
                { class: 'enp-res-est' },
                h('h4', null, t('entreno.res.por-estilo')),
                barra(
                  es,
                  (e) => G.colorEstilo(e.estilo),
                  es.map((e) => `${e.etq} ${mTxt(e.metros)} ${pctTxt(e.pct)}`).join(', '),
                ),
                leyenda(es, { color: (e) => G.colorEstilo(e.estilo), dato: (e) => e.estilo }),
              ),
            ),
            h('p', { class: 'enp-res-txt', 'data-resumen': 'texto' }, G.textoResumen(d, opcionesTexto(true))),
            h(
              'div',
              { class: 'enp-res-acts' },
              h(
                'button',
                { type: 'button', class: 'btn', onclick: copiar },
                icon('copiar', { size: 16 }),
                ' ' + t('entreno.res.copiar'),
              ),
              h(
                'button',
                { type: 'button', class: 'btn', onclick: registrar },
                icon('cargas', { size: 16 }),
                ' ' + t('entreno.res.registrar'),
              ),
            ),
          )
        : h('div', { class: 'enp-res-body' }, h('p', { class: 'enp-vacio' }, t('entreno.res.vacio'))),
    );
  }

  return { barEl, panelEl, pintar, copiar, registrar };
}
