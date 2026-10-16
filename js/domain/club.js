// Pure rules about the club identity (name, motto, logo, colours). No DOM, no storage.
import { parseHex, toHex, DEFECTO } from './tema.js';

export const LOGO_LADO_MAX = 256; // px; larger logos are scaled down
export const LOGO_POR_DEFECTO = './icons/icon.svg'; // what the header shows without a logo

// Size for a logo scaled so its longest side is at most `max` (never enlarged).
export function escalaLogo(ancho, alto, max = LOGO_LADO_MAX) {
  const k = Math.min(1, max / Math.max(ancho, alto, 1));
  return { ancho: Math.max(1, Math.round(ancho * k)), alto: Math.max(1, Math.round(alto * k)) };
}

export const esDataUrlImagen = (s) => /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i.test(String(s || ''));

// The logo to show: the stored one when it is an image data URL, else the default icon.
export const logoVisible = (logo) => (esDataUrlImagen(logo) ? logo : LOGO_POR_DEFECTO);

// Value for <input type="color">: a valid #rrggbb or the default.
export function colorParaInput(valor, defecto) {
  const rgb = parseHex(String(valor || ''));
  return rgb ? toHex(rgb) : defecto;
}

// Form data -> clean identity values. Colours are valid lower-case hex or the default.
export function normalizarIdentidad(datos) {
  const d = datos || {};
  return {
    nombre: String(d.nombre ?? '').trim(),
    lema: String(d.lema ?? '').trim(),
    logo: esDataUrlImagen(d.logo) ? d.logo : '',
    colorPrimario: colorParaInput(d.colorPrimario, DEFECTO.primario),
    colorSecundario: colorParaInput(d.colorSecundario, DEFECTO.secundario),
  };
}

// -> [{campo, codigo}]. Codes: nombre-obligatorio.
export function validarIdentidad(datos) {
  return String((datos && datos.nombre) ?? '').trim() ? [] : [{ campo: 'nombre', codigo: 'nombre-obligatorio' }];
}

export const urlFicheroDrive = (id) => `https://drive.google.com/file/d/${id}/view`;
