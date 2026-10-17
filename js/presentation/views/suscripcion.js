// Repaint a view when the DATA it shows changes (not on sync-status events, which would wipe what the user is typing).
// store.on emits {type: 'change', sheet} for local edits, 'remote' / 'init' for whole-club reloads and 'status', 'cache-*'... for
// bookkeeping. `hojas` limits 'change' events to the sheets the view reads. -> unsubscribe function (also called automatically
// once the container leaves the document).
const DATOS = new Set(['change', 'remote', 'init']);

export function repintarAlCambiar(store, container, draw, hojas = null) {
  if (!store || !store.on) return undefined;
  const off = store.on((e) => {
    if (!container.isConnected) {
      off();
      return;
    }
    if (!e || !DATOS.has(e.type)) return;
    if (e.type === 'change' && hojas && e.sheet && !hojas.includes(e.sheet)) return;
    draw();
  });
  return off;
}
