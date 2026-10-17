// Step-by-step tutorial (5 minutes): the deployment owner sets up Google ONCE (a project, the Drive API, the consent screen with the
// single drive.file permission and an OAuth Client ID); everyone else just connects Google Drive. It ends with the individual-use model
// (data in your own Drive, nothing shared) and a mention of the demo mode. Texts live in js/presentation/i18n/locales/acceso.*.js (keys tutorial.*).
// Progress is a user preference (cnl/preferencias.json in their Drive; localStorage is only a cache).
import { h, toast, field } from '../ui.js';
import { icon } from '../icons.js';
import { t, onLangChange } from '../i18n/i18n.js';
import { useStyles } from '../styles.js';
import { CLIENT_ID_KEY, isValidClientId } from '../../domain/clienteGoogle.js';

export { CLIENT_ID_KEY };

const PROD_ORIGIN = 'https://augustocristian.github.io';
const DEV_ORIGIN = 'http://localhost:4173';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const CONSOLE = 'https://console.cloud.google.com';

// items = number of bullets (tutorial.pasoN.iK); links/copies = [key suffix, url|value]
const STEPS = [
  { items: 3, links: [['crear-proyecto', `${CONSOLE}/projectcreate`]] },
  { items: 3, links: [['drive-api', `${CONSOLE}/apis/library/drive.googleapis.com`]] },
  { items: 5, links: [['consentimiento', `${CONSOLE}/apis/credentials/consent`]], copies: [['scope-drive', SCOPE_DRIVE]], warn: true },
  { items: 4, links: [['credenciales', `${CONSOLE}/apis/credentials`]], copies: [['origen-prod', PROD_ORIGIN], ['origen-dev', DEV_ORIGIN], ['origen-actual', location.origin]] },
  { items: 2, copies: [['config', "const BUILTIN_CLIENT_ID = 'YOUR_ID.apps.googleusercontent.com';"]], clientField: true },
  { items: 5, links: [['drive', 'https://drive.google.com/drive/my-drive']] },
];

// prefs / CLAVES: the preferences service and its keys (ctx.prefs, ctx.CLAVES); config.setClientId: ctx.config.
function loadProgress({ prefs, CLAVES }) {
  const p = prefs.get(CLAVES.tutorial, { done: [], current: 1 });
  return { done: Array.isArray(p.done) ? p.done.filter((n) => n >= 1 && n <= STEPS.length) : [], current: Number(p.current) || 1 };
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* clipboard unavailable: the value stays visible to copy by hand */ }
    ta.remove();
  }
  toast(t('common.copiado'));
}

