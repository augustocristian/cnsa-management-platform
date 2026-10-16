// Google Calendar sync: the local map is saved after EVERY event and the ids are deterministic,
// so a crash halfway does not duplicate events on retry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { crearCalendarioService } = await importApp('js/application/calendarioService.js');

const fila = (id, fecha) => ({ id, fecha, hora: '17:30', duracionMin: 60, grupoId: 'g1', titulo: 'S' + id, descripcion: '', estado: 'planificado', piscina: '25', volumenMin: '', volumenMax: '', enfoque: '' });

function montar(filas, clienteExtra = {}) {
  const db = { Entrenamientos: filas, Grupos: [{ id: 'g1', nombre: 'Promoción', entrenador: '' }], Nadadores: [], Piscinas: [], AsignacionesCalle: [], EventosTemporada: [] };
  const store = { list: (h) => (db[h] || []).slice(), club: { nombre: 'Club Test' }, clubRef: { id: 'club-1', name: 'Club Test' }, setClub() {} };
  const mem = new Map();
  const escrituras = [];
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); escrituras.push(JSON.parse(v)); } };
  const cuerpos = [];
  const cliente = {
    insertar: async (cuerpo) => { cuerpos.push(cuerpo); return { id: cuerpo.id }; },
    actualizar: async () => {},
    borrar: async () => {},
    listarGestionados: async () => [],
    ...clienteExtra,
  };
  const svc = crearCalendarioService({ store, auth: { user: { email: 'yo@club.es' } }, storage, cliente, ahora: () => new Date(2026, 9, 15, 9, 0, 0) });
  return { svc, escrituras, cuerpos, mem };
}

test('P2: if the sync crashes halfway, the events already created stay in the saved map', async () => {
  let n = 0;
  const s = montar([fila('a', '2026-10-20'), fila('b', '2026-10-21'), fila('c', '2026-10-22')], {
    insertar: async (cuerpo) => { if (++n === 3) { const e = new Error('crash'); e.code = 'auth'; throw e; } return { id: cuerpo.id }; },
  });
  const r = await s.svc.sincronizar({ ventanaDias: 30 });
  assert.equal(r.creados, 2);
  const guardado = JSON.parse([...s.mem.values()][0]);
  assert.equal(Object.keys(guardado.items).length, 2);
  assert.ok(s.escrituras.length >= 3, 'saved after each event, not only at the end: ' + s.escrituras.length);
  assert.equal(Object.keys(s.escrituras[0].items).length, 1, 'already after the first event');
});

test('P2: Google event ids are deterministic (base32hex) and a 409 is resolved by updating the existing event', async () => {
  const a = montar([fila('a', '2026-10-20')]);
  await a.svc.sincronizar({ ventanaDias: 30 });
  const b = montar([fila('a', '2026-10-20')]);
  await b.svc.sincronizar({ ventanaDias: 30 });
  assert.equal(a.cuerpos[0].id, b.cuerpos[0].id, 'same club and event => same id, even if the map is lost');
  assert.match(a.cuerpos[0].id, /^cnl[0-9a-f]{16}$/);

  const actualizados = [];
  const c = montar([fila('a', '2026-10-20')], {
    insertar: async () => { const e = new Error('duplicate'); e.status = 409; throw e; },
    actualizar: async (gid) => { actualizados.push(gid); },
  });
  const r = await c.svc.sincronizar({ ventanaDias: 30 });
  assert.equal(r.errores.length, 0);
  assert.equal(r.creados, 1);
  assert.deepEqual(actualizados, [a.cuerpos[0].id]);
});
