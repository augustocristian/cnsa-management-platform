// Applies the club colour for the current light/dark mode to <html>.
// The variables (--c-primary, --c-secondary, --c-action, --c-on-primary, --c-accent, --c-heading) come from domain/tema.js,
// which validates the colour and guarantees a contrast >= 4.5:1. Recomputed when the mode changes.
import * as theme from '../theme.js';
import { variablesTema } from '../../domain/tema.js';

export function aplicarTema(store) {
  const club = store?.club || {};
  const modo = theme.effectiveTheme();
  const vars = variablesTema({ primario: club.colorPrimario, secundario: club.colorSecundario }, modo);
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', modo === 'dark' ? '#172233' : vars['--c-action']);
}
