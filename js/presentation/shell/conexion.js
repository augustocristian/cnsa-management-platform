// Adapter between the shell and the Drive connection / demo mode. The shell never reads `store.mode` or calls the
// connection module directly: it goes through `rt.conexion`, so a change in those APIs only touches this file.
//   esDemo()                 is the open club the local demo (store.mode === 'demo')?
//   entrarEnDemo()           "Try the demo" on the start screen
//   abrirDemo()              (re)opens the demo club at boot when the demo was left open
//   conectarDesdeDemo()      "Connect Google Drive" in the demo banner / menu (must run from a click); the demo data is dropped
//   salirDeDemo()            "Exit demo": asks, erases the demo data and returns to the start screen
// The use cases live in application/modoService.js (rt.modo); this file only adds the browser parts (dialogs, reload).
import { toast, confirmDialog } from '../ui.js';
import { t } from '../i18n/i18n.js';

const volverAlInicio = () => {
  location.hash = '';
  location.reload();
};

// The demo banner / menu / settings action for Drive while the demo runs: with a Google Client ID it is "Connect Google Drive";
// without one it is "Set up Google Drive" (opens the Configuration-needed screen). -> [label, onclick]
export function accionDriveEnDemo(conexion) {
  const puede = conexion.puedeConectar ? conexion.puedeConectar() : true;
  return puede
    ? [t('shell.demo.conectar'), () => conexion.conectarDesdeDemo()]
    : [t('shell.demo.configurar'), () => conexion.configurarDrive()];
}

export function crearConexion(rt) {
  return {
    esDemo: () => rt.store?.mode === 'demo',

    // Can a Drive connection be started? Yes once a Google Client ID exists (the same rule that closes the demo: modoService).
    puedeConectar: () => !rt.modo?.demoDisponible(),

    async entrarEnDemo() {
      try {
        await rt.modo.enterDemo();
      } catch (e) {
        toast.error(
          e && (e.code === 'demo-con-cliente' || e.code === 'demo-con-drive')
            ? t('acceso.demo-no-disponible')
            : (e && e.message) || t('common.error'),
        );
        return;
      }
      await rt.start();
    },

    // "Set up Google Drive" from the demo: the Configuration-needed screen (tutorial + paste the Client ID) with a way back.
    configurarDrive() {
      rt.configurar();
    },

    // Opens the demo club (it reopens what the person had). No-op if it is already open.
    async abrirDemo() {
      if (rt.store.mode === 'demo' && rt.store.clubRef) return rt.store;
      await rt.modo.enterDemo();
      return rt.store;
    },

    async conectarDesdeDemo() {
      try {
        await rt.modo.connectDrive();
      } catch (e) {
        toast.error(t('dat.reconectar-error', { msg: (e && e.message) || '' }));
        return;
      }
      volverAlInicio();
    },

    async salirDeDemo() {
      const ok = await confirmDialog(t('shell.demo.salir.texto'), {
        danger: true,
        okLabel: t('shell.demo.salir'),
        title: t('shell.demo.salir'),
      });
      if (!ok) return;
      await rt.modo.exitDemo();
      volverAlInicio();
    },
  };
}
