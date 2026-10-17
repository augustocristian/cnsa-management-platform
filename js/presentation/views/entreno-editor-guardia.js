// Leave guard of the plan editor while it has unsaved changes:
//  - beforeunload: the browser asks before closing/reloading the tab
//  - Back button (popstate): the editor pushes one history entry when it opens, so Back closes the editor instead of leaving
//    the page, asking first if there is something unsaved
//  - hashchange: navigating to another route while the editor is open asks before discarding
// opciones: { haySinGuardar(): boolean, pedirSalida(): Promise<boolean> (true = leave), alSalir(): closes the editor }
// -> { liberar() }  (call it when the editor closes for any reason)
export function protegerSalida({ haySinGuardar, pedirSalida, alSalir }) {
  const token = 'enp-' + Math.random().toString(36).slice(2);
  const hashInicial = location.hash;
  const doc = document; // events of a window whose document was replaced (page reload, tests) must not open dialogs elsewhere
  let activo = true;
  let preguntando = false;

  const antesDeCerrar = (e) => {
    if (haySinGuardar()) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  const salir = async (alRechazar) => {
    if (preguntando || !activo || document !== doc) return;
    preguntando = true;
    try {
      if (!haySinGuardar() || (await pedirSalida())) alSalir();
      else alRechazar();
    } finally {
      preguntando = false;
    }
  };
  const alVolver = () => {
    salir(() => window.history.pushState({ enpGuard: token }, ''));
  };
  const alCambiarHash = () => {
    if (location.hash === hashInicial) return;
    salir(() => {
      location.hash = hashInicial;
    }); // stay: go back to the route the editor was opened from
  };

  try {
    window.history.pushState({ enpGuard: token }, '');
  } catch (e) {
    /* history unavailable: no Back handling */
  }
  window.addEventListener('beforeunload', antesDeCerrar);
  window.addEventListener('popstate', alVolver);
  window.addEventListener('hashchange', alCambiarHash);

  return {
    liberar() {
      if (!activo) return;
      activo = false;
      window.removeEventListener('beforeunload', antesDeCerrar);
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('hashchange', alCambiarHash);
      // drop our history entry, but only if we are still on it
      if (window.history.state && window.history.state.enpGuard === token) {
        try {
          window.history.back();
        } catch (e) {
          /* ignore */
        }
      }
    },
  };
}
