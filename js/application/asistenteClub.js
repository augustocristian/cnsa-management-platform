// Asistente de primer arranque: lógica sin DOM (validación y creación del club en Drive).
// La interfaz está en js/views/asistente.js; aquí todo se recibe por parámetro para probarlo sin red.
import { zonaValida, TZ_DEFECTO } from '../domain/calendario.js';

export const PASOS = ['datos', 'aspecto'];
export const COLOR_PRIMARIO = '#1a73e8';
export const COLOR_SECUNDARIO = '#0b3d91';
const HEX = /^#[0-9a-f]{6}$/i;

// Zona horaria del navegador si es válida; si no, la de por defecto del dominio.
export function zonaDelNavegador() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && zonaValida(z) ? z : TZ_DEFECTO;
  } catch (e) { return TZ_DEFECTO; }
}

// -> {ok, errores: {campo: codigo}} (los códigos se traducen con 'asistente.err.<codigo>')
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

// Datos del asistente -> objeto `club` (claves de la pestaña Club) con valores por defecto sensatos.
export function datosDelClub(d) {
  return {
    nombre: String(d.nombre || '').trim(),
    lema: String(d.lema || '').trim(),
    colorPrimario: HEX.test(d.colorPrimario || '') ? d.colorPrimario : COLOR_PRIMARIO,
    colorSecundario: HEX.test(d.colorSecundario || '') ? d.colorSecundario : COLOR_SECUNDARIO,
    zonaHoraria: d.zonaHoraria && zonaValida(d.zonaHoraria) ? d.zonaHoraria : zonaDelNavegador(),
  };
}

// Crea el fichero del club en cnl/ y devuelve {ref, club}; abrirlo (store.init + store.setClub) lo hace quien llama.
export async function crearClub({ drive, datos }) {
  const v = validar(datos);
  if (!v.ok) { const e = new Error('datos-invalidos'); e.code = 'datos-invalidos'; e.errores = v.errores; throw e; }
  const club = datosDelClub(datos);
  const ref = await drive.createClub(club.nombre);
  return { ref: { id: ref.id, name: ref.name, url: ref.url }, club };
}
