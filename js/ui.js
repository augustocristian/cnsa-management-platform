// UI helpers. Never innerHTML with data: everything through DOM/textContent.
// Visual components: css/components.css; contract and examples: docs/DESIGN.md.
import { icon } from './icons.js';
import { t, tDate } from './i18n.js';

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

let uidN = 0;
const uid = (p = 'ui') => `${p}-${++uidN}`;
const timer = (fn, ms) => { const id = setTimeout(fn, ms); if (id && id.unref) id.unref(); return id; };

// ---------- Toasts ----------
// toast(msg, ms | {timeout, type:'error', action:{label,onClick}}) -> {close, el}
//  - role="status" (role="alert" for errors), 5-6 s, paused while the pointer is over it or focus is inside.
//  - toast.undo(msg, onUndo, {timeout:6000}) adds an Undo button; toast.error(msg) for errors.
const TIEMPO_MIN = 5000;
export function toast(msg, opts = {}) {
  if (typeof opts === 'number') opts = { timeout: opts };
  const error = opts.type === 'error';
  const box = document.getElementById('toasts') || document.body.appendChild(h('div', { id: 'toasts' }));
  const timeout = Math.max(Number(opts.timeout) || (error ? 6000 : TIEMPO_MIN), TIEMPO_MIN);
  let id = null;
  let resto = timeout;
  let desde = 0;
  let cerrado = false;
  const close = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(id);
    el.remove();
  };
  const arrancar = () => { if (id != null || cerrado) return; desde = Date.now(); id = timer(close, Math.max(resto, 1000)); };
  const pausar = () => { if (id == null) return; clearTimeout(id); id = null; resto -= Date.now() - desde; };
  const el = h('div', { class: 'toast' + (error ? ' toast--error' : ''), role: error ? 'alert' : 'status', 'aria-atomic': 'true' },
    error ? icon('aviso', { size: 18 }) : null,
    h('span', { class: 'toast-text' }, msg));
  if (opts.action) {
    el.appendChild(h('button', {
      type: 'button', class: 'toast-action',
      onclick: async () => {
        if (cerrado) return;
        close();
        try { await opts.action.onClick?.(); } catch (e) { console.error(e); }
      },
    }, opts.action.label));
  }
  if (error || opts.action) {
    el.appendChild(h('button', { type: 'button', class: 'toast-action toast-close', 'aria-label': t('ui.cerrar-aviso'), onclick: close }, icon('cerrar', { size: 16 })));
  }
  el.addEventListener('mouseenter', pausar);
  el.addEventListener('focusin', pausar);
  el.addEventListener('mouseleave', arrancar);
  el.addEventListener('focusout', arrancar);
  box.appendChild(el);
  arrancar();
  return { close, el };
}
toast.error = (msg, opts = {}) => toast(msg, { ...(typeof opts === 'number' ? { timeout: opts } : opts), type: 'error' });
// Delete with a safety net: toast.undo('Swimmer deleted', () => restore())
toast.undo = (msg, onUndo, { timeout = 6000 } = {}) => toast(msg, { timeout, action: { label: t('ui.deshacer'), onClick: onUndo } });

// ---------- Sheet / modal ----------
// sheet({title, body (Node|string), actions:[{label, primary, danger, autofocus, onClick(close)}], onClose}) -> {close, el, dialog}
//  - Desktop: centred dialog. Mobile: bottom sheet (css/components.css).
//  - role="dialog" aria-modal, aria-labelledby (title) and aria-describedby (body); Escape closes; clicking outside closes.
//  - Focus trap: the rest of the page becomes `inert`, Tab/Shift+Tab cycle inside and focus returns on close.
//  - Locks <body> scroll and always restores it (even if onClose throws).
//  - If onClick returns false the sheet stays open (e.g. failed validation).
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const pila = [];
let bloqueos = 0;
let overflowPrevio = '';
const inertados = new Set();

