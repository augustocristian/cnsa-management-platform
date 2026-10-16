// Screens shown before the application: "configuration needed", the start screen (connect Google Drive or try the demo),
// the first-run wizard (create the club) and the club picker. Presentation only: the logic lives in
// application/asistenteClub.js, application/sesionService.js and the shell. Styles: css/views/acceso.css.
// There is no account or sign-in: Google Drive is only authorised (scope drive.file) to keep the user's own data.
import { h, field, fieldError, clearFieldError, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, tDate } from '../i18n.js';
import { langSwitch } from '../lang-switch.js';
import { useStyles } from '../styles.js';
import * as cfg from '../config.js';
import { CODIGOS, clasificarErrorLogin } from '../domain/erroresGoogle.js';
import { variablesTema } from '../domain/tema.js';
import { PASOS, COLOR_PRIMARIO, COLOR_SECUNDARIO, validar, zonaDelNavegador } from '../application/asistenteClub.js';

const CONSENT_URL = 'https://console.cloud.google.com/apis/credentials/consent';
const DRIVE_API_URL = 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
const origenActual = () => (typeof location === 'undefined' ? '' : location.origin);

const enlace = (href, texto) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, texto);
const logo = (size = 64) => h('img', { class: 'logo-big', src: './icons/icon.svg', alt: '', width: size, height: size });
// Language switch in the card footer (never the first element of the card). The shell's own switch above is hidden by CSS.
const pie = (idioma = langSwitch()) => h('div', { class: 'acc-foot' }, idioma);

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
}

// Value in a box with its Copy button, both with the same height and aligned on one row.
function filaCopiar(etiqueta, valor) {
  const id = `acc-copiar-${Math.random().toString(36).slice(2, 8)}`;
  return h('div', { class: 'acc-copyrow' },
    h('span', { class: 'acc-label', id }, etiqueta),
    h('div', { class: 'acc-copy' },
      h('code', { 'data-copiar': '1', 'aria-labelledby': id }, valor),
      h('button', {
        type: 'button', class: 'btn', 'aria-describedby': id,
        onclick: async (e) => {
          const b = e.currentTarget;
          if (await copiar(valor)) { toast(t('common.copiado')); b.textContent = t('common.copiado'); setTimeout(() => { b.textContent = t('common.copiar'); }, 1500); }
        },
      }, icon('copiar', { size: 16 }), t('common.copiar'))));
}

// Google problem explained (already classified by domain/erroresGoogle.js): message plus concrete help
// (current origin, test user, enabling the API...). Shared .alert component, announced to assistive technology.
export function errorGoogle(err) {
  useStyles('acceso');
  const code = err && CODIGOS.includes(err.code) ? err.code : clasificarErrorLogin(err);
  const extra = [];
  if (['origen-no-autorizado', 'popup-cerrado', 'acceso-denegado'].includes(code)) extra.push(filaCopiar(t('gerr.origen-etiqueta'), (err && err.origin) || origenActual()));
  if (['popup-cerrado', 'acceso-denegado'].includes(code)) extra.push(h('p', { class: 'hint' }, t('gerr.usuario-prueba'), ' ', enlace(CONSENT_URL, t('gerr.abrir-consentimiento'))));
  if (code === 'api-desactivada') extra.push(h('p', null, enlace((err && err.enlace) || DRIVE_API_URL, t('gerr.activar-api'))));
  if (code === 'desconocido' && err && err.message) extra.push(h('p', { class: 'hint' }, t('gerr.detalle', { msg: err.message })));
  return h('div', { class: 'alert alert--danger acc-error', role: 'alert', dataset: { codigo: code } },
    icon('aviso', { size: 20 }),
    h('div', { class: 'acc-error-body' }, h('p', null, t('gerr.' + code)), extra));
}

