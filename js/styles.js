// Loads a per-view stylesheet (css/views/<name>.css) once per document. Views must use this instead of injecting
// <style> elements (the Content-Security-Policy allows same-origin stylesheets and the service worker precaches them).
// The check looks at the live DOM (not a module-level cache) so a recreated document gets its stylesheets again.
export function useStyles(name) {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`link[data-view-css="${name}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./css/views/${name}.css`;
  link.dataset.viewCss = name;
  document.head.append(link);
}
