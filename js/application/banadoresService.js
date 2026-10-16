// Application service of the swimsuit catalogue: orchestrates domain/banadores.js and persistence.
// The repository (list/get/upsert/remove, e.g. the store) is injected: no store, DOM or network is imported, so it is
// tested with an in-memory repository.
import * as D from '../domain/banadores.js';

export const HOJA_BANADORES = 'Banadores';
export const HOJA_MARCAS = 'Marcas';
const PREFIJO_ID = 'bn-';

const idPorDefecto = () => PREFIJO_ID + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function crearBanadoresService(repo, { generarId = idPorDefecto } = {}) {
  const err = (campo, codigo) => ({ ok: false, errores: [{ campo, codigo }] });
  const banadores = () => D.ordenarBanadores(repo.list(HOJA_BANADORES).map(D.normalizarBanador));
  const marcasDe = (id) => D.marcasDeBanador(repo.list(HOJA_MARCAS), id);

  const svc = {
    banadores,
    activos: () => D.filtrarActivos(banadores()),
    grupos: () => D.agruparBanadores(banadores()),
    // Active suits plus the one a mark already has (even if inactive): options of the suit selector of a mark.
    disponiblesParaMarca: (banadorIdActual = '') => D.disponiblesParaMarca(banadores(), banadorIdActual),
    banador(id) { const r = repo.get(HOJA_BANADORES, id); return r ? D.normalizarBanador(r) : null; },
    etiqueta: (id, etiquetasTipo) => D.etiquetaBanador(svc.banador(id), etiquetasTipo),

    // ----- Marks that used a suit -----
    marcasDeBanador: (id) => marcasDe(id),
    usos: (id) => marcasDe(id).length,
    // Map suit id -> number of marks that used it (every suit appears).
    conteoUsos: () => D.conteoMarcasPorBanador(banadores(), repo.list(HOJA_MARCAS)),
    // Filter options with counts for the Marks view (see domain opcionesFiltro).
    opcionesFiltro: (seleccion, opciones) => D.opcionesFiltro(banadores(), repo.list(HOJA_MARCAS), seleccion, opciones),

    // ----- Catalogue management -----
    // data: {tipo, marca, modelo, notas} -> {ok, banador} | {ok:false, errores:[{campo, codigo}]}
    crear(data) {
      const errores = D.validarBanador(data, banadores());
      if (errores.length) return { ok: false, errores };
      const fila = D.filaBanador({
        id: generarId(), tipo: D.normalizarTipoBanador(data.tipo), marca: String(data.marca ?? '').trim().replace(/\s+/g, ' '),
        modelo: String(data.modelo ?? '').trim().replace(/\s+/g, ' '), activo: true, notas: String(data.notas ?? '').trim(),
      });
      return { ok: true, banador: D.normalizarBanador(repo.upsert(HOJA_BANADORES, fila)) };
    },

    // Edits a suit (type included: it reclassifies the marks that used it). Keeps `activo` unless data.activo is given.
    editar(id, data) {
      const actual = svc.banador(id);
      if (!actual) return err('id', 'no-existe');
      const propuesta = { tipo: 'tipo' in data ? data.tipo : actual.tipo, marca: 'marca' in data ? data.marca : actual.marca,
        modelo: 'modelo' in data ? data.modelo : actual.modelo, notas: 'notas' in data ? data.notas : actual.notas };
      const errores = D.validarBanador(propuesta, banadores(), { id });
      if (errores.length) return { ok: false, errores };
      const nuevo = D.normalizarBanador({ ...actual, ...propuesta, activo: 'activo' in data ? !!data.activo : actual.activo });
      return { ok: true, banador: D.normalizarBanador(repo.upsert(HOJA_BANADORES, D.filaBanador(nuevo))) };
    },

    activar(id, activo = true) {
      const b = svc.banador(id);
      if (!b) return err('id', 'no-existe');
      return { ok: true, banador: D.normalizarBanador(repo.upsert(HOJA_BANADORES, D.filaBanador({ ...b, activo: !!activo }))) };
    },
    desactivar: (id) => svc.activar(id, false),

    // Deletes a suit that no mark references. In use -> {ok:false, motivo:'en-uso', usos}: deactivate or merge instead.
    borrar(id) {
      const b = svc.banador(id);
      if (!b) return { ok: false, motivo: 'no-existe' };
      const usos = marcasDe(id).length;
      if (usos) return { ok: false, motivo: 'en-uso', usos };
      repo.remove(HOJA_BANADORES, id);
      return { ok: true, banador: b };
    },

    // Puts a deleted suit back with the same id (Undo of borrar). Fails if the id or (type, brand, model) is taken again.
    restaurar(banador) {
      if (!banador || !banador.id) return err('id', 'no-existe');
      if (svc.banador(banador.id)) return { ok: true, banador: svc.banador(banador.id) };
      const errores = D.validarBanador(banador, banadores());
      if (errores.length) return { ok: false, errores };
      return { ok: true, banador: D.normalizarBanador(repo.upsert(HOJA_BANADORES, D.filaBanador(D.normalizarBanador(banador)))) };
    },

    // Reassigns the marks of the suit `origenId` to `destinoId` and deletes the origin (duplicates, typos). -> {ok, reasignadas}
    fusionar(origenId, destinoId) {
      const o = svc.banador(origenId);
      const d = svc.banador(destinoId);
      if (!o || !d) return { ok: false, motivo: 'no-existe' };
      if (o.id === d.id) return { ok: false, motivo: 'mismo' };
      const afectadas = marcasDe(o.id);
      afectadas.forEach((m) => repo.upsert(HOJA_MARCAS, { ...m, banadorId: d.id }));
      repo.remove(HOJA_BANADORES, o.id);
      return { ok: true, reasignadas: afectadas.length };
    },

    // ----- Link between a mark and its suit -----
    // banadorId '' = no suit. -> {ok, marca} | {ok:false, errores}
    asignarAMarca(marcaId, banadorId = '') {
      const m = repo.get(HOJA_MARCAS, marcaId);
      if (!m) return err('marcaId', 'no-existe');
      const id = String(banadorId ?? '');
      if (id && !svc.banador(id)) return err('banadorId', 'no-existe');
      return { ok: true, marca: repo.upsert(HOJA_MARCAS, { ...m, banadorId: id }) };
    },
  };
  return svc;
}
