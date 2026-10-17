// Helpers for the context `ctx` every view receives ({ store, auth, ui, ahora?, prefs?, ... }, built by the composition root).
// The clock comes from the context so tests can fix it; the browser clock is only the fallback.
export const relojNavegador = () => new Date();
export const ahoraDe = (ctx) => (ctx && ctx.ahora) || relojNavegador;

// Unique id for rows created from a view (the real store assigns its own when a row has none).
export const genIdNavegador = () => {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};
export const genIdDe = (ctx) => (ctx && ctx.genId) || genIdNavegador;