function sincronizarInert() {
  inertados.forEach((e) => e.removeAttribute('inert'));
  inertados.clear();
  const top = pila[pila.length - 1];
  if (!top) return;
  for (const e of document.body.children) {
    if (e === top.overlay || e.id === 'toasts' || /^(SCRIPT|STYLE|LINK)$/.test(e.tagName)) continue;
    if (!e.hasAttribute('inert')) { e.setAttribute('inert', ''); inertados.add(e); }
  }
}
function bloquearScroll() {
  if (bloqueos++ === 0) { overflowPrevio = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
}
function liberarScroll() {
  if (bloqueos > 0 && --bloqueos === 0) document.body.style.overflow = overflowPrevio;
}
const enfocables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((e) => !e.hidden && !e.closest('[hidden]'));

export function sheet({ title, body, actions, onClose, className } = {}) {
  const previo = document.activeElement;
  const idT = uid('sheet-t');
  const idB = uid('sheet-b');
  let cerrada = false;

  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;
    try {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn, true);
      const i = pila.indexOf(entrada);
      if (i >= 0) pila.splice(i, 1);
      overlay.remove();
      sincronizarInert();
    } finally {
      liberarScroll(); // always, even if something above or onClose fails
      const vuelta = previo && previo.isConnected && previo.focus ? previo : document.getElementById('view');
      try { vuelta?.focus?.(); } catch (e) { /* ignore */ }
      try { onClose?.(); } catch (e) { console.error(e); }
    }
  };
  const esTop = () => pila[pila.length - 1] === entrada;
  function onKey(e) {
    if (!esTop()) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrar(); return; }
    if (e.key !== 'Tab') return;
    const f = enfocables(dialog);
    if (!f.length) { e.preventDefault(); dialog.focus(); return; }
    const primero = f[0];
    const ultimo = f[f.length - 1];
    const act = document.activeElement;
    if (e.shiftKey && (act === primero || act === dialog || !dialog.contains(act))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (act === ultimo || !dialog.contains(act))) { e.preventDefault(); primero.focus(); }
  }
  // If focus escapes (browsers without inert, screen readers...) it is brought back to the dialog.
  function onFocusIn(e) {
    if (!esTop() || dialog.contains(e.target) || e.target.closest?.('#toasts')) return;
    (enfocables(dialog)[0] || dialog).focus();
  }

  const botones = (actions || [{ label: t('common.cerrar') }]).map((a) => {
    const b = h('button', {
      type: 'button',
      class: 'btn' + (a.primary ? ' btn--primary btn-primary' : '') + (a.danger ? ' btn--danger btn-danger' : '') + (a.class ? ' ' + a.class : ''),
      onclick: async () => {
        if (b.getAttribute('aria-busy') === 'true') return;
        b.setAttribute('aria-busy', 'true');
        try {
          const r = a.onClick ? await a.onClick(cerrar) : undefined;
          if (r !== false) cerrar();
        } catch (e) {
          console.error(e);
          toast.error(e && e.message ? e.message : t('common.error'));
        } finally { b.removeAttribute('aria-busy'); }
      },
    }, a.label);
    if (a.autofocus) b.dataset.autofocus = '1';
    return b;
  });

  const dialog = h('div', { class: 'sheet modal' + (className ? ' ' + className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idT, 'aria-describedby': idB, tabindex: '-1' },
    h('div', { class: 'sheet-head modal-head' }, h('h2', { id: idT }, title || ''),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.cerrar'), onclick: cerrar }, icon('cerrar', { size: 18 }))),
    h('div', { class: 'sheet-body modal-body', id: idB }, body),
    h('div', { class: 'sheet-actions modal-actions' }, botones));
  const overlay = h('div', { class: 'sheet-overlay modal-overlay', onmousedown: (e) => { if (e.target === overlay) cerrar(); } }, dialog);
  const entrada = { overlay };

  bloquearScroll();
  pila.push(entrada);
  document.body.appendChild(overlay);
  sincronizarInert();
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocusIn, true);
  // Initial focus: button marked autofocus > first field > primary button > the dialog itself
  const inicial = dialog.querySelector('[data-autofocus],[autofocus]')
    || dialog.querySelector('.sheet-body input:not([type="hidden"]),.sheet-body select,.sheet-body textarea')
    || dialog.querySelector('.sheet-actions .btn--primary')
    || dialog;
  inicial.focus();
  return { close: cerrar, el: overlay, dialog };
}

