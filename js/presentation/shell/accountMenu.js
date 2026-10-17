// "Settings and connection" menu in the header: language, theme, Drive connection status and disconnect / demo actions.
// A disclosure (button + panel right after it in the DOM): Tab walks into the panel, Escape and outside clicks close it.
// There is no user identity here: the app has no accounts, only a Drive connection (or the demo).
import { h, confirmDialog, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/i18n.js';
import { langSwitch } from '../lang-switch.js';
import { themeSelect } from '../theme.js';
import { accionDriveEnDemo } from './conexion.js';

// Visible state of the connection: 'demo' or the store status ('sincronizado' | 'pendiente' | 'error' | 'offline').
export function estadoVisible(rt) {
  if (rt.conexion?.esDemo()) return 'demo';
  if (rt.offline) return 'offline';
  const st = rt.store?.status || 'sincronizado';
  return ['sincronizado', 'pendiente', 'error', 'offline'].includes(st) ? st : 'sincronizado';
}
export const textoEstado = (estado) => t('shell.drive.' + estado);
const ICONO_ESTADO = {
  sincronizado: 'nube',
  pendiente: 'refrescar',
  error: 'aviso',
  offline: 'sin-conexion',
  demo: 'info',
};

export function crearMenuCuenta(rt) {
  let abierto = false;
  const idPanel = 'account-panel';
  const lang = langSwitch({ labels: true });

  const punto = h('span', { class: 'account-dot', 'aria-hidden': 'true' });
  const texto = h('span', { class: 'account-text' });
  const boton = h(
    'button',
    {
      type: 'button',
      class: 'account-btn',
      'aria-expanded': 'false',
      'aria-controls': idPanel,
      'aria-haspopup': 'true',
      onclick: () => (abierto ? cerrar({ foco: true }) : abrir()),
    },
    h('span', { class: 'account-icon' }, icon('nube', { size: 22 }), punto),
    texto,
    icon('chevron-abajo', { size: 16, class: 'account-chevron' }),
  );
  const panel = h('div', { id: idPanel, class: 'account-panel', role: 'group', tabindex: '-1', hidden: true });
  const raiz = h('div', { class: 'account' }, boton, panel);

  const filaEstado = () => {
    const estado = estadoVisible(rt);
    const cuerpo = [
      icon(ICONO_ESTADO[estado], { size: 22, class: 'status-icon' }),
      h(
        'span',
        { class: 'status-body' },
        h('span', { class: 'status-text' }, textoEstado(estado)),
        h(
          'small',
          { class: 'status-hint' },
          estado === 'demo' ? t('shell.demo.texto') : t('shell.drive.sincronizar-ahora'),
        ),
      ),
    ];
    if (estado === 'demo') return h('div', { class: 'status-chip st-demo status-row' }, cuerpo);
    return h(
      'button',
      {
        type: 'button',
        class: `status-chip st-${estado} status-row`,
        title: t('common.sincronizar'),
        onclick: async () => {
          try {
            await rt.sincronizar();
            toast(t('shell.sync-ok'));
          } catch (e) {
            toast.error(t('shell.sync-fallo'));
          }
        },
      },
      cuerpo,
    );
  };

  function contenido() {
    const demo = rt.conexion?.esDemo();
    panel.replaceChildren(
      h('section', { class: 'account-sec' }, h('p', { class: 'account-label' }, t('shell.menu.estado')), filaEstado()),
      h('section', { class: 'account-sec' }, h('p', { class: 'account-label' }, t('lang.etiqueta')), lang),
      h(
        'section',
        { class: 'account-sec' },
        h(
          'label',
          { class: 'account-field' },
          h('span', { class: 'account-label' }, t('tema.etiqueta')),
          themeSelect(),
        ),
      ),
      h(
        'section',
        { class: 'account-sec account-sec--actions' },
        demo
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn--primary account-action',
                onclick: () => {
                  cerrar();
                  accionDriveEnDemo(rt.conexion)[1]();
                },
              },
              icon('nube', { size: 18 }),
              accionDriveEnDemo(rt.conexion)[0],
            )
          : null,
        demo
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn account-action',
                onclick: () => {
                  cerrar();
                  rt.conexion.salirDeDemo();
                },
              },
              icon('salir', { size: 18 }),
              t('shell.demo.salir'),
            )
          : h(
              'button',
              { type: 'button', class: 'btn account-action account-disconnect', onclick: desconectar },
              icon('salir', { size: 18 }),
              t('shell.desconectar'),
            ),
      ),
    );
  }

  async function desconectar() {
    const ok = await confirmDialog(t('shell.desconectar.texto'), {
      danger: true,
      okLabel: t('shell.desconectar'),
      title: t('shell.desconectar.titulo'),
    });
    if (ok) {
      cerrar();
      rt.logout();
    }
  }

  function actualizar() {
    const estado = estadoVisible(rt);
    boton.className = `account-btn st-${estado}`;
    texto.textContent = textoEstado(estado);
    boton.setAttribute('aria-label', `${t('shell.menu-conexion')}: ${textoEstado(estado)}`);
    boton.querySelector('.account-icon .icon')?.replaceWith(icon(ICONO_ESTADO[estado], { size: 22 }));
    if (abierto) {
      const foco = panel.contains(document.activeElement) ? document.activeElement : null;
      if (!foco) contenido();
      else refrescarEstado();
    }
  }
  // Updates only the status row while the panel is open (keeps focus where the user is).
  function refrescarEstado() {
    const fila = panel.querySelector('.status-row');
    if (!fila) return;
    const nueva = filaEstado();
    if (fila.className === nueva.className && fila.textContent === nueva.textContent) return;
    const tenia = document.activeElement === fila;
    fila.replaceWith(nueva);
    if (tenia) nueva.focus?.();
  }

  const fuera = (e) => {
    if (abierto && !raiz.contains(e.target)) cerrar();
  };
  const tecla = (e) => {
    if (abierto && e.key === 'Escape' && !document.querySelector('.sheet-overlay')) {
      e.stopPropagation();
      cerrar({ foco: true });
    }
  };
  const salio = () =>
    setTimeout(() => {
      if (abierto && !raiz.contains(document.activeElement) && !document.querySelector('.sheet-overlay')) cerrar();
    }, 0);

  function abrir({ foco } = {}) {
    if (abierto) return;
    abierto = true;
    contenido();
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla, true);
    raiz.addEventListener('focusout', salio);
    if (foco === 'idioma') lang.querySelector('[aria-checked="true"]')?.focus();
  }
  function cerrar({ foco = false } = {}) {
    if (!abierto) return;
    abierto = false;
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', fuera, true);
    document.removeEventListener('keydown', tecla, true);
    raiz.removeEventListener('focusout', salio);
    if (foco) boton.focus();
  }

  actualizar();
  const destruir = () => {
    cerrar();
    lang._dispose?.();
  };
  return { el: raiz, abrir, cerrar, actualizar, destruir, estaAbierto: () => abierto };
}
