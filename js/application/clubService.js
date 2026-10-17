// Use cases about the club settings: identity (name, motto, logo, colours), where the data lives and the connection mode.
// The repository is the store (club/setClub/clubRef/mode); `cargarDrive` lazily returns the Drive port
// ({ensureFolder(), folderUrl(id)}) and is injected so this module imports no adapter.
import { normalizarIdentidad, validarIdentidad, urlFicheroDrive } from '../domain/club.js';

export function crearClubService(repo, { cargarDrive = null } = {}) {
  const club = () => (repo.club && typeof repo.club === 'object' ? repo.club : {});
  return {
    identidad: () => normalizarIdentidad(club()),

    // datos: {nombre, lema, logo, colorPrimario, colorSecundario}. -> {ok:true, identidad} | {ok:false, errores}
    guardarIdentidad(datos) {
      const errores = validarIdentidad(datos);
      if (errores.length) return { ok: false, errores };
      const identidad = normalizarIdentidad(datos);
      repo.setClub({ ...club(), ...identidad });
      return { ok: true, identidad };
    },

    // Club file in Drive: {nombre, ficheroUrl|null}. Without a Drive reference (demo mode) there is no link.
    ubicacion() {
      const ref = repo.clubRef;
      return {
        nombre: club().nombre || (ref && ref.name) || '',
        ficheroUrl: ref && ref.id ? urlFicheroDrive(ref.id) : null,
      };
    },

    // URL of the `cnl` folder in Drive (it is resolved, and created if missing, on demand).
    async urlCarpeta() {
      if (!cargarDrive) throw new Error('Drive no disponible');
      const drive = await cargarDrive();
      return drive.folderUrl(await drive.ensureFolder());
    },

    // 'drive' (data stored in the user's Drive) or 'demo' (local sample data, nothing is saved to Drive).
    modo: () => (repo.mode === 'demo' ? 'demo' : 'drive'),
    esDemo: () => repo.mode === 'demo',
  };
}
