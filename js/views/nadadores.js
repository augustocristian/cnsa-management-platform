// Swimmers view: list (#/nadadores) and individual file (#/nadadores/<id>). This module only routes between the two;
// the list, the form and the file are separate modules and the rules live in domain/nadadores.js + nadadoresService.js.
import { useStyles } from '../styles.js';
import { crearNadadoresService } from '../application/nadadoresService.js';
import { renderLista } from './nadadores-lista.js';
import { renderFicha } from './nadadores-ficha.js';

// The id comes from the router params (array / string / object) or, as a fallback, from the hash.
function idDe(params) {
  let id = null;
  if (typeof params === 'string') id = params;
  else if (Array.isArray(params)) id = params[0];
  else if (params) id = params.id ?? params[0] ?? null;
  if (!id) {
    const m = location.hash.match(/#\/nadadores\/([^/?]+)/);
    if (m) id = decodeURIComponent(m[1]);
  }
  return id;
}

export async function render(container, params, ctx) {
  useStyles('nadadores');
  useStyles('categorias');
  const svc = crearNadadoresService(ctx.store, { ahora: ctx.ahora });
  const refresh = () => render(container, params, ctx);
  const vc = { ctx, svc, refresh, volverALista: () => render(container, [], ctx) };
  const id = idDe(params);
  if (id) renderFicha(container, id, vc); else renderLista(container, vc);
}
