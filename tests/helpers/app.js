// Contexto de integración: jsdom + store sembrado con seedDemo + ctx de las vistas.
import { setupEnv, importApp, tick } from './env.js';

export { tick };

export const VIEWS = ['inicio', 'nadadores', 'grupos', 'entrenamientos', 'asistencia', 'cargas', 'marcas', 'banador', 'comunicaciones', 'club', 'mi-espacio'];

let ctxCache = null;

let booted = null;
export function boot({ xlsx = false } = {}) {
  return (booted ||= doBoot(xlsx));
}

async function doBoot(xlsx) {
  setupEnv({ loadXlsx: true });
  const [{ store }, { auth }, ui] = await Promise.all([importApp('js/store.js'), importApp('js/auth.js'), importApp('js/ui.js')]);
  ctxCache = { store, auth, ui };
  return ctxCache;
}

// Estado limpio: DOM vacío, store con la demo y rol admin.
export async function fresh({ demo = true, xlsx = false } = {}) {
  await boot({ xlsx });
  const ctx = ctxCache;
  document.body.replaceChildren();
  document.head.replaceChildren();
  localStorage.clear();
  location.hash = '';
  await ctx.store.init('Club Test');
  ctx.auth.setDemoRole(null);
  if (demo) ctx.store.seedDemo(); else ctx.store.clear();
  const container = document.createElement('main');
  document.body.appendChild(container);
  return { ...ctx, container };
}

export async function renderView(name, container, params, ctx) {
  const mod = await importApp(`js/views/${name}.js`);
  await mod.render(container, params, { store: ctx.store, auth: ctx.auth, ui: ctx.ui });
  await tick();
  return mod;
}

// Encuentra el elemento de formulario dentro de la <label> cuyo texto empieza por `text`.
export function fieldByLabel(root, text) {
  const l = [...root.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(text));
  if (!l) throw new Error('No hay label: ' + text);
  return l.querySelector('input,select,textarea');
}

export function buttonByText(root, text) {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent.trim() === text);
  if (!b) throw new Error('No hay botón: ' + text);
  return b;
}

export function setValue(el, v) {
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
