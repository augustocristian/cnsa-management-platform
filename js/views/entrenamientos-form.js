// Form (bottom sheet on mobile) to create or edit a training session, with inline validation.
import { t, tEstado } from '../i18n.js';
import { sheet, formFields, fieldError, toast } from '../ui.js';

const MENSAJES = {
  obligatorio: () => t('ui.campo-obligatorio'),
  'fecha-invalida': () => t('entreno.form.err.fecha-invalida'),
  'numero-invalido': () => t('entreno.form.err.numero-invalido'),
  'volumen-rango': () => t('entre.err-volumen'),
};

const aTexto = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : v);

// fila: the session to edit, or a draft (svc.borradorNuevo / svc.borradorDuplicado). alGuardar(sesion) runs after saving.
export function abrirFormularioSesion({ svc, fila, alGuardar = () => {} }) {
  const esNueva = !fila.id;
  const def = [
    { name: 'titulo', label: t('entre.f.titulo'), required: true, full: true },
    { name: 'fecha', label: t('entre.f.fecha'), type: 'date', required: true },
    { name: 'hora', label: t('entre.f.hora'), type: 'time' },
    { name: 'duracionMin', label: t('entre.f.duracion'), type: 'number', min: 0 },
    { name: 'piscina', label: t('entre.f.piscina'), type: 'select', options: [{ value: '', label: '—' }, { value: '25', label: '25 m' }, { value: '50', label: '50 m' }] },
    { name: 'grupoId', label: t('entre.f.grupo'), type: 'select', options: [{ value: '', label: t('entre.todos-grupos') }, ...svc.grupos().map((g) => ({ value: g.id, label: g.nombre }))] },
    { name: 'estado', label: t('entre.f.estado'), type: 'select', options: ['planificado', 'realizado'].map((e) => ({ value: e, label: tEstado(e) })) },
    { name: 'volumenMin', label: t('entre.f.vol-min'), type: 'number', min: 0, step: 100 },
    { name: 'volumenMax', label: t('entre.f.vol-max'), type: 'number', min: 0, step: 100 },
    { name: 'enfoque', label: t('entre.f.enfoque'), full: true },
    { name: 'descripcion', label: t('entre.f.descripcion'), type: 'textarea', full: true },
  ];
  const form = formFields(def, { ...fila, piscina: String(fila.piscina ?? ''), estado: fila.estado || 'planificado' });

  const guardar = () => {
    if (!form.validate()) return false;
    const valores = Object.fromEntries(Object.entries(form.values()).map(([k, v]) => [k, aTexto(v)]));
    const r = svc.guardar({ ...fila, ...valores });
    if (!r.ok) {
      let primero = null;
      for (const [campo, codigo] of Object.entries(r.errores)) {
        const input = form.inputs[campo];
        if (!input) { toast.error(t('common.error')); continue; }
        fieldError(input, (MENSAJES[codigo] || MENSAJES.obligatorio)(), { focus: false });
        primero ||= input;
      }
      primero?.focus();
      return false;
    }
    toast(t('entre.guardada'));
    alGuardar(r.sesion);
    return true;
  };

  return sheet({
    title: esNueva ? t('entre.nueva') : t('entre.editar-sesion'),
    body: form.el,
    className: 'ent-form-sheet',
    actions: [
      { label: t('common.cancelar') },
      { label: t('common.guardar'), primary: true, onClick: () => (guardar() ? undefined : false) },
    ],
  });
}
