// "Install the app" prompt (beforeinstallprompt) and service worker registration with a user-driven update flow.
import { h } from '../../ui.js';
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

export const CLAVE_INSTALAR_DESCARTADO = 'cnl:install-dismissed'; // device-only preference

export function configurarInstalacion() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (lsGet(CLAVE_INSTALAR_DESCARTADO) === '1' || document.getElementById('install-banner')) return;
    const banner = h('div', { id: 'install-banner', class: 'install-banner', role: 'region', 'aria-label': t('shell.install.texto') },
      icon('descargar', { size: 20 }),
      h('span', null, t('shell.install.texto')),
      h('button', {
        class: 'btn btn--primary btn-sm', type: 'button',
        onclick: async () => { banner.remove(); deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; },
      }, t('shell.install.boton')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('shell.install.descartar'), onclick: () => { lsSet(CLAVE_INSTALAR_DESCARTADO, '1'); banner.remove(); } }, icon('cerrar', { size: 18 })));
    document.body.appendChild(banner);
  });
  window.addEventListener('appinstalled', () => document.getElementById('install-banner')?.remove());
}

// Registers sw.js. A new worker never takes over by itself: `onActualizacion(activar)` is called when one is waiting and
// `activar()` (to be called from a user action) tells it to take over; the page reloads once the new worker controls it.
export function registrarServiceWorker({ onActualizacion } = {}) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return Promise.resolve(null);
  let recargar = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargar) location.reload(); });
  const avisar = (reg) => {
    if (!reg.waiting || !navigator.serviceWorker.controller) return; // first install: nothing to update
    onActualizacion?.(() => { recargar = true; reg.waiting.postMessage({ type: 'SKIP_WAITING' }); });
  };
  return navigator.serviceWorker.register('./sw.js').then((reg) => {
    avisar(reg);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => { if (nuevo.state === 'installed') avisar(reg); });
    });
    // Look for a new version when the user comes back to the tab (cheap: a conditional request for sw.js).
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    return reg;
  }).catch((e) => { console.warn('SW', e); return null; });
}
