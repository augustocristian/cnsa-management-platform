// Browser file download of a Blob (no-op without a DOM).
export function descargarBlob(blob, nombre) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
