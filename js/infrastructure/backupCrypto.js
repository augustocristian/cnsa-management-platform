// WebCrypto adapter for backups: SHA-256 (checksum) and passphrase encryption (PBKDF2-SHA256 -> AES-256-GCM).
// The application service receives it as a port ({sha256Hex, cifrar, descifrar}); nothing here knows about clubs or sheets.
// Everything stays on the device: the passphrase is never stored or sent anywhere, and there is no recovery if it is lost.
import { FORMATO_CIFRADO, VERSION_FORMATO, KDF, CIFRADO, ITERACIONES, validarSobre, datosAutenticados } from '../domain/backup.js';

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

export function aBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function deBase64(texto) {
  const bin = atob(texto);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const err = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// opciones: {cripto (default globalThis.crypto), iteraciones (default 600,000; tests lower it)}
export function crearBackupCrypto({ cripto = globalThis.crypto, iteraciones = ITERACIONES } = {}) {
  const subtle = cripto && cripto.subtle;
  const exigir = () => { if (!subtle) throw err('sin-cifrado', 'This browser has no WebCrypto: encryption is not available.'); return subtle; };

  async function clave(passphrase, salt, iter) {
    const s = exigir();
    const base = await s.importKey('raw', codificador.encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return s.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  return {
    disponible: !!subtle,
    async sha256Hex(texto) { return aHex(await exigir().digest('SHA-256', codificador.encode(texto))); },

    // text -> encrypted envelope (see domain/backup.js)
    async cifrar(texto, passphrase) {
      const s = exigir();
      const salt = cripto.getRandomValues(new Uint8Array(16));
      const iv = cripto.getRandomValues(new Uint8Array(12));
      const sobre = { format: FORMATO_CIFRADO, formatVersion: VERSION_FORMATO, kdf: KDF, iterations: iteraciones, cipher: CIFRADO };
      const cifrado = await s.encrypt({ name: 'AES-GCM', iv, additionalData: codificador.encode(datosAutenticados(sobre)) },
        await clave(passphrase, salt, iteraciones), codificador.encode(texto));
      return { ...sobre, salt: aBase64(salt), iv: aBase64(iv), ciphertext: aBase64(new Uint8Array(cifrado)) };
    },

    // envelope -> text. A wrong passphrase (or a tampered file) fails authentication: code 'passphrase-incorrecta'.
    async descifrar(sobre, passphrase) {
      const v = validarSobre(sobre);
      if (!v.ok) throw err(v.errores[0].codigo, 'The encrypted backup is not valid.', v.errores[0]);
      const s = exigir();
      try {
        const plano = await s.decrypt({ name: 'AES-GCM', iv: deBase64(sobre.iv), additionalData: codificador.encode(datosAutenticados(sobre)) },
          await clave(passphrase, deBase64(sobre.salt), sobre.iterations), deBase64(sobre.ciphertext));
        return decodificador.decode(plano);
      } catch (e) {
        throw err('passphrase-incorrecta', 'Wrong passphrase, or the file is damaged.', { causa: e });
      }
    },
  };
}