// modal(...) = sheet(...): historical signature, same options. -> {close, el}
export function modal(opts = {}) { return sheet(opts); }

// -> Promise<boolean>. Initial focus is on Cancel; the destructive action is labelled 'Delete' (or okLabel).
export function confirmDialog(msg, { okLabel, danger = false, title } = {}) {
  return new Promise((resolve) => {
    let result = false;
    sheet({
      title: title || t('common.confirmar'),
      body: h('p', null, msg),
      onClose: () => resolve(result),
      actions: [
        { label: t('common.cancelar'), autofocus: true },
        { label: okLabel || t(danger ? 'common.eliminar' : 'common.aceptar'), primary: !danger, danger, onClick: () => { result = true; } },
      ],
    });
  });
}

// ---------- Fields and inline validation ----------
// field({label, input, hint, error, required}) -> <div class="field"><label class="field-control"><span class="field-label">…</span> control</label> <p.hint> <p.field-error></div>
// The control sits INSIDE its <label> (accessible name = the label text only); hint and error stay outside and are linked with aria-describedby.
export function field({ label, input, hint, error, required, id } = {}) {
  const control = input instanceof Node ? input : h('input', { type: 'text' });
  const fid = id || control.id || uid('f');
  control.id = fid;
  if (required) { control.required = true; control.setAttribute('aria-required', 'true'); }
  const el = h('div', { class: 'field' });
  if (label != null) {
    el.appendChild(h('label', { class: 'field-control' },
      h('span', { class: 'field-label' }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), control));
  } else el.appendChild(control);
  if (hint) {
    const hid = fid + '-hint';
    el.appendChild(h('p', { class: 'hint', id: hid }, hint));
    describir(control, hid, true);
  }
  if (error) fieldError(control, error, { focus: false });
  return el;
}

function describir(input, id, add) {
  const ids = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  add ? ids.add(id) : ids.delete(id);
  if (ids.size) input.setAttribute('aria-describedby', [...ids].join(' ')); else input.removeAttribute('aria-describedby');
}

// fieldError(input, 'Message') -> red border, message with icon below, aria-invalid and focus on the field.
// fieldError(input, '') / clearFieldError(input) removes it. The error clears itself when the user edits the field.
export function fieldError(input, msg, { focus = true } = {}) {
  if (!input) return null;
  const caja = input.closest('.field') || input.parentElement;
  const eid = (input.id || (input.id = uid('f'))) + '-err';
  let err = caja ? [...caja.querySelectorAll('.field-error')].find((e) => e.id === eid) : null;
  if (!msg) {
    err?.remove();
    input.removeAttribute('aria-invalid');
    describir(input, eid, false);
    return null;
  }
  if (!err) {
    err = h('p', { class: 'field-error', id: eid });
    (caja || input.parentElement).appendChild(err);
    describir(input, eid, true);
    const limpiar = () => { clearFieldError(input); input.removeEventListener('input', limpiar); input.removeEventListener('change', limpiar); };
    input.addEventListener('input', limpiar);
    input.addEventListener('change', limpiar);
  }
  err.replaceChildren(icon('aviso', { size: 16 }), h('span', null, msg));
  input.setAttribute('aria-invalid', 'true');
  if (focus) input.focus();
  return err;
}
export function clearFieldError(input) { fieldError(input, ''); }

// ---------- Empty states and small components ----------
// empty({icon, title, text, action}) -> <div class="empty">. action: Node | {label, onClick, primary=true}
export function empty({ icon: ic = 'info', title, text, action } = {}) {
  let cta = action;
  if (action && !(action instanceof Node)) {
    cta = h('button', { type: 'button', class: 'btn ' + (action.primary === false ? '' : 'btn--primary btn-primary'), onclick: action.onClick }, action.label);
  }
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(ic, { size: 28 })),
    title ? h('p', { class: 'empty-title' }, title) : null,
    text ? h('p', { class: 'empty-text' }, text) : null,
    cta || null);
}

