// Small presentation helpers shared by the Times subviews.
import { t } from '../i18n.js';
import { descomponerPrueba } from '../domain/marcas.js';

// "100 Libre" (stored canonical name) -> "100 Freestyle" / "100 Stile libero"; unknown events are shown as typed.
export function pruebaLabel(valor) {
  const d = descomponerPrueba(valor);
  return d.estilo ? `${d.distancia} ${t('marcas.estilo.' + d.estilo)}` : d.nombre;
}
