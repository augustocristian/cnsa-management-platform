// Club identity card (Settings): name, motto, logo and the two brand colours, saved together with ONE explicit button.
import { h, field, fieldError, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { escalaLogo, logoVisible } from '../../domain/club.js';

// Reads an image file and returns it as a PNG data URL no larger than the logo limit.
function archivoALogo(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error);
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(t('club.imagenInvalida')));
      img.onload = () => {
        const { ancho, alto } = escalaLogo(img.width, img.height);
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        lienzo.getContext('2d').drawImage(img, 0, 0, ancho, alto);
        resolve(lienzo.toDataURL('image/png'));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

// svc: clubService. -> Node
export function tarjetaIdentidad(svc) {
  const actual = svc.identidad();
  const estado = { logo: actual.logo };
  const nombre = h('input', { type: 'text', value: actual.nombre, autocomplete: 'off' });
  const lema = h('input', { type: 'text', value: actual.lema, autocomplete: 'off' });
  const color1 = h('input', { type: 'color', value: actual.colorPrimario });
  const color2 = h('input', { type: 'color', value: actual.colorSecundario });

  // The file input is hidden and driven by a translated button (the native picker text follows the browser language).
  const vista = h('img', { class: 'clb-logo', alt: t('club.logoAlt'), src: logoVisible(estado.logo) });
  const nombreArchivo = h(
    'span',
    { class: 'hint clb-logo-estado', 'aria-live': 'polite' },
    estado.logo ? '' : t('club.logo-por-defecto'),
  );
  const archivo = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  const quitar = h('button', { type: 'button', class: 'btn btn--ghost', hidden: !estado.logo }, t('club.quitarLogo'));
  const elegir = h('button', { type: 'button', class: 'btn', onclick: () => archivo.click() }, t('club.elegirLogo'));

  const pintarLogo = () => {
    vista.src = logoVisible(estado.logo);
    quitar.hidden = !estado.logo;
    nombreArchivo.textContent = estado.logo ? '' : t('club.logo-por-defecto');
  };
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    try {
      estado.logo = await archivoALogo(f);
      pintarLogo();
      nombreArchivo.textContent = f.name;
    } catch (e) {
      toast.error(e.message || t('club.imagenInvalida'));
    }
  });
  quitar.addEventListener('click', () => {
    estado.logo = '';
    archivo.value = '';
    pintarLogo();
  });

  const guardar = () => {
    const r = svc.guardarIdentidad({
      nombre: nombre.value,
      lema: lema.value,
      logo: estado.logo,
      colorPrimario: color1.value,
      colorSecundario: color2.value,
    });
    if (!r.ok) {
      fieldError(nombre, t('club.err.' + r.errores[0].codigo));
      return;
    }
    toast(t('club.identidadGuardada'));
  };

  return h(
    'section',
    { class: 'card clb-card', 'aria-labelledby': 'clb-identidad-t' },
    h('h2', { id: 'clb-identidad-t' }, t('club.identidad')),
    h(
      'div',
      { class: 'form-grid' },
      field({ label: t('club.nombre'), input: nombre, required: true }),
      field({ label: t('club.lema'), input: lema }),
    ),
    h(
      'div',
      { class: 'clb-logo-fila' },
      vista,
      h(
        'div',
        { class: 'clb-logo-acciones' },
        h('span', { class: 'field-label' }, t('club.logo')),
        h('div', { class: 'clb-botones' }, elegir, quitar),
        nombreArchivo,
        h('p', { class: 'hint' }, t('club.logo-ayuda')),
        archivo,
      ),
    ),
    h(
      'div',
      { class: 'form-grid' },
      field({ label: t('club.colorPrimario'), input: color1 }),
      field({ label: t('club.colorSecundario'), input: color2 }),
    ),
    h(
      'div',
      { class: 'clb-botones' },
      h('button', { type: 'button', class: 'btn btn--primary', onclick: guardar }, t('club.guardarIdentidad')),
    ),
  );
}
