// Settings view ("Configuración"): identity, categories, swimsuit catalogue, training contents, data and Drive status,
// preferences, club switching and the data-protection notice (which lives only here).
import { h } from '../ui.js';
import { useStyles } from '../styles.js';
import { t } from '../i18n.js';
import { crearClubService } from '../application/clubService.js';
import { renderGestor } from './cargas-contenidos.js';
import { panelCategorias } from './categorias-panel.js';
import { pieRgpd } from './datos-integridad.js';
import { tarjetaIdentidad } from './club-identidad.js';
import { tarjetaDatos, tarjetaPreferencias, tarjetaClubes } from './club-datos.js';
import { renderBackupPanel } from './backup-panel.js';

const cargarDrive = () => import('../drive.js').then((m) => m.drive); // lazy: Drive is only needed to open the folder

// Swimsuit catalogue (used to filter marks): the manager lives in its own dialog, loaded on demand.
function tarjetaBanadores(ctx) {
  const abrir = async () => (await import('./banadores-catalogo.js')).abrirCatalogoBanadores(ctx);
  return h('section', { class: 'card clb-card', 'aria-labelledby': 'clb-banadores-t' },
    h('h2', { id: 'clb-banadores-t' }, t('club.banadores.titulo')), h('p', null, t('club.banadores.texto')),
    h('div', { class: 'clb-botones' }, h('button', { type: 'button', class: 'btn', id: 'clb-banadores', onclick: abrir }, t('club.banadores.abrir'))));
}

// Training-content catalogue: a single manager (collapsed), the same one used in Loads.
function tarjetaContenidos(ctx) {
  const anfitrion = h('div');
  renderGestor(anfitrion, ctx);
  return h('section', { class: 'card clb-card', 'aria-labelledby': 'clb-contenidos-t' },
    h('h2', { id: 'clb-contenidos-t' }, t('tc.titulo')),
    h('details', { class: 'clb-contenidos' }, h('summary', null, t('club.contenidos.gestionar')), anfitrion));
}

export async function render(container, params, ctx) {
  useStyles('club');
  const svc = crearClubService(ctx.store, { cargarDrive });
  const recargar = () => render(container, params, ctx);
  container.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', null, t('club.titulo'))),
    h('div', { class: 'clb-wrap' },
      tarjetaIdentidad(svc),
      panelCategorias(ctx, { alCambiar: recargar }),
      tarjetaBanadores(ctx),
      tarjetaContenidos(ctx),
      tarjetaDatos(ctx, svc, recargar),
      renderBackupPanel({ ...ctx, recargar }),
      tarjetaPreferencias(ctx, svc),
      tarjetaClubes(svc),
      pieRgpd()));
}
