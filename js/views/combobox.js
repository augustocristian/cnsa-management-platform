// Searchable single-choice combobox (ARIA 1.2 "list autocomplete"): type to filter, arrows + Enter or tap to choose.
// Used for the swimmer pickers of Loads and Times, where a plain <select> is unusable with 40+ swimmers.
// combobox({ label, opciones: [{ value, label }], valor, placeholder, requerido }) -> { el, input, valor(), fijar(value), enfocar() }
// `el` is a regular .field (so fieldError(input, msg) works); the chosen value is read with valor().
import { h, field } from '../ui.js';
import { useStyles } from '../styles.js';
import { coincideBusqueda } from '../domain/nombres.js';

const MAX_VISIBLES = 40;
let n = 0;

export function combobox({ label, opciones, valor = '', placeholder = '', requerido = false } = {}) {
  useStyles('combobox');
  const listId = `combo-${++n}`;
  let elegido = '';
  let activo = -1;
  let filtradas = [];

  const input = h('input', {
    type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId,
    autocomplete: 'off', spellcheck: 'false', placeholder, autocapitalize: 'off',
  });
  const lista = h('ul', { id: listId, role: 'listbox', class: 'combo-list', 'aria-label': label, hidden: true });
  const el = field({ label, input, required: requerido });
  el.classList.add('combo');
  el.append(lista);

  const porValor = (v) => opciones.find((o) => o.value === v);
  const abierta = () => !lista.hidden;

  function cerrar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activo = -1;
  }
  function pintar() {
    filtradas = opciones.filter((o) => coincideBusqueda(o.label, input.value)).slice(0, MAX_VISIBLES);
    lista.replaceChildren(...(filtradas.length
      ? filtradas.map((o, i) => h('li', {
        id: `${listId}-${i}`, role: 'option', class: 'combo-opt', 'aria-selected': String(o.value === elegido),
        onmousedown: (e) => { e.preventDefault(); elegir(o); },
      }, o.label))
      : [h('li', { class: 'combo-vacio', role: 'presentation' }, '—')]));
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    marcarActivo(filtradas.length === 1 ? 0 : -1);
  }
  function marcarActivo(i) {
    activo = i;
    [...lista.children].forEach((li, k) => li.classList.toggle('is-active', k === i));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `${listId}-${i}`); lista.children[i]?.scrollIntoView?.({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function elegir(o) {
    elegido = o.value;
    input.value = o.label;
    cerrar();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // The list opens on tap/typing/arrows, not on programmatic focus (sheets focus their first field when they open).
  input.addEventListener('focus', () => { input.select?.(); });
  input.addEventListener('click', () => { if (!abierta()) pintar(); });
  input.addEventListener('input', () => {
    elegido = '';
    const exacta = opciones.find((o) => o.label.toLowerCase() === input.value.trim().toLowerCase());
    if (exacta) elegido = exacta.value;
    pintar();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierta()) pintar();
      if (!filtradas.length) return;
      marcarActivo((activo + (e.key === 'ArrowDown' ? 1 : -1) + filtradas.length) % filtradas.length);
    } else if (e.key === 'Enter' && abierta() && activo >= 0) {
      e.preventDefault();
      elegir(filtradas[activo]);
    } else if (e.key === 'Escape' && abierta()) {
      e.stopPropagation();
      cerrar();
    }
  });
  // Leaving the field commits a single remaining match (typing the full name is enough).
  input.addEventListener('blur', () => {
    if (!elegido) {
      const unicas = opciones.filter((o) => coincideBusqueda(o.label, input.value));
      if (input.value.trim() && unicas.length === 1) { elegido = unicas[0].value; input.value = unicas[0].label; input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    cerrar();
  });

  const fijar = (v) => { const o = porValor(v); elegido = o ? o.value : ''; input.value = o ? o.label : ''; };
  fijar(valor);

  return {
    el, input,
    // Value of the chosen option; a single remaining match counts as chosen (submit before blur).
    valor() {
      if (elegido) return elegido;
      const unicas = input.value.trim() ? opciones.filter((o) => coincideBusqueda(o.label, input.value)) : [];
      if (unicas.length === 1) { fijar(unicas[0].value); return elegido; }
      return '';
    },
    fijar,
    enfocar() { input.focus(); },
  };
}
