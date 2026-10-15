// Pantallas previas a la aplicación: configuración necesaria, inicio de sesión con Google, asistente de primer
// arranque (crear el club) y selector de club. Sólo presentan; la lógica está en application/asistenteClub.js y app.js.
import { h } from '../ui.js';
import { t, tDate } from '../i18n.js';
import * as cfg from '../config.js';
import { CODIGOS, clasificarErrorLogin } from '../domain/erroresGoogle.js';
import { PASOS, COLOR_PRIMARIO, COLOR_SECUNDARIO, validar, zonaDelNavegador } from '../application/asistenteClub.js';

const CONSENT_URL = 'https://console.cloud.google.com/apis/credentials/consent';
const DRIVE_API_URL = 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
const origenActual = () => (typeof location === 'undefined' ? '' : location.origin);

const CSS = `
.acc-help{display:grid;gap:.5rem;text-align:left;margin-top:.4rem}
.acc-help h3{margin:.4rem 0 0;font-size:1rem}
.acc-field{display:flex;flex-direction:column;gap:.25rem;text-align:left}
.acc-field>span{font-size:.85rem;font-weight:600;color:var(--muted)}
.acc-field .form-error{margin:0;min-height:0}
.acc-copy{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.acc-copy code{background:var(--c-primary-soft);padding:.3rem .55rem;border-radius:8px;word-break:break-all;font-size:.85rem}
.acc-error{display:grid;gap:.4rem;text-align:left;border-left:4px solid var(--danger);background:#fdeceb;padding:.6rem .8rem;border-radius:8px}
.acc-error p{margin:0}
.acc-steps{display:flex;gap:.4rem;justify-content:center;margin:.2rem 0}
.acc-steps span{width:2rem;height:.4rem;border-radius:99px;background:var(--border)}
.acc-steps span.on{background:var(--c-primary)}
.acc-actions{display:flex;gap:.5rem;justify-content:space-between;flex-wrap:wrap;margin-top:.4rem}
.acc-actions .btn{flex:1 1 140px;min-height:44px}
.acc-colors{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.acc-colors input[type=color]{height:44px;padding:2px}
.acc-card-wide{max-width:520px}
.acc-nota{font-size:.85rem;color:var(--muted);text-align:left;margin:0}
.acc-list{display:grid;gap:.5rem}
.auth-card a.btn:not(.btn-link){text-decoration:none;text-align:center;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
.auth-card .btn,.auth-card input{min-height:44px}
@media(max-width:420px){.acc-colors{grid-template-columns:1fr}}
`;
export function injectStyle() {
  if (document.getElementById('acc-style')) return;
  document.head.appendChild(h('style', { id: 'acc-style' }, CSS));
}

const link = (href, texto) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, texto);

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
}
function filaCopiar(etiqueta, valor) {
  return h('div', { class: 'acc-help' }, h('small', { class: 'muted' }, etiqueta),
    h('div', { class: 'acc-copy' }, h('code', { 'data-copiar': '1' }, valor),
      h('button', { type: 'button', class: 'btn', onclick: async (e) => { const b = e.currentTarget; if (await copiar(valor)) { b.textContent = t('common.copiado'); setTimeout(() => { b.textContent = t('common.copiar'); }, 1500); } } }, t('common.copiar'))));
}

// Error de Google explicado: mensaje + ayuda concreta (origen actual, usuario de prueba, activar API...).
export function errorGoogle(err) {
  injectStyle();
  const code = err && CODIGOS.includes(err.code) ? err.code : clasificarErrorLogin(err);
  const box = h('div', { class: 'acc-error', role: 'alert', dataset: { codigo: code } }, h('p', null, t('gerr.' + code)));
  if (['origen-no-autorizado', 'popup-cerrado', 'acceso-denegado'].includes(code)) box.append(filaCopiar(t('gerr.origen-etiqueta'), (err && err.origin) || origenActual()));
  if (['popup-cerrado', 'acceso-denegado'].includes(code)) box.append(h('p', { class: 'hint' }, t('gerr.usuario-prueba'), ' ', link(CONSENT_URL, t('gerr.abrir-consentimiento'))));
  if (code === 'api-desactivada') box.append(h('p', null, link((err && err.enlace) || DRIVE_API_URL, t('gerr.activar-api'))));
  if (code === 'desconocido' && err && err.message) box.append(h('p', { class: 'hint' }, t('gerr.detalle', { msg: err.message })));
  return box;
}

