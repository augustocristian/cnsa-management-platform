// Synchronisation cycle of the club store (part of application/clubStore.js): opening from the remote file, one sync cycle with
// 3-way merge and concurrency control, polling refresh, daily backup and merging with another tab. It works on the state `s`
// and the helpers `h` that clubStore.js hands over; it holds no state of its own.
import { dataToDoc, docToData, mergeData, isEmptyData, pareceDocumentoClub, purgarLapidas } from '../domain/sheetdata.js';
import { hayDatosReales, docVacio, diaCompacto, errProblema } from '../domain/filas.js';

const MAX_VUELTAS = 5; // merge+write retries when another device writes in between

export function crearSincronizacion({ s, h, deps }) {
  const { red, log, dispositivo, ahora } = deps;
  const diaHoy = () => diaCompacto(ahora());

  // Reads the remote file -> {data, rev, version, empty, doc, esClub}
  async function readRemote() {
    const { doc, rev, version } = await s.puerto.read(s.ref.id);
    const data = docToData(doc);
    return { data, rev, version, empty: isEmptyData(data), doc, esClub: pareceDocumentoClub(doc) };
  }

  // Remote file with a newer format: take it as is and become read-only.
  function adoptarVersionFutura(remote) {
    h.applyData(remote.data);
    s.base = h.snapshot();
    s.lastRev = remote.rev;
    s.lastVersion = remote.version;
    h.entrarSoloLectura(remote.data.versionFutura);
  }

  // The club file in Drive follows the club name (best effort).
  async function renameIfNeeded() {
    const nombre = String(s.club.nombre || '').trim();
    if (!nombre || nombre === s.ref.name) return;
    try {
      const r = await s.puerto.renameClub(s.ref.id, nombre);
      s.ref.name = nombre;
      if (r && r.version) s.lastVersion = r.version; // renaming also bumps the file's `version`
    } catch (e) { log.warn('Could not rename the club file', e); }
  }

  // Rotating daily backup cnl/backups/<club>-YYYYMMDD.json (last 14): made from the content in Drive BEFORE
  // the first write of the day. Best effort: a failure here never prevents saving.
  async function respaldoDiario(docPrevio) {
    if (s.omitirRespaldo || !s.ref || docVacio(docPrevio) || s.respaldos.get(s.ref.id) === diaHoy()) return;
    try { await s.puerto.backupClub(s.ref.name, docPrevio); s.respaldos.set(s.ref.id, diaHoy()); } catch (e) { log.warn('Daily backup not made', e); }
  }

  async function hayRespaldos() {
    try { return (await s.puerto.listarBackups(s.ref.name)).length > 0; } catch (e) { return false; }
  }

  // Two tabs of the same browser share the local cache: if the other one saved changes they are merged with our own
  // (instead of overwriting each other) and the result converges without rewriting in a loop.
  function adoptarDeOtraPestana(c) {
    if (!s.ref || s.syncing || s.problema || s.soloLectura) return;
    h.reconciliarMeta();
    const antes = JSON.stringify({ db: s.db, club: s.club });
    const suyo = { db: c.db, club: c.club, meta: c.meta, extra: c.extra };
    const mg = mergeData(s.base, { db: s.db, club: s.club, meta: s.meta, extra: s.extra }, suyo, { dispositivo });
    const despues = JSON.stringify({ db: mg.db, club: mg.club });
    if (despues === antes) return;
    h.applyData(mg);
    s.dirty = s.dirty || !!c.dirty;
    s.rev++;
    if (despues !== JSON.stringify({ db: c.db, club: c.club })) h.saveCache(); // the merged result differs from the other tab's: save it
    h.setStatus(s.dirty ? 'pendiente' : h.store.status);
    h.emit({ type: 'remote' });
  }

  // One sync cycle: meta -> (read + merge) -> write -> check that nobody wrote in between.
  async function sincronizar(gen) {
    const vivo = () => { if (gen !== s.syncGen) throw Object.assign(new Error('Stale synchronisation'), { obsoleta: true }); };
    const actual = () => ({ db: s.db, club: s.club, meta: s.meta, extra: s.extra });
    let merged = false;
    for (let vuelta = 0; ; vuelta++) {
      const m = await s.puerto.meta(s.ref.id);
      vivo();
      let remote = null;
      let docPrevio = null;
      let vBase = m.version;
      h.reconciliarMeta();
      if (m.rev !== s.lastRev) {
        remote = await readRemote();
        vivo();
        if (remote.data.versionFutura) { adoptarVersionFutura(remote); return; }
        if ((remote.empty || !remote.esClub) && s.base && !isEmptyData(s.base)) { h.ponerProblema('vacio'); throw errProblema(); } // someone emptied the file
        if (s.dirty) h.applyData(mergeData(remote.empty ? null : s.base, actual(), remote.data, { dispositivo }));
        else h.applyData(remote.data);
        merged = true;
        vBase = remote.version == null ? m.version : remote.version;
        docPrevio = remote.doc;
        if (h.ensureCatalog()) { s.dirty = true; s.rev++; }
      } else docPrevio = s.base ? dataToDoc(s.base) : null;
      if (!s.dirty) {
        if (remote) { s.base = h.snapshot(); s.lastRev = remote.rev; s.lastVersion = vBase; }
        break;
      }
      // Upload
      const startRev = s.rev;
      h.reconciliarMeta();
      purgarLapidas(s.meta);
      const data = h.snapshot();
      await respaldoDiario(docPrevio);
      vivo();
      const w = await s.puerto.write(s.ref.id, dataToDoc(data));
      vivo();
      if (vBase != null && w.version != null && w.version !== vBase + 1 && vuelta < MAX_VUELTAS) {
        // Drive's `version` jumped by more than 1: another device wrote between our read and our write and we overwrote it.
        // Its revision (the one before ours) is recovered, merged with ours and written again.
        const prev = await s.puerto.revisionPrevia(s.ref.id).catch(() => null);
        vivo();
        if (prev && !docToData(prev).versionFutura) {
          s.lastRev = w.rev;
          s.lastVersion = w.version;
          h.applyData(mergeData(s.base, actual(), docToData(prev), { dispositivo }));
          s.dirty = true;
          s.rev++;
          merged = true;
          continue;
        }
      }
      s.base = data;
      s.lastRev = w.rev;
      s.lastVersion = w.version;
      s.dirty = s.rev !== startRev; // edits made during the upload
      await renameIfNeeded();
      break;
    }
    h.saveCache();
    h.setStatus(s.dirty ? 'pendiente' : 'sincronizado');
    if (s.dirty) s.timer = h.programar(() => h.store.sync().catch(() => {}), h.DEBOUNCE_MS);
    if (merged) h.emit({ type: 'remote' });
  }

  // Opens the club from the remote file after the cache was loaded (see store.init()).
  // Without pending local changes the remote is taken; with them, they are merged when syncing.
  async function abrirDesdeRemoto(cached) {
    const tenia = cached ? hayDatosReales(s.db, s.club) : false;
    if (!red.enLinea()) throw Object.assign(new Error('offline'), { offline: true });
    if (!s.dirty) {
      let remote = null;
      try { remote = await readRemote(); } catch (e) {
        if (e.code !== 'fichero-danado') throw e;
        h.ponerProblema('danado', e); // unreadable JSON: nothing is overwritten
      }
      if (remote) {
        if (remote.data.versionFutura) {
          adoptarVersionFutura(remote);
        } else if ((remote.empty || !remote.esClub) && tenia) {
          s.lastRev = remote.rev; s.lastVersion = remote.version;
          h.ponerProblema('vacio'); // {} / null / no data while a local copy has data: this is not a new club
        } else if (remote.empty && !remote.esClub && await hayRespaldos()) {
          s.lastRev = remote.rev; s.lastVersion = remote.version;
          h.ponerProblema('vacio');
        } else {
          if (remote.empty) { // freshly created file
            if (!s.club.nombre) s.club.nombre = s.ref.name;
            s.dirty = true;
          } else h.applyData(remote.data);
          s.lastRev = remote.rev;
          s.lastVersion = remote.version;
          s.base = remote.empty ? null : h.snapshot();
        }
      }
    }
    if (!s.soloLectura) {
      if (!s.club.nombre) s.club.nombre = s.ref.name;
      if (!s.problema && h.ensureCatalog()) s.dirty = true;
    }
    s.cachePendiente = true;
    await h.flushCache();
    if (!s.problema && !s.soloLectura) h.setStatus(s.dirty ? 'pendiente' : 'sincronizado');
    if (s.dirty && !s.problema && !s.soloLectura) h.store.sync().catch(() => {});
    h.startPolling();
  }

  // Checks (with a cheap metadata request) whether another device changed the file and, if so,
  // incorporates the changes. Returns true if anything changed.
  async function refresh() {
    if (!s.ref || s.syncing || s.dirty || s.problema || !red.enLinea()) return false;
    const m = await s.puerto.meta(s.ref.id);
    if (m.rev === s.lastRev || s.dirty || s.syncing) return false;
    let remote;
    try { remote = await readRemote(); } catch (e) {
      if (e.code === 'fichero-danado') h.ponerProblema('danado', e);
      throw e;
    }
    if (s.dirty || s.syncing) return false;
    if (remote.data.versionFutura) { adoptarVersionFutura(remote); h.emit({ type: 'remote' }); return true; }
    if ((remote.empty || !remote.esClub) && hayDatosReales(s.db, s.club)) { s.lastRev = remote.rev; s.lastVersion = remote.version; h.ponerProblema('vacio'); return false; }
    h.applyData(remote.data);
    s.base = h.snapshot();
    s.lastRev = remote.rev;
    s.lastVersion = remote.version;
    if (!s.soloLectura && h.ensureCatalog()) h.markDirty(); else { h.saveCache(); h.setStatus('sincronizado'); }
    h.emit({ type: 'remote' });
    return true;
  }

  return { sincronizar, abrirDesdeRemoto, refresh, adoptarDeOtraPestana };
}
