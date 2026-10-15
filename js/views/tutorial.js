// Tutorial paso a paso para configurar la app con Google. Progreso en localStorage.
import { h, toast } from '../ui.js';
import { t, onLangChange } from '../i18n.js';

export const PROGRESS_KEY = 'cnl:tutorial';
export const CLIENT_ID_KEY = 'cnl:clientId';

const PROD_ORIGIN = 'https://augustocristian.github.io';
const DEV_ORIGIN = 'http://localhost:4173';
const SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const CONSOLE = 'https://console.cloud.google.com';

// items = nº de viñetas tNpasoN.iK; links/copies = [claveSufijo, url|valor]
const STEPS = [
  { items: 3, links: [['crear-proyecto', `${CONSOLE}/projectcreate`]] },
  { items: 3, links: [['sheets-api', `${CONSOLE}/apis/library/sheets.googleapis.com`], ['drive-api', `${CONSOLE}/apis/library/drive.googleapis.com`]] },
  { items: 5, links: [['consentimiento', `${CONSOLE}/apis/credentials/consent`]], copies: [['scope-sheets', SCOPE_SHEETS], ['scope-drive', SCOPE_DRIVE]], warn: true },
  { items: 5, links: [['credenciales', `${CONSOLE}/apis/credentials`]], copies: [['origen-prod', PROD_ORIGIN], ['origen-dev', DEV_ORIGIN]] },
  { items: 2, copies: [['config', "export const GOOGLE_CLIENT_ID = 'TU_ID.apps.googleusercontent.com';"]], clientField: true },
  { items: 4 },
  { items: 3, links: [['drive', 'https://drive.google.com/drive/my-drive']] },
  { items: 3 }
];

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignorar */ } };

function loadProgress() {
  try {
    const p = JSON.parse(lsGet(PROGRESS_KEY) || '{}');
    return { done: Array.isArray(p.done) ? p.done.filter((n) => n >= 1 && n <= STEPS.length) : [], current: Number(p.current) || 1 };
  } catch (e) { return { done: [], current: 1 }; }
}
const saveProgress = (p) => lsSet(PROGRESS_KEY, JSON.stringify(p));

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignorar */ }
    ta.remove();
  }
  toast(t('common.copiado'));
}

const CSS = `
.tut-wrap{max-width:860px;margin:0 auto;display:grid;gap:1rem}
.tut-bar{height:10px;border-radius:99px;background:var(--c-primary-soft);overflow:hidden}
.tut-bar>span{display:block;height:100%;background:var(--ok);transition:width .25s}
.tut-steps{display:flex;gap:.4rem;flex-wrap:wrap}
.tut-chip{width:2.4rem;height:2.4rem;border-radius:50%;border:2px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;cursor:pointer}
.tut-chip.done{background:var(--ok);border-color:var(--ok);color:#fff}
.tut-chip.cur{border-color:var(--c-primary);box-shadow:0 0 0 3px var(--c-primary-mid)}
.tut-list{padding-left:1.2rem;display:grid;gap:.45rem}
.tut-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.35rem 0}
.tut-copy{display:grid;gap:.25rem;margin:.5rem 0}
.tut-copy small{color:var(--muted)}
.tut-copy .tut-val{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.tut-copy code{background:var(--c-primary-soft);padding:.3rem .55rem;border-radius:8px;word-break:break-all;font-size:.85rem}
.tut-warn{border-left:4px solid var(--warn);background:#fff7e6;padding:.7rem 1rem;border-radius:8px;color:#5b3d00}
.tut-warn p{margin:.3rem 0}
.tut-field{display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end;margin:.6rem 0}
.tut-field label{display:grid;gap:.2rem;flex:1 1 280px}
.tut-field input{padding:.55rem;border:1px solid var(--border);border-radius:8px;font:inherit}
.tut-nav{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
.tut-ok{color:var(--ok);font-weight:600}
`;

