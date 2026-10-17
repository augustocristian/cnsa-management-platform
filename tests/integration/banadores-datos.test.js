// Store-level behaviour of the swimsuit data against the simulated Drive: old files with the retired Banador sheet,
// no cascade between swimmers/suits, dangling suit ids and the demo data.
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh } from '../helpers/app.js';
import * as D from '../../js/domain/banadores.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh({ demo: false, club: 'Club Viejo' }); return fn(t); });

// Waits until nothing is pending (the club created by fresh() syncs in the background).
const sincronizado = async () => { for (let i = 0; i < 5 && c.store.pendiente; i++) await c.store.sync(); };

const docAntiguo = () => ({
  version: 1,
  club: { nombre: 'Club Viejo' },
  hojas: {
    Nadadores: [{ id: 'n1', nombre: 'Ana', apellidos: 'Pérez', fechaNacimiento: '2012-05-04' }],
    Marcas: [{ id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '100 Libre', piscina: '25', tiempoMs: 65000, competicion: 'Copa', notas: '' }],
    Banador: [{ id: 'b1', nadadorId: 'n1', talla: 'M', estado: 'entregado', fecha: '2026-05-01', notas: 'dato personal' }],
  },
  sync: { reloj: 5, sellos: { Banador: { b1: '3@x' }, Marcas: { m1: '2@x' } }, lapidas: {} },
});

test('opening a club file that still has the old Banador sheet works, and the next write removes it from Drive', async () => {
  await sincronizado();
  c.fake.editarClubExterno(c.ref.id, (d) => Object.assign(d, docAntiguo()));
  await c.store.refresh();
  assert.equal(c.store.list('Nadadores').length, 1);
  assert.equal(c.store.list('Banador').length, 0, 'the sheet no longer exists in the store');
  assert.equal(c.store.problema, null);
  c.store.upsert('Banadores', { id: 'bn1', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon Core FX', activo: 'true' });
  c.store.upsert('Marcas', { ...c.store.get('Marcas', 'm1'), banadorId: 'bn1' });
  await c.store.sync();
  const doc = c.fake.club(c.ref.id).doc;
  assert.equal('Banador' in doc.hojas, false);
  assert.equal(doc.hojas.Banadores[0].modelo, 'Powerskin Carbon Core FX');
  assert.equal(doc.hojas.Marcas[0].banadorId, 'bn1');
  assert.equal(JSON.stringify(doc).includes('dato personal'), false);
});

test('deleting a swimmer never cascades into the suit catalogue, and the swimmer export does not include it', async () => {
  c.store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P', fechaNacimiento: '2012-05-04' });
  c.store.upsert('Banadores', { id: 'bn1', tipo: 'entrenamiento', marca: 'Speedo', modelo: 'Endurance+', activo: 'true' });
  c.store.upsert('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '50 Libre', tiempoMs: 30000, banadorId: 'bn1' });
  c.store.upsert('Nadadores', { id: 'n2', nombre: 'Bea', apellidos: 'R', fechaNacimiento: '2013-05-04' });
  assert.equal('Banadores' in c.store.datosNadador('n2').hojas, false);
  await c.store.purgarNadador('n1', { borrarEnDrive: false });
  assert.equal(c.store.list('Marcas').length, 0);
  assert.equal(c.store.list('Banadores').length, 1, 'suits are club data, not the swimmer\'s');
});

test('a mark whose suit was deleted on another device keeps existing (dangling id = no suit)', async () => {
  c.store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P', fechaNacimiento: '2012-05-04' });
  c.store.upsert('Banadores', { id: 'bn1', tipo: 'competicion', marca: 'Arena', modelo: 'X', activo: 'true' });
  c.store.upsert('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '50 Libre', tiempoMs: 30000, banadorId: 'bn1' });
  await sincronizado();
  c.fake.editarClubExterno(c.ref.id, (d) => { d.hojas.Banadores = []; d.sync.lapidas.Banadores = { bn1: { s: '99@otro' } }; d.sync.reloj = 99; });
  await c.store.refresh();
  assert.equal(c.store.list('Banadores').length, 0);
  assert.equal(c.store.list('Marcas').length, 1, 'the mark survives');
  assert.equal(D.banadorDeMarca(c.store.list('Marcas')[0], c.store.list('Banadores').map(D.normalizarBanador)), null);
});

test('seedDemo: 5 suits (2 training, 3 fast skins), marks use them consistently and some have none', () => {
  c.store.seedDemo();
  const suits = c.store.list('Banadores').map(D.normalizarBanador);
  assert.equal(suits.length, 5);
  assert.deepEqual([suits.filter((b) => b.tipo === 'entrenamiento').length, suits.filter((b) => b.tipo === 'competicion').length], [2, 3]);
  assert.ok(suits.filter((b) => b.tipo === 'competicion').every((b) => b.marca && b.modelo));
  assert.equal(new Set(suits.map(D.claveBanador)).size, 5, 'unique (type, brand, model)');
  const marcas = c.store.list('Marcas');
  const ids = new Set(suits.map((b) => b.id));
  assert.ok(marcas.every((m) => m.banadorId === '' || ids.has(m.banadorId)), 'no dangling references');
  for (const m of marcas.filter((x) => x.banadorId)) {
    const b = suits.find((s) => s.id === m.banadorId);
    assert.equal(b.tipo, m.competicion ? 'competicion' : 'entrenamiento', `${m.id}: suit type matches competition/test`);
  }
  assert.ok([...D.conteoMarcasPorBanador(suits, marcas).values()].every((n) => n > 0), 'every demo suit is used by at least one mark');
  assert.ok(marcas.some((m) => !m.banadorId), 'some marks have no suit');
  assert.equal(c.store.list('Banador').length, 0);
});
