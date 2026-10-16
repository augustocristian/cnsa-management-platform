// May the Google simulator (infrastructure/fakeGoogle.js) be activated? A PURE, minimal decision evaluated before loading it.
//  - window.__CNL_TEST__ is injected by the test runner (Playwright addInitScript): valid on any host.
//  - localStorage['cnl:test']='1' is only valid on localhost / 127.0.0.1 / [::1]: on a real domain a stale value never replaces Google.
export const HOSTS_LOCALES = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function pruebasPermitidas(entorno = globalThis) {
  try { if (entorno.__CNL_TEST__) return true; } catch (e) { /* ignore */ }
  let host = '';
  try { host = String((entorno.location && entorno.location.hostname) || ''); } catch (e) { host = ''; }
  if (!HOSTS_LOCALES.includes(host)) return false;
  try { return entorno.localStorage.getItem('cnl:test') === '1'; } catch (e) { return false; }
}