export async function render(container, params, ctx) {
  if (!document.getElementById('tut-style')) {
    document.head.appendChild(h('style', { id: 'tut-style' }, CSS));
  }
  const total = STEPS.length;
  const state = loadProgress();
  const asked = Number(params?.paso ?? params?.step ?? params?.[0]);
  if (asked >= 1 && asked <= total) state.current = asked;
  state.current = Math.min(Math.max(state.current, 1), total);

  const root = h('div', { class: 'tut-wrap' });
  container.replaceChildren(root);

  const go = (n) => { state.current = Math.min(Math.max(n, 1), total); saveProgress(state); draw(); root.scrollIntoView?.({ block: 'start' }); };
  const toggle = (n) => {
    const i = state.done.indexOf(n);
    if (i >= 0) state.done.splice(i, 1); else state.done.push(n);
    saveProgress(state);
    if (i < 0 && n < total) { state.current = n + 1; saveProgress(state); }
    draw();
  };

  const copyRow = ([k, v]) => h('div', { class: 'tut-copy' },
    h('small', null, t(`tutorial.copy.${k}`)),
    h('div', { class: 'tut-val' }, h('code', null, v),
      h('button', { type: 'button', class: 'btn', onclick: () => copyText(v) }, t('common.copiar'))));

  function clientField() {
    const input = h('input', { type: 'text', id: 'tut-clientid', autocomplete: 'off', spellcheck: 'false', value: lsGet(CLIENT_ID_KEY) || '', placeholder: '123456-abc.apps.googleusercontent.com' });
    return h('div', { class: 'tut-field' },
      h('label', null, h('span', null, t('tutorial.paso5.campo')), input),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
        const v = input.value.trim();
        if (!/\.apps\.googleusercontent\.com$/.test(v)) { toast(t('tutorial.paso5.invalido'), 4500); return; }
        lsSet(CLIENT_ID_KEY, v); toast(t('tutorial.paso5.guardado'), 4500);
      } }, t('tutorial.paso5.guardar')),
      h('button', { type: 'button', class: 'btn', onclick: () => { lsSet(CLIENT_ID_KEY, null); input.value = ''; toast(t('tutorial.paso5.borrado')); } }, t('tutorial.paso5.borrar')),
      h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, t('tutorial.paso5.recargar')));
  }

  function draw() {
    const n = state.current;
    const s = STEPS[n - 1];
    const isDone = state.done.includes(n);
    const pct = Math.round((state.done.length / total) * 100);
    const P = `tutorial.paso${n}`;

    root.replaceChildren(
      h('div', { class: 'card' },
        h('h2', null, t('tutorial.titulo')),
        h('p', { class: 'muted' }, t('tutorial.intro', { total })),
        h('div', { class: 'tut-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('span', { style: { width: pct + '%' } })),
        h('p', { class: 'muted' }, t('tutorial.progreso', { hecho: state.done.length, total })),
        state.done.length === total ? h('p', { class: 'tut-ok' }, t('tutorial.completo')) : null,
        h('div', { class: 'tut-steps' }, STEPS.map((_, i) => h('button', {
          type: 'button', 'aria-label': t('tutorial.paso-n', { n: i + 1, total }), 'aria-current': i + 1 === n ? 'step' : null,
          class: 'tut-chip' + (state.done.includes(i + 1) ? ' done' : '') + (i + 1 === n ? ' cur' : ''),
          onclick: () => go(i + 1)
        }, state.done.includes(i + 1) ? '✓' : String(i + 1))))),

      h('div', { class: 'card', dataset: { step: n } },
        h('p', { class: 'muted' }, t('tutorial.paso-n', { n, total })),
        h('h3', null, t(`${P}.titulo`)),
        h('p', null, t(`${P}.intro`)),
        h('ol', { class: 'tut-list' }, Array.from({ length: s.items }, (_, i) => h('li', null, t(`${P}.i${i + 1}`)))),
        s.links ? h('div', null, h('strong', null, t('tutorial.enlaces')),
          h('div', { class: 'tut-row' }, s.links.map(([k, url]) =>
            h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer' }, `${t('tutorial.link.' + k)} ↗`)))) : null,
        s.copies ? h('div', null, h('strong', null, t('tutorial.valores')), s.copies.map(copyRow)) : null,
        s.clientField ? clientField() : null,
        s.warn ? h('div', { class: 'tut-warn', role: 'note' },
          h('strong', null, t('tutorial.aviso.titulo')),
          h('p', null, t('tutorial.aviso.texto')),
          h('p', null, t('tutorial.aviso.caducidad'))) : null,
        h('div', { class: 'tut-nav' },
          h('button', { type: 'button', class: 'btn', disabled: n === 1, onclick: () => go(n - 1) }, t('tutorial.anterior')),
          h('button', { type: 'button', class: 'btn' + (isDone ? '' : ' btn-primary'), onclick: () => toggle(n) },
            isDone ? t('tutorial.desmarcar') : t('tutorial.marcar')),
          h('button', { type: 'button', class: 'btn', disabled: n === total, onclick: () => go(n + 1) }, t('tutorial.siguiente')))),

      h('div', null, h('button', { type: 'button', class: 'btn btn-link', onclick: () => {
        state.done = []; state.current = 1; saveProgress(state); toast(t('tutorial.reiniciado')); draw();
      } }, t('tutorial.reiniciar'))));
  }

  draw();
  // Re-dibuja al cambiar de idioma mientras la vista siga montada.
  const off = onLangChange(() => { if (root.isConnected) draw(); else off(); });
}
