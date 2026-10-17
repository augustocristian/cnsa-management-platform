// Integration context: jsdom + Google test adapter (infrastructure/fakeGoogle.js) + store with a club
// seeded with seedDemo + the views' ctx. Google is never contacted: the "Drive" lives in memory.
import { setupEnv, importApp, tick } from './env.js';

export { tick };

export const VIEWS = ['inicio', 'nadadores', 'grupos', 'entrenamientos', 'asistencia', 'cargas', 'marcas', 'comunicaciones', 'club'];

let ctxCache = null;

let booted = null;
export function boot({ xlsx = false } = {}) {
  return (booted ||= doBoot(xlsx));
}

async function doBoot(xlsx) {
  setupEnv({ loadXlsx: true });
  const [{ store }, { driveConnection: auth }, { drive }, config, ui, { instalarFakeGoogle }, { preferencias }] = await Promise.all([
    importApp('js/store.js'), importApp('js/infrastructure/driveConnection.js'), importApp('js/drive.js'), importApp('js/config.js'), importApp('js/ui.js'),
    importApp('js/infrastructure/fakeGoogle.js'), importApp('js/preferencias.js'),
  ]);
  ctxCache = { store, auth, conexion: auth, drive, ui, config, instalarFakeGoogle, preferencias };
  return ctxCache;
}

// Clean state: empty DOM, new simulated Drive already connected, one club open with the demo (or empty).
export async function fresh({ demo = true, xlsx = false, club = 'Club Test' } = {}) {
  await boot({ xlsx });
  const ctx = ctxCache;
  document.body.replaceChildren();
  document.head.replaceChildren();
  localStorage.clear();
  localStorage.setItem('cnl:lang', 'es');
  (await importApp('js/i18n.js')).setLang('es');
  location.hash = '';
  ctx.preferencias.desconectar();
  const fake = ctx.instalarFakeGoogle({ auth: ctx.auth, drive: ctx.drive, config: ctx.config, opciones: { conectado: true } });
  await ctx.auth.init();
  const ref = await ctx.drive.createClub(club);
  await ctx.store.init(ref);
  if (demo) ctx.store.seedDemo(); else ctx.store.clear();
  const container = document.createElement('main');
  document.body.appendChild(container);
  return { ...ctx, fake, ref, container };
}

export async function renderView(name, container, params, ctx) {
  const mod = await importApp(`js/views/${name}.js`);
  await mod.render(container, params, { store: ctx.store, auth: ctx.auth, ui: ctx.ui });
  await tick();
  return mod;
}

// Finds the form element inside the <label> whose text starts with `text`.
export function fieldByLabel(root, text) {
  const l = [...root.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(text));
  if (!l) throw new Error('No label: ' + text);
  return l.querySelector('input,select,textarea');
}

export function buttonByText(root, text) {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent.trim() === text);
  if (!b) throw new Error('No button: ' + text);
  return b;
}

export function setValue(el, v) {
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}
