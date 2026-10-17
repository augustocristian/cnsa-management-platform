// Saves a training PDF to Drive in the cnl/entrenos folder (drive.file scope: only files created by the app).
// Receives the Drive client (js/infrastructure/drive.js or the test adapter) so it can be tested without a network.
export const SUBCARPETA_ENTRENOS = 'entrenos';

// -> { id, name, actualizado, url } (actualizado = a PDF with that name already existed and was replaced, not duplicated)
export async function guardarPdfEnDrive({ drive, blob, nombre }) {
  if (!drive || !blob || !nombre) throw new Error('datos-incompletos');
  const carpeta = await drive.ensureFolderPath([SUBCARPETA_ENTRENOS]);
  const previo = await drive.findFile(nombre, carpeta);
  const r = await drive.upload({ name: nombre, mimeType: 'application/pdf', body: blob, parentId: carpeta, id: previo ? previo.id : undefined });
  return { id: r.id, name: r.name || nombre, actualizado: !!previo, url: drive.fileUrl ? drive.fileUrl(r.id) : '' };
}
