// One row of the plan, in two lines:
//   line 1: series x distance + exercise text (numeric keypads, always visible)
//   line 2: chips (send-off, time, material, objective, contents, block and notes) that open an inline pane with the real input
// On wide screens CSS shows every pane at once (no chips needed). All inputs always exist in the DOM, so the draft never
// depends on which pane is open.
import { h } from '../ui.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/entreno.js';
import { menuAcciones } from './entreno-menu.js';
import { crearContenidos } from './entreno-editor-contenidos.js';
import { fmt, PANEL_DE } from './entreno-editor-util.js';

// campo -> [column key in the dictionary, input attributes]
const ATRIBUTOS = {
  series: { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', placeholder: '1' },
  distancia: { inputmode: 'numeric', pattern: '[0-9]*', list: 'enp-dl-distancia', autocomplete: 'off', placeholder: '100' },
  ejercicio: { list: 'enp-dl-ejercicio', enterkeyhint: 'next' },
  salida: { inputmode: 'text', list: 'enp-dl-salida', placeholder: "C/1'10\"", autocapitalize: 'off', autocomplete: 'off', enterkeyhint: 'done' },
  tiempoMin: { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'done' },
  material: { list: 'enp-dl-material', enterkeyhint: 'done' },
  objetivo: { list: 'enp-dl-objetivo', enterkeyhint: 'done' },
  bloque: { list: 'enp-dl-bloque', enterkeyhint: 'next' },
  notas: { enterkeyhint: 'done' },
};
const CLAVE = { tiempoMin: 'tiempo' };

// env: see entreno-editor.js ({ borrador, refs, op, foco, cambio, ... }); ultimoSet: is this the last set?; nFilas: rows in the set
export function crearFila(env, l, { ultimoSet, nFilas }) {
  const inputs = {};
  const pos = t('entreno.pos', { set: l.set, fila: l.orden });
  const idPane = `${env.uid}-p-${l.set}-${l.orden}`;

  const campo = (nombre, { textarea = false } = {}) => {
    const attrs = { 'data-campo': nombre, 'aria-label': `${t('entreno.col.' + (CLAVE[nombre] || nombre))} (${pos})`, ...ATRIBUTOS[nombre] };
    const valor = l[nombre] === undefined || l[nombre] === null ? '' : String(l[nombre]);
    const el = textarea ? h('textarea', { rows: 2, ...attrs }, valor) : h('input', { type: 'text', value: valor, ...attrs });
    el.addEventListener('input', () => { l[nombre] = el.value; env.cambio(); });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || textarea) return;
      e.preventDefault();
      const sig = env.borrador.estado.lineas.find((x) => x.set === l.set && x.orden === l.orden + 1);
      if (sig) env.foco(sig.set, sig.orden, nombre);
      else env.op((ls) => D.anadirFila(ls, l.set), { set: l.set, orden: l.orden + 1, campo: nombre });
    });
    if (nombre === 'salida') {
      el.addEventListener('blur', () => { // normalises C/1'10" when it is valid
        const p = D.parsearSalida(el.value);
        if (p.valido && !p.vacio && p.texto !== el.value) { el.value = p.texto; l.salida = p.texto; env.cambio(); }
      });
    }
    inputs[nombre] = el;
    return h('label', { class: 'enp-f enp-f-' + nombre }, h('span', { class: 'enp-lbl' }, t('entreno.col.' + (CLAVE[nombre] || nombre))), el);
  };

  const out = h('output', { class: 'enp-dist', 'aria-label': `${t('entreno.col.dist-bloque')} (${pos})` });
  const cont = crearContenidos(env, l, pos);

  // Panes (inline editors) opened by the chips
  const secciones = {
    salida: h('div', { class: 'enp-sec', 'data-pane': 'salida' }, campo('salida')),
    tiempoMin: h('div', { class: 'enp-sec', 'data-pane': 'tiempoMin' }, campo('tiempoMin')),
    material: h('div', { class: 'enp-sec', 'data-pane': 'material' }, campo('material')),
    objetivo: h('div', { class: 'enp-sec', 'data-pane': 'objetivo' }, campo('objetivo')),
    contenidos: h('div', { class: 'enp-sec enp-sec-cont', 'data-pane': 'contenidos' }, cont.el),
    mas: h('div', { class: 'enp-sec', 'data-pane': 'mas' }, campo('bloque'), campo('notas', { textarea: false })),
  };
  Object.values(secciones).forEach((s) => { s.hidden = true; });
  const pane = h('div', { class: 'enp-pane', id: idPane }, Object.values(secciones));

  let abierto = null;
  function mostrar(k) {
    abierto = k;
    Object.entries(secciones).forEach(([clave, el]) => { el.hidden = clave !== k; });
    Object.entries(chips).forEach(([clave, c]) => { c.btn.setAttribute('aria-expanded', clave === k ? 'true' : 'false'); });
    pane.classList.toggle('enp-pane--abierto', !!k);
  }
  const alternar = (k) => {
    mostrar(abierto === k ? null : k);
    if (abierto === k && k !== 'contenidos') (secciones[k].querySelector('input,textarea'))?.focus();
  };

  const chips = {};
  const chip = (k, etiqueta) => {
    const txt = h('span', { class: 'enp-chip-txt' });
    const btn = h('button', { type: 'button', class: 'enp-chip', 'data-chip': k, 'aria-expanded': 'false', 'aria-controls': idPane, onclick: () => alternar(k) }, txt);
    chips[k] = { btn, txt, etiqueta };
    return btn;
  };
  const filaChips = h('div', { class: 'enp-l2' },
    chip('salida', t('entreno.col.salida')), chip('tiempoMin', t('entreno.col.tiempo')), chip('material', t('entreno.col.material')),
    chip('objetivo', t('entreno.col.objetivo')), chip('contenidos', t('entreno.col.contenidos')), chip('mas', t('entreno.fila.mas')),
    h('span', { class: 'enp-dist-caja' }, out, ' m'));

  function actualizarChips() {
    const r = D.resumenFila(l);
    const valores = {
      salida: r.salida && `${chips.salida.etiqueta}: ${r.salida}`,
      tiempoMin: r.tiempoMin && t('entre.meta-min', { n: r.tiempoMin }),
      material: r.material && `${chips.material.etiqueta}: ${r.material}`,
      objetivo: r.objetivo && `${chips.objetivo.etiqueta}: ${r.objetivo}`,
      contenidos: r.contenidos && `${chips.contenidos.etiqueta} · ${r.contenidos}`,
      mas: r.mas && chips.mas.etiqueta,
    };
    Object.entries(chips).forEach(([k, c]) => {
      const txt = valores[k] || c.etiqueta;
      c.txt.textContent = txt;
      c.btn.setAttribute('aria-label', `${txt} (${pos})`);
      c.btn.classList.toggle('enp-chip--lleno', !!valores[k]);
    });
  }

  const acciones = menuAcciones({
    etiqueta: t('entreno.fila.acciones', { pos }),
    items: () => [
      { label: t('entreno.fila-subir', { pos }), icono: 'fila-arriba', deshabilitado: l.set === 1 && l.orden === 1, onClick: () => env.op((ls) => D.moverFila(ls, l.set, l.orden, -1), { set: l.set, orden: Math.max(1, l.orden - 1) }) },
      { label: t('entreno.fila-bajar', { pos }), icono: 'fila-abajo', deshabilitado: ultimoSet && l.orden === nFilas, onClick: () => env.op((ls) => D.moverFila(ls, l.set, l.orden, 1), { set: l.set, orden: l.orden + 1 }) },
      { label: t('entreno.fila-duplicar', { pos }), icono: 'copiar', onClick: () => env.op((ls) => D.duplicarFila(ls, l.set, l.orden), { set: l.set, orden: l.orden + 1 }) },
      { label: t('entreno.fila-quitar', { pos }), icono: 'borrar', danger: true, onClick: () => env.op((ls) => D.quitarFila(ls, l.set, l.orden)) },
    ],
  });

  const fila = h('div', { class: 'enp-row', role: 'group', 'aria-label': pos, 'data-set': l.set, 'data-orden': l.orden },
    h('div', { class: 'enp-l1' }, campo('series'), h('span', { class: 'enp-x', 'aria-hidden': 'true' }, '×'), campo('distancia'), campo('ejercicio'), acciones),
    filaChips, pane);

  const ref = {
    fila: l, out, inputs, cont,
    // Shows the pane that holds `nombre` (used when focus is moved programmatically)
    abrir(nombre) { const k = PANEL_DE[nombre]; if (k && abierto !== k) mostrar(k); },
    actualizar() { out.textContent = fmt(D.distanciaBloque(l)); actualizarChips(); cont.actualizar(); },
    // Marks the fields with an error (aria-invalid) and the chips whose hidden pane contains them
    marcar(malos) {
      Object.entries(inputs).forEach(([c, el]) => (malos.has(c) ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid')));
      Object.entries(chips).forEach(([k, c]) => c.btn.classList.toggle('enp-chip--error', [...malos].some((campo) => PANEL_DE[campo] === k)));
    },
  };
  actualizarChips();
  env.refs.push(ref);
  return fila;
}
