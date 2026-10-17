import test from 'node:test';
import assert from 'node:assert/strict';
import { crearNadadoresService } from '../../js/application/nadadoresService.js';
import { crearGruposService } from '../../js/application/gruposService.js';
import { crearComunicacionesService } from '../../js/application/comunicacionesService.js';
import { crearClubService } from '../../js/application/clubService.js';

// In-memory repository with the store contract (list/get/upsert/upsertMany/remove/removeMany + club/setClub)
function repoMem(datos = {}, club = {}) {
  const hojas = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let n = 0;
  const repo = {
    club: { ...club }, mode: 'drive', clubRef: { id: 'f1', name: 'Club' },
    setClub(c) { repo.club = { ...c }; },
    list: (h) => (hojas[h] || []).map((r) => ({ ...r })),
    get: (h, id) => { const r = (hojas[h] || []).find((x) => x.id === id); return r ? { ...r } : null; },
    upsertMany(h, rows) {
      hojas[h] ||= [];
      return rows.map((r) => {
        const fila = { ...r, id: r.id || `x${++n}` };
        const i = hojas[h].findIndex((x) => x.id === fila.id);
        if (i >= 0) hojas[h][i] = fila; else hojas[h].push(fila);
        return fila;
      });
    },
    upsert: (h, r) => repo.upsertMany(h, [r])[0],
    removeMany(h, ids) { const antes = (hojas[h] || []).length; hojas[h] = (hojas[h] || []).filter((r) => !ids.includes(r.id)); return antes - hojas[h].length; },
    remove: (h, id) => repo.removeMany(h, [id]),
  };
  return repo;
}
const reloj = (iso) => () => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };

test('nadadoresService.guardar: validates, materialises the category and reports store errors', () => {
  const repo = repoMem({ Nadadores: [] }, { temporadaActual: '2026-2027' });
  const svc = crearNadadoresService(repo, { ahora: reloj('2026-10-16') });
  const mal = svc.guardar({ nombre: '', apellidos: '' });
  assert.equal(mal.ok, false);
  assert.equal(mal.errores.length, 2);
  const ok = svc.guardar({ nombre: 'Zoe', apellidos: 'Zamora', fechaNacimiento: '2014-05-05', sexo: 'F', licenciaMaster: 'false', categoriaManual: '' });
  assert.equal(ok.ok, true);
  assert.equal(ok.fila.categoria, 'Alevín');
  assert.equal(repo.list('Nadadores').length, 1);
  const store = { ...repo, upsert() { throw Object.assign(new Error('v'), { code: 'validacion', errores: [{ campo: 'fechaNacimiento', codigo: 'fecha-futura' }] }); } };
  const r = crearNadadoresService(store, { ahora: reloj('2026-10-16') }).guardar({ nombre: 'A', apellidos: 'B', fechaNacimiento: '2999-01-01', sexo: 'F' });
  assert.deepEqual([r.ok, r.delStore, r.errores[0].campo], [false, true, 'fechaNacimiento']);
});

test('nadadoresService: delete cascades to attendance, loads and marks; restaurar brings everything back', () => {
  const repo = repoMem({
    Nadadores: [{ id: 'n1', nombre: 'A', apellidos: 'B' }, { id: 'n2', nombre: 'C', apellidos: 'D' }],
    Asistencia: [{ id: 'a1', nadadorId: 'n1' }, { id: 'a2', nadadorId: 'n2' }], Cargas: [{ id: 'c1', nadadorId: 'n1' }], Marcas: [{ id: 'm1', nadadorId: 'n1' }, { id: 'm2', nadadorId: 'n1' }],
  });
  const svc = crearNadadoresService(repo, { ahora: reloj('2026-10-16') });
  const copia = svc.eliminar('n1');
  assert.equal(repo.get('Nadadores', 'n1'), null);
  assert.deepEqual([repo.list('Asistencia').length, repo.list('Cargas').length, repo.list('Marcas').length], [1, 0, 0]);
  assert.equal(svc.eliminar('nope'), null);
  svc.restaurar(copia);
  assert.ok(repo.get('Nadadores', 'n1'));
  assert.deepEqual([repo.list('Asistencia').length, repo.list('Cargas').length, repo.list('Marcas').length], [2, 1, 2]);
  svc.restaurar(null);
});

test('nadadoresService.ficha and listar', () => {
  const repo = repoMem({
    Nadadores: [{ id: 'n1', nombre: 'A', apellidos: 'B', fechaNacimiento: '2016-10-17', grupoId: 'g1', categoria: 'Benjamín' }, { id: 'n2', nombre: 'I', apellidos: 'Z', activo: 'false' }],
    Grupos: [{ id: 'g1', nombre: 'G' }], Entrenamientos: [{ id: 'e1', fecha: '2026-10-01' }],
    Asistencia: [{ id: 'a1', nadadorId: 'n1', entrenamientoId: 'e1', estado: 'presente' }], Cargas: [], Marcas: [{ id: 'm1', nadadorId: 'n1', prueba: '50 Libre', piscina: '25', tiempoMs: 30000, fecha: '2026-01-01' }],
  });
  const svc = crearNadadoresService(repo, { ahora: reloj('2026-10-16') });
  const f = svc.ficha('n1');
  assert.equal(f.edad, 9);
  assert.equal(f.grupo.nombre, 'G');
  assert.equal(f.asistencia.resumen.porcentaje, 100);
  assert.equal(f.marcas[0].mejor, 30000);
  assert.equal(svc.ficha('nope'), null);
  assert.deepEqual(svc.listar({}).map((n) => n.id), ['n1']);
  assert.deepEqual(svc.listar({ inactivos: true }).map((n) => n.id), ['n1', 'n2']);
});

