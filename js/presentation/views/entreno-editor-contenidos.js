// Contents and stroke of one plan row: chips with the content colour, metres per repetition or %, Auto/Manual mode,
// the unassigned remainder and the stroke split. Lives in the "Contents" pane of a row of the plan editor.
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, tContenido } from '../i18n/i18n.js';
import * as D from '../../domain/entreno.js';
import * as G from '../../domain/desglose.js';
import { COLOR_SIN_TIPO, normalizarNombre as nn } from '../../domain/cargas.js';
import { crearServicio as crearCargasSvc, abrirFormulario as formContenido } from './cargas-contenidos.js';
import { ib, r1, fmt, pctTxt, estiloTxt } from './entreno-editor-util.js';

// env: { ctx, svc (plan service), cambio(), repintar(), refDe(linea), tipos(), recargarTipos(), catalogoActivo(), tipoDe(n), nombreDe(n) }
// -> { el, actualizar }
export function crearContenidos(env, l, pos) {
  const chipsUl = h('ul', { class: 'enp-chips', 'aria-label': t('entreno.cont.lista-aria', { pos }) });
  const restoTxt = h('span');
  const restoSel = h('select', { 'aria-label': t('entreno.cont.asignar-a') });
  const restoBtn = h('button', { type: 'button', class: 'btn', onclick: () => asignarResto() }, t('entreno.cont.asignar-resto'));
  const restoCtl = h('span', { class: 'enp-c-ctl' }, restoSel, restoBtn);
  const restoEl = h('div', { class: 'enp-c-resto', role: 'status', hidden: true }, restoTxt, restoCtl);
  const addSel = h('select', { class: 'enp-c-add', 'aria-label': t('entreno.cont.anadir-aria', { pos }) });
  const igualBtn = h('button', { type: 'button', class: 'btn', onclick: () => { l.componentes = G.repartirIgual(l.componentes); pintarComps(); env.cambio(); } }, t('entreno.cont.igual'));
  const autoBtn = h('button', { type: 'button', class: 'btn', 'aria-label': t('entreno.cont.autocompletar-aria', { pos }), onclick: () => autocompletar() }, icon('refrescar', { size: 16 }), ' ' + t('entreno.cont.autocompletar'));
  const estEl = h('div', { class: 'enp-est', role: 'group', 'aria-label': `${t('entreno.est.titulo')} (${pos})` });
  let comps = [];
  let ests = [];
  const buscar = (nombre) => l.componentes.find((c) => nn(c.contenido) === nn(nombre));
  const resolver = () => G.resolverLinea(l, { tipos: env.tipos() });
  const enfocarComp = (nombre, parte) => { const c = comps.find((x) => x.k === nn(nombre)); if (c && c[parte]) c[parte].focus(); };
  const pintarModo = (btn, cur, nombre) => {
    const manual = !!cur && cur.modo === 'manual';
    btn.setAttribute('aria-pressed', manual ? 'true' : 'false');
    btn.setAttribute('aria-label', t(manual ? 'entreno.cont.modo-aria-manual' : 'entreno.cont.modo-aria-auto', { nombre }));
    btn.textContent = t(manual ? 'entreno.cont.modo-manual' : 'entreno.cont.modo-auto');
  };

  function pintarAdd() {
    const usados = new Set(l.componentes.map((c) => nn(c.contenido)));
    addSel.replaceChildren(h('option', { value: '' }, t('entreno.cont.anadir')),
      ...env.catalogoActivo().filter((x) => !usados.has(nn(x.nombre))).map((x) => h('option', { value: x.nombre }, tContenido(x))),
      h('option', { value: '__nuevo' }, t('tc.anadir-opcion')));
    addSel.value = '';
    const opciones = [...l.componentes.map((c) => c.contenido), ...env.catalogoActivo().map((x) => x.nombre).filter((n) => !usados.has(nn(n)))];
    restoSel.replaceChildren(...opciones.map((n) => h('option', { value: n }, env.nombreDe(n))));
    if (l.componentes.length) restoSel.value = l.componentes[l.componentes.length - 1].contenido;
    igualBtn.hidden = l.componentes.length < 2;
  }

  function chipContenido(c) {
    const nombre = env.nombreDe(c.contenido);
    const tp = env.tipoDe(c.contenido);
    const esPct = c.modo === 'manual' && c.pct > 0;
    const val = h('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'enp-c-val', 'data-campo': 'comp-valor',
      value: esPct ? String(c.pct) : c.metrosPorRep != null ? String(c.metrosPorRep) : '',
      'aria-label': t(esPct ? 'entreno.cont.valor-pct-aria' : 'entreno.cont.valor-aria', { nombre, pos }),
    });
    const un = h('select', { class: 'enp-c-un', 'aria-label': t('entreno.cont.unidad-aria', { nombre, pos }) },
      h('option', { value: 'm' }, t('entreno.cont.u-m')), h('option', { value: 'pct' }, t('entreno.cont.u-pct')));
    un.value = esPct ? 'pct' : 'm';
    const modo = h('button', { type: 'button', class: 'enp-c-modo', 'data-campo': 'comp-modo' });
    pintarModo(modo, c, nombre);
    const res = h('span', { class: 'enp-c-res' });
    val.addEventListener('input', () => {
      const txt = val.value.trim();
      if (txt === '') l.componentes = G.liberarComponente(l.componentes, c.contenido);
      else {
        const n = D.num(txt);
        if (!Number.isFinite(n) || n < 0) { val.setAttribute('aria-invalid', 'true'); return; }
        l.componentes = G.fijarReequilibrando(l, c.contenido, un.value === 'pct' ? { pct: n } : { metrosPorRep: n }, { tipos: env.tipos() });
      }
      val.removeAttribute('aria-invalid');
      pintarModo(modo, buscar(c.contenido), nombre);
      env.cambio();
    });
    un.addEventListener('change', () => {
      const r = resolver();
      const rc = r.componentes.find((x) => nn(x.contenido) === nn(c.contenido));
      const m = rc ? rc.metrosPorRep : 0;
      l.componentes = G.fijarComponente(l.componentes, c.contenido, un.value === 'pct' ? { pct: r.distancia > 0 ? r1(m / r.distancia * 100) : 0 } : { metrosPorRep: m });
      pintarComps(); env.cambio(); enfocarComp(c.contenido, 'un');
    });
    modo.addEventListener('click', () => {
      const cur = buscar(c.contenido);
      if (cur && cur.modo === 'manual') l.componentes = G.liberarComponente(l.componentes, c.contenido);
      else {
        const rc = resolver().componentes.find((x) => nn(x.contenido) === nn(c.contenido));
        l.componentes = G.fijarComponente(l.componentes, c.contenido, { metrosPorRep: rc ? rc.metrosPorRep : 0 });
      }
      pintarComps(); env.cambio(); enfocarComp(c.contenido, 'modo');
    });
    comps.push({ k: nn(c.contenido), val, un, modo, res });
    const li = h('li', { class: 'enp-c', 'data-contenido': c.contenido },
      h('span', { class: 'enp-c-name' }, nombre), val, un, modo,
      ib('cerrar', t('entreno.cont.quitar', { nombre, pos }), () => { l.componentes = G.quitarComponente(l.componentes, c.contenido); pintarComps(); env.cambio(); addSel.focus(); }),
      res);
    li.style.setProperty('--cc', tp ? tp.color : COLOR_SIN_TIPO);
    return li;
  }

  function pintarComps() {
    comps = [];
    chipsUl.replaceChildren(...l.componentes.map(chipContenido));
    pintarAdd();
  }

  function asignarResto() {
    const dest = restoSel.value;
    if (!dest) return;
    l.componentes = G.asignarResto(l, dest, { tipos: env.tipos() });
    pintarComps(); env.cambio();
    toast(t('entreno.cont.asignado', { nombre: env.nombreDe(dest) }));
  }

  function nuevoContenido() {
    formContenido({
      ctx: env.ctx, svc: crearCargasSvc(env.ctx),
      onGuardado: (tipo) => {
        env.recargarTipos();
        l.componentes = G.anadirComponente(l.componentes, tipo.nombre);
        env.cambio(); env.repintar();
      },
    });
  }
  addSel.addEventListener('change', () => {
    const v = addSel.value;
    addSel.value = '';
    if (!v) return;
    if (v === '__nuevo') { nuevoContenido(); return; }
    l.componentes = G.anadirComponente(l.componentes, v);
    pintarComps(); env.cambio();
    enfocarComp(v, 'val');
  });

  function autocompletar() {
    const r = G.autocompletarLinea(l, { tipos: env.tipos() });
    if (r.parse.codigo === 'varios-bloques') { toast(t('entreno.cont.varios-bloques')); return; }
    if (!r.parse.ok) { toast(t('entreno.cont.nada-texto')); return; }
    l.series = r.linea.series; l.distancia = r.linea.distancia;
    l.componentes = r.linea.componentes; l.estilos = r.linea.estilos;
    const ref = env.refDe(l);
    if (ref) { ref.inputs.series.value = l.series === '' ? '' : String(l.series); ref.inputs.distancia.value = l.distancia === '' ? '' : String(l.distancia); }
    pintarComps(); pintarEst(); env.cambio();
    toast(t('entreno.cont.autocompletado', { n: r.linea.componentes.length, e: r.linea.estilos.length }));
  }

  // Stroke: one for the whole distance, or several with metres per repetition each
  function pintarEst() {
    ests = [];
    const multi = l.estilos.length > 1;
    const filas = (l.estilos.length ? l.estilos : [null]).map((e, i) => {
      const nombre = e ? e.estilo : '';
      const canon = G.canonicoEstilo(nombre);
      const conocido = G.ESTILOS.includes(canon);
      const otro = !!e && (!!e.otro || (!!nombre && !conocido));
      const etiqueta = t('entreno.est.aria', { pos }) + (multi ? ' ' + (i + 1) : '');
      const sel = h('select', { 'data-campo': 'estilo', 'aria-label': etiqueta },
        multi ? null : h('option', { value: '' }, t('entreno.est.ninguno')),
        ...G.ESTILOS.map((x) => h('option', { value: x }, estiloTxt(x))), h('option', { value: '__otro' }, t('entreno.est.otro')));
      sel.value = otro ? '__otro' : conocido ? canon : '';
      const poner = (nuevo) => { l.estilos = (l.estilos.length ? l.estilos : [null]).map((x, j) => (j === i ? nuevo : x)).filter(Boolean); };
      sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === '') l.estilos = l.estilos.filter((_, j) => j !== i);
        else if (v === '__otro') poner({ estilo: '', metrosPorRep: e ? e.metrosPorRep : null, otro: true });
        else poner({ estilo: v, metrosPorRep: e ? e.metrosPorRep : null });
        pintarEst(); env.cambio();
        if (v === '__otro') { const x = ests[i] && ests[i].txt; if (x) x.focus(); } else if (ests[i]) ests[i].sel.focus();
      });
      const txt = otro ? h('input', { type: 'text', value: nombre, maxlength: 30, 'aria-label': t('entreno.est.otro-aria', { pos }), 'data-campo': 'estilo-otro' }) : null;
      let quitar = null;
      if (txt) txt.addEventListener('input', () => { poner({ estilo: txt.value, metrosPorRep: e ? e.metrosPorRep : null, otro: true }); if (quitar) quitar.setAttribute('aria-label', t('entreno.est.quitar', { estilo: txt.value || estiloTxt(''), pos })); env.cambio(); });
      const m = multi ? h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'enp-est-m', 'data-campo': 'estilo-metros', value: e && e.metrosPorRep != null ? String(e.metrosPorRep) : '', 'aria-label': t('entreno.est.metros-aria', { estilo: estiloTxt(canon), pos }) }) : null;
      if (m) m.addEventListener('input', () => { const n = D.num(m.value); l.estilos = l.estilos.map((x, j) => (j === i ? { ...x, metrosPorRep: Number.isFinite(n) && n >= 0 ? n : null } : x)); env.cambio(); });
      ests.push({ sel, txt, m });
      if (multi) quitar = ib('cerrar', t('entreno.est.quitar', { estilo: nombre ? estiloTxt(canon) : estiloTxt(''), pos }), () => { l.estilos = l.estilos.filter((_, j) => j !== i); pintarEst(); env.cambio(); });
      return h('div', { class: 'enp-est-fila' }, sel, txt, m, quitar);
    });
    const libres = G.ESTILOS.filter((x) => !l.estilos.some((e) => G.canonicoEstilo(e.estilo) === x));
    estEl.replaceChildren(...filas,
      l.estilos.length && l.estilos.length < 4 && libres.length
        ? h('button', { type: 'button', class: 'btn', 'data-accion': 'estilo-mas', onclick: () => { l.estilos = [...l.estilos, { estilo: libres[0], metrosPorRep: null }]; pintarEst(); env.cambio(); } }, icon('mas', { size: 16 }), ' ' + t('entreno.est.dividir'))
        : null);
  }

  // Recomputes placeholders, per-content results and the remainder; called on every change of the draft.
  function actualizar() {
    const r = resolver();
    const S = r.series;
    comps.forEach((cr) => {
      const rc = r.componentes.find((x) => nn(x.contenido) === cr.k);
      if (!rc) return;
      cr.val.placeholder = rc.metrosPorRep ? String(rc.metrosPorRep) : '';
      const pct = r.distancia > 0 ? rc.metrosPorRep / r.distancia * 100 : 0;
      cr.res.textContent = t('entreno.cont.res', { rep: fmt(rc.metrosPorRep), m: fmt(r1(S * rc.metrosPorRep)), pct: pctTxt(pct) });
    });
    ests.forEach((er, i) => { if (er.m && r.estilos[i]) er.m.placeholder = String(r.estilos[i].metrosPorRep || ''); });
    const hayResto = r.componentes.length > 0 && r.resto > G.EPS;
    const hayExceso = r.componentes.length > 0 && r.exceso > G.EPS;
    restoEl.hidden = !(hayResto || hayExceso);
    restoEl.classList.toggle('enp-c-exc', hayExceso);
    restoCtl.hidden = !hayResto;
    restoTxt.textContent = hayExceso ? t('entreno.cont.excede', { rep: fmt(r.exceso) }) : hayResto ? t('entreno.cont.sin-asignar', { rep: fmt(r.resto), m: fmt(r1(S * r.resto)) }) : '';
  }

  pintarComps();
  pintarEst();
  const el = h('div', { class: 'enp-cont', role: 'group', 'aria-label': `${t('entreno.cont.titulo')} (${pos})` },
    h('div', { class: 'enp-cont-bar' }, addSel, estEl, autoBtn, igualBtn), chipsUl, restoEl);
  return { el, actualizar };
}
