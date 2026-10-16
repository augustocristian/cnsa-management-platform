// Adapter between the shell and the Drive connection / demo mode. The shell never reads `store.mode` or calls the
// connection module directly: it goes through `rt.conexion`, so a change in those APIs only touches this file.
//   esDemo()                 is the open club the in-memory demo (store.mode === 'demo')?
//   conectarDesdeDemo()      "Connect Google Drive" in the demo banner / menu (must run from a click)
//   salirDeDemo()            "Exit demo": drops the demo data and returns to the start screen
//   entrarEnDemo()           "Try the demo" on the start screen
import { toast } from '../../ui.js';
import { t } from '../../i18n.js';

export const REF_DEMO = { id: 'demo', name: 'Demo' };

export function crearConexion(rt) {
  const conexion = {
    esDemo: () => rt.store?.mode === 'demo',

    async entrarEnDemo() {
      rt.banderas.guardarDemo(true);
      await rt.start();
    },

    // Opens the in-memory demo club. The store owns what "demo" means (seeded data, no Drive writes).
    async abrirDemo() {
      const { store } = rt;
      if (typeof store.initDemo === 'function') return store.initDemo();
      return store.init({ ...REF_DEMO, demo: true });
    },

    async conectarDesdeDemo() {
      try {
        await rt.auth.connect({ interactive: true });
      } catch (e) {
        toast.error(t('dat.reconectar-error', { msg: (e && e.message) || '' }));
        return;
      }
      await rt.sesion.salirDeDemo();
      location.hash = '';
      location.reload();
    },

    async salirDeDemo() {
      await rt.sesion.salirDeDemo();
      location.hash = '';
      location.reload();
    },
  };
  return conexion;
}
