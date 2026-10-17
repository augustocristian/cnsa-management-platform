// One session of the weekly list: time, title, status and meta line, ONE primary action (open the plan) and a "more"
// menu with the secondary ones (mark done, edit, duplicate, PDF, delete).
import { t, tEstado } from '../i18n/i18n.js';
import { h, badge } from '../ui.js';
import { icon } from '../icons.js';
import { metaSesion } from '../../domain/entrenamientos.js';
import { menuAcciones } from './entreno-menu.js';
import { etiquetaPdf } from './entreno-acciones.js';

// acciones: { abrirPlan(s), editar(s), duplicar(s), alternarEstado(s), pdf(s), eliminar(s) }
export function tarjetaSesion(s, { nombreGrupo, acciones }) {
  const hecha = s.estado === 'realizado';
  const titulo = s.titulo || t('entre.sesion');
  const meta = metaSesion(s, s.resumen).map((m) => h('span', null, t(m.clave, m.params)));
  const menu = menuAcciones({
    etiqueta: t('entreno.lista.mas-aria', { n: titulo }),
    items: () => [
      { id: 'estado', label: hecha ? t('entre.reabrir') : t('entre.marcar-realizado'), icono: 'check', onClick: () => acciones.alternarEstado(s) },
      { id: 'editar', label: t('common.editar'), icono: 'editar', onClick: () => acciones.editar(s) },
      { id: 'duplicar', label: t('entre.duplicar'), icono: 'copiar', onClick: () => acciones.duplicar(s) },
      { id: 'pdf', label: etiquetaPdf(), icono: 'descargar', onClick: () => acciones.pdf(s) },
      { id: 'eliminar', label: t('common.eliminar'), icono: 'borrar', danger: true, onClick: () => acciones.eliminar(s) },
    ],
  });
  return h('article', { class: 'ent-sess', 'data-id': s.id },
    h('div', { class: 'ent-time num' }, s.hora || '--:--'),
    h('div', { class: 'ent-main' },
      h('div', { class: 'ent-title' }, titulo),
      h('div', { class: 'ent-meta' },
        badge(nombreGrupo(s.grupoId) || t('entre.grupo-todos'), 'neutral'),
        badge(tEstado(hecha ? 'realizado' : 'planificado'), hecha ? 'ok' : 'info'),
        meta),
      s.descripcion ? h('div', { class: 'ent-meta ent-desc' }, s.descripcion) : null),
    h('div', { class: 'ent-act' },
      h('button', { type: 'button', class: 'btn btn--primary btn-sm', 'data-accion': 'abrir-plan', 'aria-label': `${t('entreno.lista.abrir-plan')}: ${titulo}`, onclick: () => acciones.abrirPlan(s) },
        icon('documento', { size: 16 }), h('span', null, t('entreno.lista.abrir-plan'))),
      menu));
}
