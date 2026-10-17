// Banners under the header (#cnl-avisos): demo mode, new version, offline and data-integrity notices.
// They use the shared `.alert` component (css/components.css) and are only repainted when their content changes, so a
// store event never makes a screen reader repeat the same alert.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/i18n.js';
import { estaOffline } from './offline.js';
import { accionDriveEnDemo } from './conexion.js';

const PRIVACIDAD = 'privacidadAceptada';
const ICONO = { info: 'info', warn: 'aviso', danger: 'aviso', ok: 'check' };

// Banner entries for the current state. { id, tono: 'info'|'warn'|'danger', texto, boton?: [label, fn], boton2?: [label, fn] }
export function avisosActuales(rt) {
  const { store, auth, prefs } = rt;
  const out = [];
  if (rt.conexion?.esDemo()) {
    out.push({ id: 'demo', tono: 'info', texto: t('shell.demo.texto'), boton: accionDriveEnDemo(rt.conexion), boton2: [t('shell.demo.salir'), () => rt.conexion.salirDeDemo()], region: t('shell.demo.titulo') });
  }
  if (rt.actualizarVersion) out.push({ id: 'actualizacion', tono: 'info', texto: t('shell.update.texto'), boton: [t('shell.update.boton'), () => rt.actualizarVersion()] });
  if (rt.offline && !rt.conexion?.esDemo()) out.push({ id: 'sin-conexion', tono: 'warn', texto: t('shell.offline.texto'), icono: 'sin-conexion' });
  if (store?.soloLectura) out.push({ id: 'solo-lectura', tono: 'danger', texto: t('dat.solo-lectura', { version: store.soloLectura.version }), boton: [t('dat.recargar'), () => location.reload()] });
  if (auth?.caducada) out.push({ id: 'sesion-caducada', tono: 'warn', texto: t('dat.sesion-caducada'), boton: [t('dat.reconectar'), () => rt.reconectar()] });
  if (store?.status === 'error' && store.lastError && store.lastError.code === 'cache-llena') out.push({ id: 'cache-llena', tono: 'danger', texto: t('dat.cache-llena') });
  const dup = store?.avisos?.length || 0;
  if (dup) out.push({ id: 'avisos-lectura', tono: 'warn', texto: t('dat.avisos-lectura', { n: dup }) });
  if (prefs && !prefs.get(PRIVACIDAD)) out.push({ id: 'privacidad', tono: 'info', texto: t('dat.privacidad'), boton: [t('dat.entendido'), () => { prefs.set(PRIVACIDAD, true); pintarBanners(rt); }] });
  return out;
}

const firma = (lista) => lista.map((a) => `${a.id}|${a.texto}|${a.boton?.[0] || ''}`).join('\n');

function banner(a) {
  const botones = [a.boton, a.boton2].filter(Boolean);
  return h('div', {
    class: `alert alert--${a.tono} banner`,
    role: a.tono === 'info' ? 'status' : 'alert',
    dataset: { aviso: a.id },
    ...(a.region ? { 'aria-label': a.region } : {}),
  },
  icon(a.icono || ICONO[a.tono] || 'info', { size: 20 }),
  h('p', { class: 'banner-text' }, a.texto),
  botones.length ? h('div', { class: 'banner-actions' }, botones.map(([label, fn], i) => h('button', { type: 'button', class: 'btn btn-sm' + (i === 0 && a.id === 'demo' ? ' btn--primary' : ''), onclick: fn }, label))) : null);
}

// Repaints the banner area if (and only if) something changed. `forzar` repaints anyway (language change).
export function pintarBanners(rt, { forzar = false } = {}) {
  const slot = document.getElementById('cnl-avisos');
  if (!slot) return;
  const lista = avisosActuales(rt);
  const f = firma(lista);
  if (!forzar && slot.dataset.firma === f) return;
  slot.dataset.firma = f;
  slot.replaceChildren(...lista.map(banner));
  slot.hidden = !lista.length;
}