// badge('Present', 'ok'|'warn'|'danger'|'info'|'neutral') -> <span class="badge badge--ok"> (the dot is drawn by CSS)
export function badge(texto, tono = 'neutral') { return h('span', { class: `badge badge--${tono}` }, texto); }

// Initials of a name ('Martina Suárez' -> 'MS')
export function iniciales(nombre) {
  const p = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export function avatar(nombre, { size } = {}) {
  return h('span', { class: 'avatar' + (size ? ` avatar--${size}` : ''), 'aria-hidden': 'true', title: nombre || null }, iniciales(nombre));
}

// formFields(def, values) -> {el, values(), validate(), inputs}
// def: [{name,label,type:'text|number|date|time|email|tel|textarea|select|checkbox',options:[{value,label}|string],required,placeholder,full,hint}]
// validate(): marks each invalid field with fieldError (inline message) and focuses the first one.
export function formFields(def, values = {}) {
  const inputs = {};
  const el = h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault(), novalidate: true });
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
    const rotulo = f.label || f.name;
    if (f.type === 'checkbox') {
      el.appendChild(h('label', { class: 'field check' + (f.full ? ' full' : '') }, input, h('span', null, rotulo + (f.required ? ' *' : ''))));
    } else {
      const campo = field({ label: rotulo, input, hint: f.hint, required: f.required });
      if (f.full || f.type === 'textarea') campo.classList.add('full');
      el.appendChild(campo);
    }
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
  const validate = () => {
    let primero = null;
    for (const f of def) {
      const i = inputs[f.name];
      clearFieldError(i);
      if (i.checkValidity?.() !== false && !(f.required && f.type !== 'checkbox' && i.value.trim() === '')) continue;
      const vacio = i.value.trim() === '';
      fieldError(i, vacio ? t('ui.campo-obligatorio') : (i.validationMessage || t('common.error')), { focus: false });
      primero ||= i;
    }
    primero?.focus();
    return !primero;
  };
  return { el, values: read, validate, inputs };
}

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, dd);
  }
  return new Date(d);
}

// fmtDate(d) -> according to language (tDate); 'long' -> with weekday
export function fmtDate(d, mode) { return tDate(d, mode); }

// Date|string -> "YYYY-MM-DD" (local time)
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

// Numeric mask for swim times: only digits count; the last two are hundredths and the two before are seconds.
// Typing "1:02.34" by hand gives the same result as typing 10234.
//   '10245' -> '1:02.45'   '2845' -> '28.45'   '545' -> '5.45'   '28' -> '28'
export function maskTime(str) {
  const d = String(str ?? '').replace(/\D/g, '').slice(0, 6);
  if (d.length <= 2) return d;
  const cc = d.slice(-2);
  const ss = d.slice(-4, -2);
  const mm = d.slice(0, -4);
  return mm ? `${Number(mm)}:${ss}.${cc}` : `${Number(ss)}.${cc}`;
}
// Applies the mask while typing (numeric keypad on mobile). -> the same input
export function timeInput(input) {
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => { input.value = maskTime(input.value); });
  return input;
}

// "1:02.34" | "62.34" | "02:05,5" -> ms; also with the numeric mask: "10245" -> 1:02.45 (NaN if invalid)
export function parseTime(str) {
  const txt = String(str ?? '').trim().replace(',', '.');
  if (/^\d{3,6}$/.test(txt)) {
    const cs = Number(txt.slice(-2));
    const ss = Number(txt.slice(-4, -2));
    const mm = txt.length > 4 ? Number(txt.slice(0, -4)) : 0;
    if (mm > 0 && ss > 59) return NaN;
    return Math.round((mm * 60 + ss + cs / 100) * 1000);
  }
  const m = txt.match(/^(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)$/);
  if (!m) return NaN;
  return Math.round((Number(m[1] || 0) * 60 + Number(m[2])) * 1000);
}