// Button with a busy state that keeps its size (no layout jump) and re-enables itself if the action fails.
function accionOcupada(btn, salida, fn) {
  btn.addEventListener('click', async () => {
    if (btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true');
    salida.replaceChildren();
    try { await fn(); } catch (e) { salida.append(errorGoogle(e)); } finally { btn.removeAttribute('aria-busy'); }
  });
}

// ---------- Configuration needed (no Client ID) ----------
// -> nodes for the card. onListo() is called when the tested ID works (Drive is connected).
export function configNecesaria({ auth, onListo }) {
  useStyles('acceso');
  const id = h('input', { type: 'text', id: 'cfg-clientid', autocomplete: 'off', spellcheck: 'false', placeholder: '123456-abc.apps.googleusercontent.com' });
  const salida = h('div', { id: 'cfg-salida', class: 'acc-salida', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn--primary btn-primary', id: 'cfg-probar' }, t('cfgreq.probar'));
  accionOcupada(btn, salida, async () => {
    const v = id.value.trim();
    if (!cfg.isValidClientId(v)) { fieldError(id, t('cfgreq.invalido')); return; }
    await (auth.connect || auth.signIn).call(auth, { clientId: v });
    onListo();
  });
  return [
    logo(64),
    h('h1', null, t('cfgreq.titulo')),
    h('p', null, t('cfgreq.texto')),
    h('p', { class: 'hint' }, t('cfgreq.quien')),
    h('a', { class: 'btn btn--primary btn-primary btn-lg', href: '#/tutorial', id: 'cfg-tutorial' }, t('cfgreq.tutorial')),
    h('a', { class: 'btn btn-link', href: '#/tutorial/5', id: 'cfg-tutorial-id' }, t('cfgreq.tutorial-id')),
    h('section', { class: 'acc-help', 'aria-labelledby': 'cfg-ayuda' },
      h('h2', { id: 'cfg-ayuda' }, t('cfgreq.ayuda-titulo')),
      filaCopiar(t('cfgreq.origen'), origenActual()),
      field({ label: t('cfgreq.campo'), input: id, hint: t('cfgreq.nota-guardado') }),
      btn, salida),
    pie(),
  ];
}

// ---------- Start screen: connect Google Drive or try the demo ----------
// onConectar()/onSesion(): Drive is connected. onDemo(): the user wants to try the demo (omit it to hide the button).
export function login({ auth, onSesion, onConectar, onDemo }) {
  useStyles('acceso');
  const salida = h('div', { id: 'login-salida', class: 'acc-salida', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary btn-primary btn-lg', type: 'button', id: 'btn-google' }, icon('nube', { size: 20 }), t('acceso.login.google'));
  accionOcupada(btn, salida, async () => {
    await (auth.connect || auth.signIn).call(auth);
    (onConectar || onSesion)?.();
  });
  const demo = onDemo ? h('div', { class: 'acc-demo' },
    h('button', { class: 'btn btn-lg', type: 'button', id: 'btn-demo', onclick: () => onDemo() }, t('acceso.demo')),
    h('p', { class: 'hint' }, t('acceso.demo-nota'))) : null;
  return [
    logo(72),
    h('h1', null, t('shell.titulo')),
    h('p', { class: 'acc-propuesta' }, t('acceso.propuesta')),
    h('div', { class: 'acc-acciones' }, btn, demo),
    salida,
    h('p', { class: 'acc-privacidad' }, icon('info', { size: 16 }), h('span', null, t('acceso.privacidad'))),
    h('p', { class: 'hint' }, t('acceso.login.nota')),
    h('a', { class: 'btn btn-link', href: '#/tutorial' }, t('acceso.tutorial')),
    pie(),
  ];
}

// ---------- First-run wizard ----------
const modoOscuro = () => {
  const forzado = document.documentElement.getAttribute('data-theme');
  if (forzado) return forzado === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
};

// Live preview of the header and the primary button with the chosen colours (contrast-safe, like the real theme).
function vistaPrevia(datos) {
  const nombre = h('span', { class: 'acc-prev-nombre' });
  const lema = h('span', { class: 'acc-prev-lema' });
  const boton = h('span', { class: 'acc-prev-boton' }, t('asistente.vista-previa-boton'));
  const enlaceEj = h('span', { class: 'acc-prev-enlace' }, t('asistente.vista-previa-nombre'));
  const caja = h('div', { class: 'acc-prev', 'aria-hidden': 'true' },
    h('div', { class: 'acc-prev-cab' }, nombre, lema),
    h('div', { class: 'acc-prev-cuerpo' }, boton, enlaceEj));
  const pintar = () => {
    const v = variablesTema({ primario: datos.colorPrimario, secundario: datos.colorSecundario }, modoOscuro() ? 'dark' : 'light');
    for (const [k, val] of Object.entries(v)) caja.style.setProperty(k, val);
    nombre.textContent = String(datos.nombre || '').trim() || t('asistente.vista-previa-nombre');
    lema.textContent = String(datos.lema || '').trim();
  };
  pintar();
  return { el: h('div', { class: 'acc-prev-wrap' }, h('p', { class: 'acc-label' }, t('asistente.vista-previa')), caja), pintar };
}

// Returns Promise<datos> with {nombre, lema, colorPrimario, colorSecundario, zonaHoraria} when the user finishes.
// `mount(nodes)` paints the card; `crear(datos)` is async (creates the file in Drive) and throws if it fails.
export function asistente({ mount, crear, cancelar, redibujar }) {
  useStyles('acceso');
  const datos = { nombre: '', lema: '', colorPrimario: COLOR_PRIMARIO, colorSecundario: COLOR_SECUNDARIO, zonaHoraria: zonaDelNavegador() };
  const idioma = langSwitch();
  let paso = 0;
  let creando = false;
  let errorCrear = null;
  return new Promise((resolve) => {
    const draw = () => {
      const actual = PASOS[paso];
      const campos = {}; // field name -> input
      const bind = (input, clave, alCambiar) => input.addEventListener('input', () => { datos[clave] = input.value; alCambiar?.(); });
      let cuerpo;
      if (actual === 'datos') {
        const nombre = h('input', { type: 'text', id: 'as-nombre', value: datos.nombre, maxlength: 60, required: true, autocomplete: 'organization', placeholder: t('asistente.nombre-ph') });
        const lema = h('input', { type: 'text', id: 'as-lema', value: datos.lema, maxlength: 120 });
        bind(nombre, 'nombre'); bind(lema, 'lema');
        Object.assign(campos, { nombre, lema });
        cuerpo = [field({ label: t('asistente.nombre'), input: nombre, required: true }), field({ label: t('asistente.lema'), input: lema }), h('p', { class: 'hint' }, t('asistente.nota-vacio'))];
        setTimeout(() => nombre.focus(), 0);
      } else {
        const c1 = h('input', { type: 'color', id: 'as-color1', value: datos.colorPrimario });
        const c2 = h('input', { type: 'color', id: 'as-color2', value: datos.colorSecundario });
        const zona = h('input', { type: 'text', id: 'as-zona', value: datos.zonaHoraria, autocomplete: 'off', spellcheck: 'false' });
        const previa = vistaPrevia(datos);
        bind(c1, 'colorPrimario', previa.pintar); bind(c2, 'colorSecundario', previa.pintar); bind(zona, 'zonaHoraria');
        Object.assign(campos, { colorPrimario: c1, colorSecundario: c2, zonaHoraria: zona });
        cuerpo = [h('div', { class: 'acc-colores' }, field({ label: t('asistente.color1'), input: c1 }), field({ label: t('asistente.color2'), input: c2 })),
          previa.el, field({ label: t('asistente.zona'), input: zona }), h('p', { class: 'hint' }, t('asistente.nota-carpeta'))];
      }
      const ultimo = paso === PASOS.length - 1;
      const siguiente = h('button', { type: 'submit', class: 'btn btn--primary btn-primary', id: 'as-siguiente', 'aria-busy': creando ? 'true' : null, disabled: creando },
        ultimo ? t('asistente.crear') : t('asistente.siguiente'));
      const atras = paso > 0
        ? h('button', { type: 'button', class: 'btn', id: 'as-atras', disabled: creando, onclick: () => { paso--; errorCrear = null; draw(); } }, t('asistente.atras'))
        : (cancelar ? h('button', { type: 'button', class: 'btn', id: 'as-cancelar', onclick: cancelar }, t('common.cancelar')) : null);
      const form = h('form', { class: 'acc-form', novalidate: 'novalidate', onsubmit: async (ev) => {
        ev.preventDefault();
        if (creando) return;
        const v = validar(datos, actual);
        Object.values(campos).forEach((i) => clearFieldError(i));
        if (!v.ok) {
          let primero = null;
          for (const [k, codigo] of Object.entries(v.errores)) { if (campos[k]) { fieldError(campos[k], t('asistente.err.' + codigo), { focus: false }); primero ||= campos[k]; } }
          primero?.focus();
          return;
        }
        if (!ultimo) { paso++; draw(); return; }
        creando = true; errorCrear = null; draw();
        try { await crear(datos); resolve(datos); } catch (e) { creando = false; errorCrear = e; draw(); }
      } }, cuerpo, h('div', { class: 'acc-actions' }, atras, siguiente));
      mount([
        logo(56),
        h('h1', null, t('asistente.titulo')),
        paso === 0 ? h('p', { class: 'muted' }, t('asistente.bienvenida')) : null,
        h('div', { class: 'acc-pasos', 'aria-hidden': 'true' }, PASOS.map((_, i) => h('span', { class: i <= paso ? 'on' : '' }))),
        h('p', { class: 'muted', role: 'status' }, creando ? t('asistente.creando') : t('asistente.paso', { n: paso + 1, total: PASOS.length })),
        form,
        h('div', { class: 'acc-salida', 'aria-live': 'polite' }, errorCrear ? errorGoogle(errorCrear) : null),
        pie(idioma),
      ]);
    };
    redibujar(draw);
    draw();
  });
}

// ---------- Club picker (several clubs in cnl) ----------
export function selector({ clubes, onElegir, onCrear, onSalir }) {
  useStyles('acceso');
  return [
    logo(56),
    h('h1', { class: 'acc-h1-sm' }, t('selector.titulo')),
    h('div', { class: 'club-list' }, clubes.map((c) => h('button', { class: 'club-item', type: 'button', onclick: () => onElegir(c) },
      h('strong', null, c.name), h('small', null, c.modified ? t('shell.club.modificado', { fecha: tDate(c.modified) }) : '')))),
    h('button', { class: 'btn', type: 'button', id: 'club-crear-otro', onclick: onCrear }, t('selector.crear-otro')),
    h('button', { class: 'btn btn-link', type: 'button', onclick: onSalir }, t('acceso.desconectar')),
    pie(),
  ];
}
