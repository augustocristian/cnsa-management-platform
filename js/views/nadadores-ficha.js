// Swimmer file (#/nadadores/<id>): personal data, attendance, loads, personal bests and privacy actions.
import { h, badge, avatar, empty, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t, tCat, tDate } from '../i18n.js';
import { esVerdadero, etiquetaTemporada } from '../domain/categorias.js';
import { nombreCompleto, esActivo } from '../domain/nadadores.js';
import { textoRango } from './categorias-panel.js';
import { accionesRgpd } from './datos-integridad.js';
import { abrirFormulario } from './nadadores-form.js';
import { insigniaManual } from './nadadores-lista.js';
import { seccion, seccionAsistencia, seccionCargas, seccionMarcas } from './nadadores-secciones.js';

const volver = () => h('a', { class: 'btn btn--ghost btn-sm nad-back', href: '#/nadadores' }, icon('flecha-izq', { size: 16 }), t('nadadores.volver'));

// How the automatic category was obtained (birth years of the season); empty when manual or not computable.
function reglaCategoria(n, svc) {
  if (String(n.categoriaManual || '').trim()) return null;
  const p = svc.categorias.previsualizar(n);
  if (!p.categoria || !p.rango || p.origen === 'master') return null;
  return h('small', { class: 'muted' }, ' ', t('categorias.ficha-regla', { temporada: etiquetaTemporada(p.temporada), rango: textoRango(p.rango) }));
}

const enlace = (esquema, valor) => (valor ? h('a', { href: `${esquema}:${valor}` }, valor) : '');
const dato = (etiqueta, valor, clase) => [h('dt', null, etiqueta), h('dd', { class: clase || null }, valor || '-')];

function datos(f, svc) {
  const n = f.nadador;
  const sexo = n.sexo === 'M' ? t('nadadores.masculino') : n.sexo === 'F' ? t('nadadores.femenino') : n.sexo;
  const nacimiento = n.fechaNacimiento ? tDate(n.fechaNacimiento) + (f.edad !== '' ? ` (${t('nadadores.anios', { n: f.edad })})` : '') : '';
  return seccion(t('nadadores.ficha-datos'), h('dl', { class: 'nad-data' },
    dato(t('nadadores.f-categoria'), n.categoria ? [tCat(n.categoria), insigniaManual(n), reglaCategoria(n, svc)] : ''),
    dato(t('nadadores.f-grupo'), f.grupo && f.grupo.nombre),
    dato(t('nadadores.f-nacimiento'), nacimiento), dato(t('nadadores.f-sexo'), sexo),
    dato(t('nadadores.f-email'), enlace('mailto', n.email)), dato(t('nadadores.f-telefono'), enlace('tel', n.telefono)),
    dato(t('nadadores.d-tutor'), n.tutor), dato(t('nadadores.f-licencia'), n.licencia),
    dato(t('categorias.d-master'), esVerdadero(n.licenciaMaster) ? t('common.si') : t('common.no')),
    dato(t('nadadores.d-notas'), n.notas, 'nad-notas')));
}

// vc: {ctx, svc, refresh, volverALista}
export function renderFicha(container, id, vc) {
  const { ctx, svc, refresh } = vc;
  const f = svc.ficha(id);
  if (!f) {
    container.replaceChildren(volver(), h('header', { class: 'page-head' }, h('h1', null, t('nadadores.titulo'))),
      h('div', { class: 'card' }, empty({ icon: 'nadadores', title: t('nadadores.no-encontrado'), action: h('a', { class: 'btn btn--primary', href: '#/nadadores' }, t('nadadores.volver')) })));
    return;
  }
  const n = f.nadador;
  const nombre = nombreCompleto(n);

  // Delete is undoable: the rows go now and come back with the toast button.
  const eliminar = () => {
    const copia = svc.eliminar(n.id);
    location.hash = '#/nadadores';
    toast.undo(t('nadadores.eliminado'), () => {
      svc.restaurar(copia);
      toast(t('nadadores.restaurado'));
      if (container.isConnected && /^#\/nadadores\/?$/.test(location.hash)) vc.volverALista(); // back on the list: redraw it
    });
  };

  const cabecera = h('header', { class: 'page-head nad-head' },
    h('div', { class: 'nad-title' }, avatar(nombre, { size: 'lg' }),
      h('h1', null, nombre), esActivo(n) ? null : badge(t('nadadores.inactivo'), 'neutral')),
    h('div', { class: 'page-head-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => abrirFormulario(vc, n, { alGuardar: refresh }) }, icon('editar', { size: 16 }), t('common.editar')),
      h('button', { type: 'button', class: 'btn', onclick: eliminar }, icon('borrar', { size: 16 }), t('common.eliminar'))));

  const privacidad = seccion(t('nadadores.privacidad'), h('p', { class: 'muted' }, t('nadadores.privacidad-texto')),
    h('div', { class: 'nad-privacy' }, accionesRgpd(n, ctx)));

  container.replaceChildren(volver(), cabecera, datos(f, svc),
    seccionAsistencia(f.asistencia), seccionCargas(f.cargas, ctx), seccionMarcas(f.marcas), privacidad);
}
