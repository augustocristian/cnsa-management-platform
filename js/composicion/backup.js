// Composition of the backup feature for the running app: wires the real adapters (WebCrypto, the Drive client, the preferences
// singleton, the browser download) into the backup service, which itself imports none of them. Tests build the service directly
// with fakes and never load this module.
import { crearBackupService } from '../application/backupService.js';
import { crearCategoriasService } from '../application/categoriasService.js';
import { crearBackupCrypto } from '../infrastructure/backupCrypto.js';
import { crearBackupsDrive } from '../infrastructure/backupDrive.js';
import { drive, nombreBackup } from '../drive.js';
import { preferencias } from '../preferencias.js';
import { APP_VERSION } from '../config.js';

// Saves a Blob through a temporary link (the same mechanism the store uses for its downloads).
export function descargaNavegador(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// opciones: {store, ahora?, descargar?, cripto?}  -> backup service
export function crearServicioBackupApp({ store, ahora = () => new Date(), descargar = descargaNavegador, cripto } = {}) {
  const c = cripto || crearBackupCrypto();
  return crearBackupService({
    repo: store,
    preferencias: { get: (k, def) => preferencias.get(k, def), set: (k, v) => preferencias.set(k, v) },
    hash: c.sha256Hex,
    crypto: c.disponible ? c : null,
    ahora,
    archivos: { descargar },
    driveBackups: crearBackupsDrive({ drive, nombreBackup }),
    categorias: crearCategoriasService(store, { ahora }),
    appVersion: APP_VERSION,
  });
}