test('gruposService: cards, save validation, delete unassigns members in one write and undo restores them', () => {
  const repo = repoMem({
    Grupos: [{ id: 'g1', nombre: 'Alevín', categoria: 'Alevín', entrenador: '' }, { id: 'g2', nombre: 'Elite', categoria: 'Junior' }],
    Nadadores: [{ id: 'n1', nombre: 'A', apellidos: 'B', grupoId: 'g1' }, { id: 'n2', nombre: 'C', apellidos: 'D', grupoId: 'g1', activo: 'false' }, { id: 'n3', nombre: 'E', apellidos: 'F', grupoId: '' }],
  });
  let escrituras = 0;
  const upsertMany = repo.upsertMany;
  repo.upsertMany = (h, r) => { escrituras++; return upsertMany(h, r); };
  const svc = crearGruposService(repo);
  const t = svc.tarjetas();
  assert.deepEqual(t.map((x) => [x.grupo.id, x.miembros.length, x.categoria]), [['g1', 1, ''], ['g2', 0, 'Junior']]);
  assert.deepEqual(svc.sinGrupo().map((n) => n.id), ['n3']);
  assert.equal(svc.guardar({ nombre: ' ' }).ok, false);
  assert.equal(svc.guardar({ nombre: 'alevin' }).errores[0].codigo, 'nombre-duplicado');
  assert.equal(svc.guardar({ nombre: ' Nuevo ', entrenador: ' Ana ' }).fila.entrenador, 'Ana');
  escrituras = 0;
  const copia = svc.eliminar('g1');
  assert.equal(escrituras, 1, 'one write for all the members');
  assert.equal(repo.get('Grupos', 'g1'), null);
  assert.deepEqual(repo.list('Nadadores').map((n) => n.grupoId), ['', '', '']);
  svc.restaurar(copia);
  assert.deepEqual(repo.list('Nadadores').map((n) => n.grupoId), ['g1', 'g1', '']);
  assert.equal(svc.eliminar('nope'), null);
});

test('comunicacionesService: publish with the clock, filter, relative dates, delete and restore', () => {
  const repo = repoMem({ Comunicaciones: [{ id: 'c0', fecha: '2026-10-01', titulo: 'Viejo', texto: 'x', grupoId: '' }] });
  const svc = crearComunicacionesService(repo, { ahora: reloj('2026-10-16') });
  assert.equal(svc.publicar({ titulo: '', texto: '' }).ok, false);
  const r = svc.publicar({ titulo: ' Hola ', texto: 'Texto', grupoId: 'g1' });
  assert.equal(r.fila.fecha, '2026-10-16');
  assert.equal(r.fila.titulo, 'Hola');
  assert.deepEqual(svc.listar('').map((a) => a.titulo), ['Hola', 'Viejo']);
  assert.deepEqual(svc.listar('__todos').map((a) => a.titulo), ['Viejo']);
  assert.deepEqual(svc.relativa('2026-10-15'), { tipo: 'ayer', n: 1 });
  const borrada = svc.eliminar(r.fila.id);
  assert.equal(svc.total(), 1);
  svc.restaurar(borrada);
  assert.equal(svc.total(), 2);
  assert.equal(svc.eliminar('nope'), null);
});

test('clubService: identity save/validation, Drive location and mode', async () => {
  const repo = repoMem({}, { nombre: 'Viejo', otra: 'x' });
  const svc = crearClubService(repo, { cargarDrive: async () => ({ ensureFolder: async () => 'F', folderUrl: (id) => 'https://d/' + id }) });
  assert.equal(svc.guardarIdentidad({ nombre: ' ' }).ok, false);
  assert.equal(svc.guardarIdentidad({ nombre: ' Nuevo ', lema: 'L', colorPrimario: '#ff0000' }).ok, true);
  assert.equal(repo.club.nombre, 'Nuevo');
  assert.equal(repo.club.otra, 'x', 'other club keys are preserved');
  assert.equal(svc.identidad().colorPrimario, '#ff0000');
  assert.deepEqual(svc.ubicacion(), { nombre: 'Nuevo', ficheroUrl: 'https://drive.google.com/file/d/f1/view' });
  assert.equal(await svc.urlCarpeta(), 'https://d/F');
  assert.equal(svc.esDemo(), false);
  repo.mode = 'demo';
  repo.clubRef = null;
  assert.equal(svc.modo(), 'demo');
  assert.equal(svc.ubicacion().ficheroUrl, null);
  await assert.rejects(() => crearClubService(repo).urlCarpeta());
});
