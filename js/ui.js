// Helpers de UI. Nunca innerHTML con datos: todo por DOM/textContent.

const SVG_TAGS = ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'ellipse'];

// h('div', {class:'x', onclick:fn, dataset:{a:1}}, 'texto', otroNodo, [lista])
export function h(tag, attrs, ...children) {
  const el = SVG_TAGS.includes(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export function toast(msg, ms = 3000) {
  const box = document.getElementById('toasts') || document.body.appendChild(h('div', { id: 'toasts' }));
  const t = h('div', { class: 'toast' }, msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// modal({title, body (Node|string), actions:[{label, primary, danger, onClick}]}) -> {close, el}
// Si onClick devuelve false el modal no se cierra (p. ej. validación fallida).
export function modal({ title, body, actions, onClose } = {}) {
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const acts = (actions || [{ label: 'Cerrar' }]).map((a) =>
    h('button', {
      type: 'button',
      class: 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : ''),
      onclick: async () => {
        const r = a.onClick ? await a.onClick(close) : undefined;
        if (r !== false) close();
      }
    }, a.label));
  const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h3', null, title || ''),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' }, acts)));
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  overlay.querySelector('input,select,textarea,button.btn-primary')?.focus();
  return { close, el: overlay };
}

// -> Promise<boolean>
export function confirmDialog(msg, { okLabel = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title: 'Confirmar',
      body: h('p', null, msg),
      onClose: () => resolve(result),
      actions: [
        { label: 'Cancelar' },
        { label: okLabel, primary: !danger, danger, onClick: () => { result = true; } }
      ]
    });
  });
}

// formFields(def, values) -> {el, values(), validate()}
// def: [{name,label,type:'text|number|date|time|email|tel|textarea|select|checkbox',options:[{value,label}|string],required,placeholder,full}]
export function formFields(def, values = {}) {
  const inputs = {};
  const el = h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault() });
  for (const f of def) {
    const v = values[f.name] ?? f.default ?? '';
    let input;
    if (f.type === 'textarea') input = h('textarea', { rows: 3, placeholder: f.placeholder }, String(v));
    else if (f.type === 'select') {
      input = h('select', null, (f.options || []).map((o) => {
        const ov = typeof o === 'object' ? o.value : o;
        const ol = typeof o === 'object' ? o.label : o;
        return h('option', { value: ov, selected: String(ov) === String(v) }, ol);
      }));
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', checked: v === true || v === 'true' || v === 'TRUE' || v === 1 });
    } else {
      input = h('input', { type: f.type || 'text', value: v, placeholder: f.placeholder, step: f.step, min: f.min, max: f.max });
    }
    if (f.required) input.required = true;
    inputs[f.name] = input;
    el.appendChild(h('label',
      { class: 'field' + (f.full || f.type === 'textarea' ? ' full' : '') + (f.type === 'checkbox' ? ' check' : '') },
      h('span', null, (f.label || f.name) + (f.required ? ' *' : '')), input));
  }
  const read = () => {
    const out = {};
    for (const f of def) {
      const i = inputs[f.name];
      out[f.name] = f.type === 'checkbox' ? i.checked
        : f.type === 'number' ? (i.value === '' ? '' : Number(i.value))
        : i.value.trim();
    }
    return out;
  };
  return { el, values: read, validate: () => el.reportValidity() };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, dd);
  }
  return new Date(d);
}

// fmtDate(d) -> 15/10/2026 ; fmtDate(d,'long') -> "jueves, 15 de octubre de 2026"
export function fmtDate(d, mode) {
  if (d === '' || d == null) return '';
  const x = toDate(d);
  if (isNaN(x)) return String(d);
  if (mode === 'long') return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]} de ${x.getFullYear()}`;
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
}

// Date|string -> "YYYY-MM-DD" (hora local)
export function isoDate(d = new Date()) {
  const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// ms -> "mm:ss.cc"
export function fmtTime(ms) {
  ms = Number(ms);
  if (!isFinite(ms) || ms < 0) return '';
  const cs = Math.round(ms / 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(cs / 6000))}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`;
}

// "1:02.34" | "62.34" | "02:05,5" -> ms (NaN si no es válido)
export function parseTime(str) {
  const m = String(str ?? '').trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)$/);
  if (!m) return NaN;
  return Math.round((Number(m[1] || 0) * 60 + Number(m[2])) * 1000);
}
