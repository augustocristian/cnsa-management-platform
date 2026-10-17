// Google Calendar sync panel. Disabled states are EXPLAINED (demo mode, no Drive connection, not available) instead of just greyed out.
import { h, confirmDialog } from '../ui.js';
import { t, locale } from '../i18n/i18n.js';
import { icon } from '../icons.js';

const CODIGOS_CONOCIDOS = [
  'auth',
  'permisos',
  'api-desactivada',
  'limite',
  'red',
  'servidor',
  'sin-conexion',
  'sin-cliente',
  'demo',
];
export function textoError(e) {
  const c = e && e.code;
  if (CODIGOS_CONOCIDOS.includes(c)) return t('cal.sync.err.' + c);
  return t('cal.sync.err.http', { msg: (e && e.message) || '' });
}

// opciones: {svc, st}  -> <section class="card">
export function panelSync({ svc, st }) {
  const puede = svc.puedeSincronizar();
  const msg = h('p', { class: 'cal-estado', role: 'status', 'aria-live': 'polite' });
  const estado = h('p', { class: 'hint', id: 'cal-sync-estado' });
  function pintarEstado() {
    const e = svc.estadoSync();
    estado.textContent = e.activa
      ? t('cal.sync.estado-activa', {
          n: e.total,
          fecha: e.ultima ? new Date(e.ultima.ts).toLocaleString(locale()) : '—',
        })
      : t('cal.sync.estado-inactiva');
  }
  const mostrarError = (txt) => {
    msg.textContent = txt;
    msg.classList.add('cal-error');
  };
  async function trabajar(btn, fn) {
    btn.disabled = true;
    msg.classList.remove('cal-error');
    try {
      await fn();
    } catch (e) {
      mostrarError(textoError(e));
    }
    btn.disabled = false;
    pintarEstado();
  }
  const sincronizar = (btn) =>
    trabajar(btn, async () => {
      const r = await svc.sincronizar({
        ventanaDias: st.ventana,
        alarmaMin: st.alarma,
        onProgreso: (p) => {
          msg.textContent = t('cal.sync.progreso', p);
        },
      });
      msg.textContent = t('cal.sync.resumen', {
        c: r.creados,
        a: r.actualizados,
        b: r.borrados,
        i: r.iguales,
        e: r.errores.length,
      });
      if (r.abortado) mostrarError(`${msg.textContent} ${textoError({ code: r.abortado })}`);
      else if (r.errores.length) mostrarError(`${msg.textContent} ${textoError(r.errores[0])}`);
    });
  const parar = async (btn) => {
    if (!(await confirmDialog(t('cal.sync.parar-confirmar'), { danger: true }))) return;
    await trabajar(btn, async () => {
      const r = await svc.dejarDeSincronizar();
      msg.textContent = r.errores.length
        ? t('cal.sync.parado-errores', { n: r.borrados, e: r.errores.length })
        : t('cal.sync.parado', { n: r.borrados });
      if (r.errores.length) msg.classList.add('cal-error');
    });
  };
  const btnSync = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--primary',
      id: 'cal-sync',
      disabled: !puede.ok,
      onclick: (e) => sincronizar(e.currentTarget),
    },
    icon('refrescar', { size: 18 }),
    t('cal.sync.boton'),
  );
  const btnParar = h(
    'button',
    { type: 'button', class: 'btn', id: 'cal-sync-parar', disabled: !puede.ok, onclick: (e) => parar(e.currentTarget) },
    t('cal.sync.parar'),
  );
  const ventana = h(
    'select',
    {
      id: 'cal-ventana',
      onchange: (e) => {
        st.ventana = Number(e.target.value);
        svc.guardarPreferencia('ventanaDias', st.ventana);
      },
    },
    [30, 90, 180].map((d) => h('option', { value: String(d), selected: d === st.ventana }, t('cal.sync.ventana.' + d))),
  );
  const alarma = h(
    'select',
    {
      'aria-label': t('cal.exp.alarma'),
      onchange: (e) => {
        st.alarma = Number(e.target.value);
        svc.guardarPreferencia('alarmaMin', st.alarma);
      },
    },
    [0, 30, 60].map((m) => h('option', { value: String(m), selected: m === st.alarma }, t('cal.exp.alarma.' + m))),
  );
  const campo = (et, control) =>
    h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, et), control);
  const sec = h(
    'section',
    { class: 'card cal-sync', 'aria-labelledby': 'cal-sync-t' },
    h('h2', { id: 'cal-sync-t' }, t('cal.sync.titulo')),
    h('p', { class: 'hint' }, t('cal.sync.desc')),
    // Why it is disabled (never a silent grey button)
    puede.ok
      ? null
      : h(
          'div',
          { class: 'alert alert--info', id: 'cal-sync-motivo' },
          icon('info', { size: 18 }),
          h('p', null, t('cal.sync.motivo.' + puede.motivo)),
        ),
    puede.ok
      ? h(
          'div',
          { class: 'cal-fila' },
          h('div', { class: 'field' }, campo(t('cal.sync.ventana'), ventana)),
          h('div', { class: 'field' }, campo(t('cal.exp.alarma'), alarma)),
        )
      : null,
    h('div', { class: 'cal-fila' }, btnSync, btnParar),
    puede.ok ? estado : null,
    msg,
  );
  if (puede.ok) pintarEstado();
  return sec;
}