// ---------- Configuración necesaria (sin Client ID) ----------
// -> nodos para la tarjeta. onListo() se llama cuando el ID probado funciona (ya hay sesión).
export function configNecesaria({ auth, onListo }) {
  injectStyle();
  const id = h('input', { type: 'text', id: 'cfg-clientid', autocomplete: 'off', spellcheck: 'false', placeholder: '123456-abc.apps.googleusercontent.com' });
  const salida = h('div', { id: 'cfg-salida', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary', id: 'cfg-probar' }, t('cfgreq.probar'));
  btn.addEventListener('click', async () => {
    const v = id.value.trim();
    salida.replaceChildren();
    if (!cfg.isValidClientId(v)) { salida.append(h('p', { class: 'form-error', role: 'alert' }, t('cfgreq.invalido'))); id.focus(); return; }
    btn.disabled = true;
    btn.textContent = t('cfgreq.probando');
    try { await auth.signIn({ clientId: v }); onListo(); }
    catch (e) { salida.append(errorGoogle(e)); btn.disabled = false; btn.textContent = t('cfgreq.probar'); }
  });
  return [
    h('img', { class: 'logo-big', src: './icons/icon.svg', alt: '', width: 72, height: 72 }),
    h('h1', null, t('cfgreq.titulo')),
    h('p', null, t('cfgreq.texto')),
    h('p', { class: 'hint' }, t('cfgreq.quien')),
    h('a', { class: 'btn btn-primary btn-lg', href: '#/tutorial', id: 'cfg-tutorial' }, t('cfgreq.tutorial')),
    h('a', { class: 'btn btn-link', href: '#/tutorial/5', id: 'cfg-tutorial-id' }, t('cfgreq.tutorial-id')),
    h('div', { class: 'acc-help' },
      h('h2', { style: { fontSize: '1.05rem' } }, t('cfgreq.ayuda-titulo')),
      filaCopiar(t('cfgreq.origen'), origenActual()),
      h('label', { class: 'acc-field' }, h('span', null, t('cfgreq.campo')), id),
      btn,
      h('p', { class: 'acc-nota' }, t('cfgreq.nota-guardado')),
      salida),
  ];
}

// ---------- Inicio de sesión ----------
export function login({ auth, onSesion }) {
  injectStyle();
  const salida = h('div', { id: 'login-salida', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'btn-google' }, h('span', { class: 'g-mark', 'aria-hidden': 'true' }, 'G'), t('acceso.login.google'));
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    salida.replaceChildren();
    try { await auth.signIn(); onSesion(); }
    catch (e) { salida.append(errorGoogle(e)); btn.disabled = false; }
  });
  return [
    h('img', { class: 'logo-big', src: './icons/icon.svg', alt: '', width: 72, height: 72 }),
    h('h1', null, t('shell.titulo')),
    h('p', { class: 'muted' }, t('shell.lema-app')),
    btn,
    salida,
    h('p', { class: 'hint' }, t('acceso.login.nota')),
    h('a', { class: 'btn btn-link', href: '#/tutorial' }, t('acceso.tutorial')),
  ];
}

