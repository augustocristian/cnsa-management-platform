// Calendar export: delivering the .ics (download or "add to my calendar") and the export options dialog (period, reminder, time zone).
import { h, sheet, field, fieldError, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/calendario.js';

// Default delivery (tests replace it with ctx.cal.descargar).
function descargaNavegador(blob, nombre, { abrir = false } = {}) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (!abrir) a.download = nombre;
  else a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Phones: the share sheet lets the person open the file in their calendar app; otherwise the file is opened/downloaded.
async function anadirAMiCalendario(blob, nombre) {
  try {
    const file = new File([blob], nombre, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nombre });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  descargaNavegador(blob, nombre, { abrir: true });
}

// Exports with the chosen period/reminder and the filters on screen. abrir = true -> "add to my calendar".
// -> the service result ({count, ics, nombre}); gives feedback with a toast.
export function exportar({ svc, st, hooks, hoy, abrir }) {
  const { rango, sufijo } = D.rangoExportacion(st.rango, hoy, st.cursor);
  const res = svc.exportar({ rango, alarmaMin: st.alarma, filtros: st.filtros, sufijo });
  if (!res.count) {
    toast.error(t('cal.exp.vacio'));
    return res;
  }
  const blob = new Blob([res.ics], { type: 'text/calendar;charset=utf-8' });
  if (hooks.descargar) hooks.descargar(blob, res.nombre, { abrir, ics: res.ics });
  else if (abrir) anadirAMiCalendario(blob, res.nombre);
  else descargaNavegador(blob, res.nombre);
  toast(t('cal.exp.ok', { n: res.count }));
  return res;
}

// Options dialog. opciones: {svc, st, onCambio()}
export function abrirOpcionesExportacion({ svc, st, onCambio }) {
  const rango = h(
    'select',
    {
      id: 'cal-rango',
      onchange: (e) => {
        st.rango = e.target.value;
      },
    },
    ['mes', 'temporada', 'proximos90'].map((r) =>
      h('option', { value: r, selected: r === st.rango }, t('cal.exp.rango.' + r)),
    ),
  );
  const alarma = h(
    'select',
    {
      id: 'cal-alarma',
      onchange: (e) => {
        st.alarma = Number(e.target.value);
        svc.guardarPreferencia('alarmaMin', st.alarma);
        onCambio?.();
      },
    },
    [0, 30, 60].map((m) => h('option', { value: String(m), selected: m === st.alarma }, t('cal.exp.alarma.' + m))),
  );
  let zonas;
  try {
    zonas = Intl.supportedValuesOf('timeZone');
  } catch (e) {
    zonas = [D.TZ_DEFECTO];
  }
  const zona = h('input', {
    type: 'text',
    id: 'cal-zona',
    value: svc.zona(),
    list: 'cal-zonas',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const zonaOk = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const guardarZona = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      id: 'cal-zona-guardar',
      onclick: () => {
        zonaOk.textContent = '';
        try {
          zonaOk.textContent = t('cal.exp.zona-ok', { zona: svc.guardarZona(zona.value) });
          zona.value = svc.zona();
          fieldError(zona, '');
        } catch (e) {
          fieldError(zona, t('cal.exp.zona-invalida'));
        }
      },
    },
    t('cal.exp.zona-guardar'),
  );
  const cuerpo = h(
    'div',
    { class: 'cal-opciones' },
    field({ label: t('cal.exp.rango'), input: rango }),
    field({ label: t('cal.exp.alarma'), input: alarma }),
    h(
      'div',
      { class: 'cal-zona' },
      field({ label: t('cal.exp.zona'), input: zona, hint: t('cal.exp.zona-ayuda') }),
      h(
        'datalist',
        { id: 'cal-zonas' },
        zonas.map((z) => h('option', { value: z })),
      ),
      guardarZona,
    ),
    zonaOk,
    h('p', { class: 'hint' }, t('cal.exp.alcance')),
    h('p', { class: 'hint' }, t('cal.exp.nota')),
  );
  return sheet({
    title: t('cal.exp.opciones'),
    body: cuerpo,
    actions: [{ label: t('common.cerrar'), primary: true }],
    className: 'cal-sheet',
  });
}
