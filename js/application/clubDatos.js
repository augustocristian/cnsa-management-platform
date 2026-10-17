// Whole-club data operations of the club store (part of application/clubStore.js): backup/restore support, import replacement,
// GDPR access and erasure, recovery of a damaged file and demo seeding. Works on the state `s` and the helpers `h` that
// clubStore.js hands over; it holds no state of its own.
import { ENTITY_SHEETS } from '../domain/schema.js';
import { dataToDoc, docToData, RELACIONES } from '../domain/sheetdata.js';
import { emptyDb, nombreArchivo } from '../domain/filas.js';
import { construirDemo, filasConflictosPlanificacion } from '../domain/demo.js';

export function crearOperacionesDatos({ s, h, deps }) {
  const { genId, ahora, log } = deps;
  const store = () => h.store;
  const completo = () => ({ db: s.db, club: s.club, meta: s.meta, extra: s.extra });

  // The .xlsx copies, the club backups and the old revisions of the file in Drive (right to erasure). Errors are reported, not thrown.
  async function borrarCopiasEnDrive(res) {
    const puerto = s.puerto;
    try {
      const fid = await puerto.ensureFolder();
      for (const nombre of new Set([
        nombreArchivo(s.club.nombre || s.ref.name, '.xlsx'),
        String(s.ref.name) + '.xlsx',
      ])) {
        const f = await puerto.findFile(nombre, fid);
        if (f) {
          await puerto.eliminarDefinitivo(f.id);
          res.copiasBorradas++;
        }
      }
      for (const b of await puerto.listarBackups(s.ref.name, { todos: true })) {
        await puerto.eliminarDefinitivo(b.id);
        res.copiasBorradas++;
      }
      res.revisionesBorradas = await puerto.borrarRevisionesAntiguas(s.ref.id);
    } catch (e) {
      res.errores.push(e.message || String(e));
    }
  }

  return {
    // ---------- Full backup / restore support (application/backupService.js) ----------
    // The whole club document as it is written to Drive (entity sheets, unknown sheets/columns/keys and the sync metadata).
    documento() {
      h.reconciliarMeta();
      return dataToDoc(completo());
    },

    // Runs the on-open migrations (content catalogue, legacy objectives) after data was replaced. -> true if something changed
    migrar() {
      h.guardaEscritura();
      if (!h.ensureCatalog()) return false;
      h.markDirty();
      h.emit({ type: 'change', sheet: 'TiposCarga' });
      return true;
    },

    // Unknown sheets / columns / top-level keys (from a newer version or a backup). reemplazar=false merges them over the current ones.
    // -> true if something changed
    aplicarExtras(nuevo, { reemplazar = true } = {}) {
      h.guardaEscritura();
      const n = nuevo || {};
      const extra = s.extra;
      const siguiente = reemplazar
        ? { top: { ...n.top }, hojas: { ...n.hojas }, cols: JSON.parse(JSON.stringify(n.cols || {})) }
        : { top: { ...extra.top, ...n.top }, hojas: { ...extra.hojas, ...n.hojas }, cols: { ...extra.cols } };
      if (!reemplazar)
        Object.keys(n.cols || {}).forEach((sheet) => {
          siguiente.cols[sheet] = { ...extra.cols[sheet], ...n.cols[sheet] };
        });
      if (JSON.stringify(siguiente) === JSON.stringify(extra)) return false;
      s.extra = siguiente;
      h.markDirty();
      h.emit({ type: 'change', sheet: null });
      return true;
    },

    // Replaces ALL the data (rows and club keys) with an already parsed import ({ db, club }, e.g. from an .xlsx). First saves a copy
    // cnl/backups/<club>-import-YYYYMMDDHHMMSS.json; if that is not possible (e.g. offline) nothing is imported, unless { sinCopia: true }.
    async reemplazarDatos(nuevo, { sinCopia = false } = {}) {
      h.guardaEscritura();
      if (!sinCopia) {
        try {
          await s.puerto.backupClub(s.ref.name, dataToDoc(completo()), { etiqueta: 'import' });
        } catch (e) {
          throw Object.assign(
            new Error(
              'No se pudo guardar la copia previa a la importación; no se ha importado nada. ' + (e.message || ''),
            ),
            { code: 'import-sin-copia', causa: e },
          );
        }
      }
      s.db = emptyDb();
      ENTITY_SHEETS.forEach((sheet) => {
        s.db[sheet] = nuevo.db[sheet];
      });
      s.club = nuevo.club;
      h.ensureCatalog();
      if (!s.club.nombre) s.club.nombre = s.ref.name;
      h.markDirty();
      h.emit({ type: 'init' });
    },

    // Deletes all data of the current club (keeps identity).
    clear() {
      h.guardaEscritura();
      s.db = emptyDb();
      h.ensureCatalog();
      h.markDirty();
      h.emit({ type: 'init' });
    },

    // ---------- GDPR ----------
    // All rows of a swimmer (profile + attendance, loads, times, swimsuit...) -> {nadador, hojas}
    datosNadador(id) {
      const n = store().get('Nadadores', id);
      if (!n) return null;
      const hojas = {};
      RELACIONES.filter(([, , padre]) => padre === 'Nadadores').forEach(([hijo, col]) => {
        hojas[hijo] = s.db[hijo].filter((r) => r[col] === n.id).map((r) => ({ ...r }));
      });
      return { nadador: { ...n }, hojas };
    },

    // Right to erasure: deletes the swimmer and ALL their rows (cascade), leaves permanent tombstones (no device with old data
    // can resurrect them), rewrites the club JSON, deletes the .xlsx copies and the club backups in Drive and the old revisions
    // of the file. -> {filas, sincronizado, copiasBorradas, revisionesBorradas, avisoRevisiones, errores}
    async purgarNadador(id, { borrarEnDrive = true } = {}) {
      h.guardaEscritura();
      const st = store();
      const n = st.get('Nadadores', id);
      if (!n) throw new Error('Nadador no encontrado');
      let filas = 0;
      const quitadas = [];
      RELACIONES.filter(([, , padre]) => padre === 'Nadadores').forEach(([hijo, col]) => {
        const ids = s.db[hijo].filter((r) => r[col] === n.id).map((r) => r.id);
        if (ids.length) {
          filas += st.removeMany(hijo, ids);
          ids.forEach((x) => quitadas.push([hijo, x]));
        }
      });
      filas += st.removeMany('Nadadores', [n.id]);
      quitadas.push(['Nadadores', n.id]);
      h.reconciliarMeta();
      quitadas.forEach(([sheet, x]) => {
        (s.meta.lapidas[sheet] ||= {})[x] = { s: h.tick(), h: 1 };
      }); // permanent tombstone
      s.omitirRespaldo = true; // the daily backup uses the PREVIOUS state, which would still contain the swimmer
      const res = {
        filas,
        sincronizado: false,
        copiasBorradas: 0,
        revisionesBorradas: 0,
        avisoRevisiones: true,
        errores: [],
      };
      try {
        await st.sync();
        res.sincronizado = !s.dirty;
      } catch (e) {
        res.errores.push(e.message || String(e));
      } finally {
        s.omitirRespaldo = false;
      }
      if (borrarEnDrive && res.sincronizado && s.modo === 'drive') await borrarCopiasEnDrive(res);
      return res;
    },

    // ---------- Damaged / emptied file ----------
    // accion: 'copia-local' (upload again what is on this device) | 'backup' (latest backup in Drive) | 'vacio' (start from scratch)
    async resolverProblema(accion) {
      if (!s.problema) return false;
      const p = s.problema;
      const puerto = s.puerto;
      const m = await puerto.meta(s.ref.id);
      if (p.raw) {
        try {
          await puerto.backupClub(s.ref.name, { ficheroDanado: p.raw }, { etiqueta: 'danado' });
        } catch (e) {
          log.warn('Could not save the damaged file', e);
        }
      }
      if (accion === 'backup') {
        const lista = await puerto.listarBackups(s.ref.name);
        if (!lista.length)
          throw Object.assign(new Error('No hay copias de seguridad de este club en Drive.'), { code: 'sin-backups' });
        h.applyData(docToData(await puerto.leerFichero(lista[0].id)));
      } else if (accion === 'vacio') {
        h.applyData({ db: emptyDb(), club: {} });
        s.club.nombre = s.ref.name;
      } else if (!p.tieneCopiaLocal)
        throw Object.assign(new Error('No hay copia local en este dispositivo.'), { code: 'sin-copia-local' });
      s.problema = null;
      s.lastRev = m.rev; // do not read the unreadable file again: it gets overwritten
      s.lastVersion = m.version;
      s.base = null;
      h.ensureCatalog();
      h.markDirty();
      h.emit({ type: 'init' });
      await store().sync();
      return true;
    },

    // Backups of this club in Drive, most recent first -> [{id, name}]
    listarBackups() {
      return s.puerto.listarBackups(s.ref.name);
    },

    // ---------- Demo data ----------
    // Adds (without touching the rest) sample conflicts to the pool planning: several errors and warnings.
    seedPlanificacionConflictos() {
      const filas = filasConflictosPlanificacion({ piscinas: s.db.Piscinas, grupos: s.db.Grupos });
      filas.forEach((f) => store().upsert('AsignacionesCalle', f));
      return filas.length;
    },

    // Replaces the data with a demo of Club Natación Lugones. `hoy` (Date) = demo clock: all dates are relative to it.
    seedDemo({ hoy } = {}) {
      const reloj = hoy instanceof Date && !Number.isNaN(hoy.getTime()) ? hoy : ahora();
      const d = construirDemo({ hoy: reloj, genId });
      s.db = d.db;
      h.ensureCatalog();
      s.club = Object.assign({}, s.club, d.club);
      h.markDirty();
      h.emit({ type: 'init' });
      return Object.fromEntries(ENTITY_SHEETS.map((sheet) => [sheet, s.db[sheet].length]));
    },
  };
}