// ---------- Asistente de primer arranque ----------
// Devuelve una Promise<datos> con {nombre, lema, colorPrimario, colorSecundario, zonaHoraria} cuando el usuario acaba.
// `mount(nodos)` pinta la tarjeta; `crear(datos)` es asíncrona (crea el fichero en Drive) y lanza si falla.
export function asistente({ mount, crear, cancelar, redibujar }) {
  injectStyle();
  const datos = { nombre: '', lema: '', colorPrimario: COLOR_PRIMARIO, colorSecundario: COLOR_SECUNDARIO, zonaHoraria: zonaDelNavegador() };
  let paso = 0;
  let creando = false;
  let errorCrear = null;
  return new Promise((resolve) => {
    const draw = () => {
      const actual = PASOS[paso];
      const errs = {};
      const campo = (clave, etiqueta, input) => {
        const e = h('p', { class: 'form-error', id: 'err-' + clave, role: 'alert' });
        errs[clave] = e;
        input.setAttribute('aria-describedby', 'err-' + clave);
        return h('label', { class: 'acc-field' }, h('span', null, etiqueta), input, e);
      };
      const bind = (input, clave) => input.addEventListener('input', () => { datos[clave] = input.value; });
      let cuerpo;
      if (actual === 'datos') {
        const nombre = h('input', { type: 'text', id: 'as-nombre', value: datos.nombre, maxlength: 60, required: true, autocomplete: 'organization', placeholder: t('asistente.nombre-ph') });
        const lema = h('input', { type: 'text', id: 'as-lema', value: datos.lema, maxlength: 120 });
        bind(nombre, 'nombre'); bind(lema, 'lema');
        cuerpo = [campo('nombre', t('asistente.nombre'), nombre), campo('lema', t('asistente.lema'), lema), h('p', { class: 'acc-nota' }, t('asistente.nota-vacio'))];
        setTimeout(() => nombre.focus(), 0);
      } else {
        const c1 = h('input', { type: 'color', id: 'as-color1', value: datos.colorPrimario });
        const c2 = h('input', { type: 'color', id: 'as-color2', value: datos.colorSecundario });
        const zona = h('input', { type: 'text', id: 'as-zona', value: datos.zonaHoraria, autocomplete: 'off', spellcheck: 'false' });
        bind(c1, 'colorPrimario'); bind(c2, 'colorSecundario'); bind(zona, 'zonaHoraria');
        cuerpo = [h('div', { class: 'acc-colors' }, campo('colorPrimario', t('asistente.color1'), c1), campo('colorSecundario', t('asistente.color2'), c2)),
          campo('zonaHoraria', t('asistente.zona'), zona), h('p', { class: 'acc-nota' }, t('asistente.nota-carpeta'))];
      }
      const ultimo = paso === PASOS.length - 1;
      const siguiente = h('button', { type: 'submit', class: 'btn btn-primary', id: 'as-siguiente', disabled: creando }, creando ? t('asistente.creando') : ultimo ? t('asistente.crear') : t('asistente.siguiente'));
      const atras = paso > 0
        ? h('button', { type: 'button', class: 'btn', id: 'as-atras', disabled: creando, onclick: () => { paso--; errorCrear = null; draw(); } }, t('asistente.atras'))
        : (cancelar ? h('button', { type: 'button', class: 'btn', id: 'as-cancelar', onclick: cancelar }, t('common.cancelar')) : null);
      const form = h('form', { class: 'acc-list', novalidate: 'novalidate', onsubmit: async (ev) => {
        ev.preventDefault();
        if (creando) return;
        const v = validar(datos, actual);
        Object.keys(errs).forEach((k) => { errs[k].textContent = v.errores[k] ? t('asistente.err.' + v.errores[k]) : ''; });
        if (!v.ok) { const k = Object.keys(v.errores)[0]; form.querySelector('#as-' + ({ nombre: 'nombre', lema: 'lema', colorPrimario: 'color1', colorSecundario: 'color2', zonaHoraria: 'zona' })[k])?.focus(); return; }
        if (!ultimo) { paso++; draw(); return; }
        creando = true; errorCrear = null; draw();
        try { await crear(datos); resolve(datos); }
        catch (e) { creando = false; errorCrear = e; draw(); }
      } }, cuerpo, h('div', { class: 'acc-actions' }, atras, siguiente));
      mount([
        h('img', { class: 'logo-big', src: './icons/icon.svg', alt: '', width: 56, height: 56 }),
        h('h1', null, t('asistente.titulo')),
        paso === 0 ? h('p', { class: 'muted' }, t('asistente.bienvenida')) : null,
        h('div', { class: 'acc-steps', role: 'img', 'aria-label': t('asistente.paso', { n: paso + 1, total: PASOS.length }) }, PASOS.map((_, i) => h('span', { class: i <= paso ? 'on' : '' }))),
        h('p', { class: 'muted', 'aria-live': 'polite' }, creando ? t('asistente.creando') : t('asistente.paso', { n: paso + 1, total: PASOS.length })),
        form,
        errorCrear ? errorGoogle(errorCrear) : null,
      ]);
    };
    redibujar(draw);
    draw();
  });
}

// ---------- Selector de club (varios clubes en cnl) ----------
export function selector({ clubes, email, onElegir, onCrear, onSalir }) {
  injectStyle();
  return [
    h('h2', null, t('selector.titulo')),
    email ? h('p', { class: 'muted' }, email) : null,
    h('div', { class: 'club-list' }, clubes.map((c) => h('button', { class: 'club-item', type: 'button', onclick: () => onElegir(c) },
      h('strong', null, c.name), h('small', null, c.modified ? t('shell.club.modificado', { fecha: tDate(c.modified) }) : '')))),
    h('button', { class: 'btn', type: 'button', id: 'club-crear-otro', onclick: onCrear }, t('selector.crear-otro')),
    h('button', { class: 'btn btn-link', type: 'button', onclick: onSalir }, t('shell.club.cerrar-sesion')),
  ];
}
