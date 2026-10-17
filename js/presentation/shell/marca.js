// Club identity helpers for the shell (name, motto, logo). Values may arrive with any type from a hand-edited file:
// they are always treated as text.
import { h } from '../ui.js';

export const NOMBRE_POR_DEFECTO = 'CNL Plataforma';
export const texto = (x) => String(x ?? '').trim();
export const nombreClub = (store) => texto(store?.club?.nombre) || NOMBRE_POR_DEFECTO;
export const lemaClub = (store) => texto(store?.club?.lema);

export function logoEl(store, size = 44) {
  const src = store?.club?.logo;
  if (src && /^data:image\//.test(src)) {
    // corrupt data: URL -> fall back to the default icon instead of showing a broken image
    return h('img', { class: 'logo', src, alt: '', width: size, height: size, onerror: (e) => { e.target.onerror = null; e.target.src = './icons/icon.svg'; } });
  }
  return h('img', { class: 'logo', src: './icons/icon.svg', alt: '', width: size, height: size });
}
