// Connectivity (navigator.onLine) for the offline banner.
export const estaOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Calls fn(offline: boolean) on every change. -> unsubscribe()
export function vigilarConexion(fn) {
  const alOnline = () => fn(false);
  const alOffline = () => fn(true);
  window.addEventListener('online', alOnline);
  window.addEventListener('offline', alOffline);
  return () => {
    window.removeEventListener('online', alOnline);
    window.removeEventListener('offline', alOffline);
  };
}
