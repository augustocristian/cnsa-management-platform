// Language switch: a radio group of flag buttons (hand-drawn SVG, no emoji, no <select>).
// Usage: header.append(langSwitch()) or langSwitch({ labels: true }).
import { LANGS, getLang, setLang, onLangChange, t } from './i18n/i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.forEach((c) => e.append(c));
  return e;
};

// Flags in a 3:2 box (viewBox 0 0 30 20). Simplified, recognisable at 20-28px.
const FLAGS = {
  es: () => [
    el('rect', { width: 30, height: 20, fill: '#c60b1e' }),
    el('rect', { y: 5, width: 30, height: 10, fill: '#ffc400' }),
  ],
  en: () => [
    el('rect', { width: 30, height: 20, fill: '#012169' }),
    el('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#fff', 'stroke-width': 4 }),
    el('path', { d: 'M0 0L30 20M30 0L0 20', stroke: '#c8102e', 'stroke-width': 1.6 }),
    el('path', { d: 'M15 0V20M0 10H30', stroke: '#fff', 'stroke-width': 6.5 }),
    el('path', { d: 'M15 0V20M0 10H30', stroke: '#c8102e', 'stroke-width': 3.6 }),
  ],
  it: () => [
    el('rect', { width: 10, height: 20, fill: '#009246' }),
    el('rect', { x: 10, width: 10, height: 20, fill: '#fff' }),
    el('rect', { x: 20, width: 10, height: 20, fill: '#ce2b37' }),
  ],
};

export function flagIcon(code, size = 22) {
  const draw = FLAGS[code];
  const svg = el('svg', { viewBox: '0 0 30 20', width: size, height: Math.round((size * 2) / 3), 'aria-hidden': 'true', focusable: 'false', class: 'flag' });
  const id = `flag-clip-${code}`;
  svg.append(el('defs', {}, el('clipPath', { id }, el('rect', { width: 30, height: 20, rx: 3 }))));
  const g = el('g', { 'clip-path': `url(#${id})` });
  (draw ? draw() : [el('rect', { width: 30, height: 20, fill: '#888' })]).forEach((n) => g.append(n));
  g.append(el('rect', { width: 30, height: 20, rx: 3, fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': 1 }));
  svg.append(g);
  return svg;
}

export function langSwitch({ labels = false, size = 22 } = {}) {
  const root = document.createElement('div');
  root.className = 'lang-switch' + (labels ? ' lang-switch--labels' : '');
  root.setAttribute('role', 'radiogroup');
  const buttons = new Map();

  const paint = () => {
    root.setAttribute('aria-label', t('lang.etiqueta'));
    const current = getLang();
    for (const [code, b] of buttons) {
      const on = code === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-active', on);
    }
  };

  for (const l of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-switch__btn';
    b.dataset.lang = l.code;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', l.label); // native name: "Español", "English", "Italiano"
    b.title = l.label;
    b.append(flagIcon(l.code, size));
    if (labels) {
      const s = document.createElement('span');
      s.textContent = l.code.toUpperCase();
      b.append(s);
    }
    b.addEventListener('click', () => setLang(l.code));
    buttons.set(l.code, b);
    root.append(b);
  }

  // Roving tabindex + arrow keys, as expected from a radio group.
  root.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const codes = [...buttons.keys()];
    const next = codes[(codes.indexOf(getLang()) + step + codes.length) % codes.length];
    setLang(next);
    buttons.get(next).focus();
  });

  paint();
  root._dispose = onLangChange(paint);
  return root;
}