export async function render(container, params, ctx) {
  useStyles('tutorial');
  const { prefs, CLAVES, config } = ctx;
  const setClientId = (v) => config.setClientId(v);
  const saveProgress = (p) => prefs.set(CLAVES.tutorial, { done: p.done, current: p.current });
  const total = STEPS.length;
  const state = loadProgress(ctx);
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

  // A value to copy: visible code + a button whose accessible name says WHAT it copies
  const copyRow = ([k, v]) => {
    const etiqueta = t(`tutorial.copy.${k}`);
    return h('div', { class: 'tut-copy' },
      h('span', { class: 'tut-copy-label' }, etiqueta),
      h('div', { class: 'tut-val' }, h('code', null, v),
        h('button', { type: 'button', class: 'btn', 'aria-label': `${t('common.copiar')}: ${etiqueta}`, onclick: () => copyText(v) }, icon('copiar', { size: 16 }), t('common.copiar'))));
  };

  const storedId = () => { try { return localStorage.getItem(CLIENT_ID_KEY) || ''; } catch (e) { return ''; } };

  function clientField() {
    const input = h('input', { type: 'text', id: 'tut-clientid', autocomplete: 'off', spellcheck: 'false', value: storedId(), placeholder: '123456-abc.apps.googleusercontent.com' });
    return h('div', { class: 'tut-field' },
      field({ label: t('tutorial.paso5.campo'), input }),
      h('div', { class: 'tut-row' },
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => {
          const v = input.value.trim();
          if (!isValidClientId(v)) { toast.error(t('tutorial.paso5.invalido')); input.focus(); return; }
          setClientId(v);
          toast(t('tutorial.paso5.guardado'));
        } }, t('tutorial.paso5.guardar')),
        h('button', { type: 'button', class: 'btn', onclick: () => { setClientId(''); input.value = ''; toast(t('tutorial.paso5.borrado')); } }, t('tutorial.paso5.borrar')),
        h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, t('tutorial.paso5.recargar'))));
  }

  function draw() {
    const n = state.current;
    const s = STEPS[n - 1];
    const isDone = state.done.includes(n);
    const pct = Math.round((state.done.length / total) * 100);
    const P = `tutorial.paso${n}`;

    root.replaceChildren(
      h('header', { class: 'page-head' },
        h('h1', null, icon('ayuda', { size: 26 }), t('tutorial.titulo')),
        h('div', { class: 'page-head-actions' },
          h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => { state.done = []; state.current = 1; saveProgress(state); toast(t('tutorial.reiniciado')); draw(); } }, t('tutorial.reiniciar')))),
      h('p', { class: 'tut-intro' }, t('tutorial.intro', { total })),

      h('section', { class: 'tut-progreso', 'aria-label': t('tutorial.progreso', { hecho: state.done.length, total }) },
        h('div', { class: 'progress progress--ok', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': t('tutorial.progreso', { hecho: state.done.length, total }), style: { '--value': pct + '%' } }, h('span')),
        h('p', { class: 'hint' }, t('tutorial.progreso', { hecho: state.done.length, total })),
        state.done.length === total ? h('div', { class: 'alert alert--ok', role: 'status' }, icon('check', { size: 18 }), h('p', null, t('tutorial.completo'))) : null,
        h('ol', { class: 'tut-steps', 'aria-label': t('tutorial.pasos') }, STEPS.map((_, i) => h('li', null, h('button', {
          type: 'button', 'aria-label': t('tutorial.paso-n', { n: i + 1, total }) + (state.done.includes(i + 1) ? ` (${t('tutorial.hecho')})` : ''), 'aria-current': i + 1 === n ? 'step' : null,
          class: 'tut-chip' + (state.done.includes(i + 1) ? ' done' : '') + (i + 1 === n ? ' cur' : ''),
          onclick: () => go(i + 1),
        }, state.done.includes(i + 1) ? icon('check', { size: 16 }) : String(i + 1)))))),

      h('section', { class: 'tut-paso', dataset: { step: n }, 'aria-labelledby': 'tut-paso-t' },
        h('p', { class: 'muted tut-paso-n' }, t('tutorial.paso-n', { n, total })),
        h('h2', { id: 'tut-paso-t' }, t(`${P}.titulo`)),
        h('p', null, t(`${P}.intro`)),
        h('ol', { class: 'tut-list' }, Array.from({ length: s.items }, (_, i) => h('li', null, t(`${P}.i${i + 1}`)))),
        s.warn ? h('div', { class: 'alert alert--warn', role: 'note' }, icon('aviso', { size: 18 }),
          h('div', null, h('p', { class: 'alert-title' }, t('tutorial.aviso.titulo')), h('p', null, t('tutorial.aviso.texto')), h('p', null, t('tutorial.aviso.caducidad')))) : null,
        s.links ? h('div', null, h('h3', null, t('tutorial.enlaces')),
          h('div', { class: 'tut-row' }, s.links.map(([k, url]) =>
            h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer' }, t('tutorial.link.' + k), icon('flecha-dcha', { size: 14 }))))) : null,
        s.copies ? h('div', null, h('h3', null, t('tutorial.valores')), s.copies.map(copyRow)) : null,
        s.clientField ? clientField() : null,
        h('div', { class: 'tut-nav' },
          h('button', { type: 'button', class: 'btn', disabled: n === 1, onclick: () => go(n - 1) }, t('tutorial.anterior')),
          h('button', { type: 'button', class: 'btn' + (isDone ? '' : ' btn--primary'), onclick: () => toggle(n) }, isDone ? t('tutorial.desmarcar') : t('tutorial.marcar')),
          h('button', { type: 'button', class: 'btn', disabled: n === total, onclick: () => go(n + 1) }, t('tutorial.siguiente')))));
  }

  draw();
  // Redraws when the language changes while the view is still mounted.
  const off = onLangChange(() => { if (root.isConnected) draw(); else off(); });
}
