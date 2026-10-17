// First-run wizard: DOM-free logic (validation and creation of the club in Drive).
// The UI is in js/views/asistente.js; everything here is received as a parameter so it can be tested without network.
import { zonaValida, TZ_DEFECTO } from '../domain/calendario.js';

export const PASOS = ['datos', 'aspecto'];
export const COLOR_PRIMARIO = '#1a73e8';
export const COLOR_SECUNDARIO = '#0b3d91';
const HEX = /^#[0-9a-f]{6}$/i;

// The browser's time zone if it is valid; otherwise the domain default.
export function zonaDelNavegador() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && zonaValida(z) ? z : TZ_DEFECTO;
  } catch (e) { return TZ_DEFECTO; }
}

// -> {ok, errores: {campo: codigo}} (the codes are translated with 'asistente.err.<codigo>')
export function validar(datos, paso = 'todo') {
  const errores = {};
  const d = datos || {};
  if (paso === 'datos' || paso === 'todo') {
    const n = String(d.nombre || '').trim();
    if (!n) errores.nombre = 'nombre-vacio';
    else if (n.length < 2) errores.nombre = 'nombre-corto';
    else if (n.length > 60) errores.nombre = 'nombre-largo';
    if (String(d.lema || '').length > 120) errores.lema = 'lema-largo';
  }
  if (paso === 'aspecto' || paso === 'todo') {
    if (d.colorPrimario && !HEX.test(d.colorPrimario)) errores.colorPrimario = 'color';
    if (d.colorSecundario && !HEX.test(d.colorSecundario)) errores.colorSecundario = 'color';
    if (d.zonaHoraria && !zonaValida(d.zonaHoraria)) errores.zonaHoraria = 'zona';
  }
  return { ok: Object.keys(errores).length === 0, errores };
}

// Wizard data -> `club` object (keys of the Club sheet) with sensible defaults.
export function datosDelClub(d) {
  return {
    nombre: String(d.nombre || '').trim(),
    lema: String(d.lema || '').trim(),
    colorPrimario: HEX.test(d.colorPrimario || '') ? d.colorPrimario : COLOR_PRIMARIO,
    colorSecundario: HEX.test(d.colorSecundario || '') ? d.colorSecundario : COLOR_SECUNDARIO,
    zonaHoraria: d.zonaHoraria && zonaValida(d.zonaHoraria) ? d.zonaHoraria : zonaDelNavegador(),
  };
}

// Creates the club file in cnl/ and returns {ref, club}; opening it (store.init + store.setClub) is up to the caller.
export async function crearClub({ drive, datos }) {
  const v = validar(datos);
  if (!v.ok) { const e = new Error('datos-invalidos'); e.code = 'datos-invalidos'; e.errores = v.errores; throw e; }
  const club = datosDelClub(datos);
  const ref = await drive.createClub(club.nombre);
  return { ref: { id: ref.id, name: ref.name, url: ref.url }, club };
}
