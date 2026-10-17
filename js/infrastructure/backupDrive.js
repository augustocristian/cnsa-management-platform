// Drive port for backups: the copies the app keeps in cnl/backups (daily, before an import, before a restore).
// Wraps the `drive` client (real or the test double); the application service only sees this small interface.
//   guardarSeguridad(club, doc, fecha) -> {id, nombre}   listar(club) -> {prefijo, archivos:[{id, name, modified}]}
//   leer(id) -> parsed JSON   eliminar(id) -> moves the file to the Drive bin
export function crearBackupsDrive({ drive, nombreBackup }) {
  // "<club>-" exactly as drive.js writes it (safe file name + dash)
  const prefijo = (club) => nombreBackup(club, new Date(2000, 0, 1)).slice(0, -'YYYYMMDD.json'.length);
  return {
    prefijo,
    async guardarSeguridad(club, doc, fecha) {
      const r = await drive.backupClub(club, doc, { etiqueta: 'restore', fecha });
      return { id: r.id, nombre: r.name };
    },
    async listar(club) {
      const p = prefijo(club);
      const fid = await drive.ensureFolderPath(['backups']);
      const archivos = (await drive.listFiles(fid)).filter((f) => String(f.name).startsWith(p))
        .map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime || '' }));
      return { prefijo: p, archivos };
    },
    leer: (id) => drive.leerFichero(id),
    eliminar: (id) => drive.deleteFile(id),
  };
}
