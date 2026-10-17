// Real id generator (implements application/ports/IdGenPort.js): UUID v4 (crypto.randomUUID) so two devices/tabs never
// generate the same one; without crypto, time + randomness.
export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Short id of this browser tab (logical stamps are "n@tab"): two tabs of the same browser never generate the same stamp.
export const nuevoDispositivo = () => Math.random().toString(36).slice(2, 7);
