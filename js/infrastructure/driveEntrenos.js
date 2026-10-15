// Guarda el PDF de un entreno en Drive, en la carpeta cnl/entrenos (scope drive.file: sólo ficheros creados por la app).
// Recibe el cliente de Drive (js/drive.js o el adaptador de pruebas) para poder probarse sin red.
export const SUBCARPETA_ENTRENOS = 'entrenos';

// -> { id, name, actualizado, url } (actualizado = ya existía un PDF con ese nombre y se ha sustituido, sin duplicarlo)
export async function guardarPdfEnDrive({ drive, blob, nombre }) {
  if (!drive || !blob || !nombre) throw new Error('datos-incompletos');
  const carpeta = await drive.ensureFolderPath([SUBCARPETA_ENTRENOS]);
  const previo = await drive.findFile(nombre, carpeta);
  const r = await drive.upload({ name: nombre, mimeType: 'application/pdf', body: blob, parentId: carpeta, id: previo ? previo.id : undefined });
  return { id: r.id, name: r.name || nombre, actualizado: !!previo, url: drive.fileUrl ? drive.fileUrl(r.id) : '' };
}
