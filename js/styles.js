// Loads a per-view stylesheet (css/views/<name>.css) once. Views must use this instead of injecting <style> elements
// (the Content-Security-Policy allows same-origin stylesheets and the service worker precaches them).
const loaded = new Set();

export function useStyles(name) {
  if (loaded.has(name) || typeof document === 'undefined') return;
  loaded.add(name);
  if (document.querySelector(`link[data-view-css="${name}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./css/views/${name}.css`;
  link.dataset.viewCss = name;
  document.head.append(link);
}
