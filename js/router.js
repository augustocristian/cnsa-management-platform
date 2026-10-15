// Router por hash: #/nadadores, #/nadadores/<id>
const routes = new Map();
const listeners = new Set();

export function registerRoute(name, loader) { routes.set(name, loader); }
export function getRoute(name) { return routes.get(name); }

// -> {name, params:[...]}  (params = segmentos tras el nombre)
export function current() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1) };
}

function notify() {
  const r = current();
  listeners.forEach((fn) => fn(r));
}

export function navigate(path) {
  const target = '#/' + String(path).replace(/^#?\/?/, '');
  if (location.hash === target) notify(); else location.hash = target;
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function start({ silent = false } = {}) {
  window.addEventListener('hashchange', notify);
  if (!silent) notify();
}
