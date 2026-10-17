import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCategoriasService } from '../../js/application/categoriasService.js';
import { configPorDefecto } from '../../js/domain/categorias.js';

// In-memory repository with the same contract as the store (list/upsert + club/setClub)
function repoMem(nadadores = [], club = {}) {
  const filas = nadadores.map((n) => ({ ...n }));
  const repo = {
    club: { ...club },
    escrituras: 0,
    setClub(c) { repo.club = { ...c }; },
    list: (hoja) => (hoja === 'Nadadores' ? filas.map((f) => ({ ...f })) : []),
    upsert(hoja, row) {
      repo.escrituras++;
      const i = filas.findIndex((f) => f.id === row.id);
      const fila = { ...row, id: row.id || 'n' + (filas.length + 1) };
      if (i >= 0) filas[i] = fila; else filas.push(fila);
      return fila;
    },
    get: (id) => filas.find((f) => f.id === id),
  };
  return repo;
}
const reloj = (iso) => () => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const N = (id, fecha, extra = {}) => ({ id, nombre: 'N' + id, apellidos: 'A' + id, fechaNacimiento: fecha, sexo: 'F', categoria: '', licenciaMaster: 'false', categoriaManual: '', ...extra });

test('current season: derived from the clock or pinned on the club', () => {
  const r = repoMem();
  assert.equal(crearCategoriasService(r, { ahora: reloj('2026-10-15') }).temporadaActual(), 2026);
  assert.equal(crearCategoriasService(r, { ahora: reloj('2027-03-01') }).temporadaActual(), 2026);
  assert.equal(crearCategoriasService(r, { ahora: reloj('2027-09-01') }).temporadaActual(), 2027);
  assert.equal(crearCategoriasService(r, { ahora: reloj('2026-08-31') }).temporadaActual(), 2025);
  const fijada = crearCategoriasService(repoMem([], { temporadaActual: '2028-2029' }), { ahora: reloj('2026-10-15') });
  assert.equal(fijada.temporadaActual(), 2028);
  assert.equal(fijada.esAutomatica(), false);
  assert.equal(fijada.etiqueta(), '2028-2029');
  // invalid value -> automatic
  assert.equal(crearCategoriasService(repoMem([], { temporadaActual: 'basura' }), { ahora: reloj('2026-10-15') }).temporadaActual(), 2026);
});

test('recalcular updates the category of non-manual swimmers and returns the summary', () => {
  const r = repoMem([
    N('1', '2018-03-01'), N('2', '2013-05-05', { categoria: 'Alevín' }), N('3', '2008-01-01', { categoria: 'Absoluto' }), // 3 already correct
    N('4', '2013-05-05', { categoria: 'Junior', categoriaManual: 'Junior' }), // manual: unchanged
    N('5', '', { categoria: 'Benjamín' }), // no date: kept as is
    N('6', '1980-01-01', { licenciaMaster: 'true' }),
  ]);
  const s = crearCategoriasService(r, { ahora: reloj('2026-10-15') });
  const res = s.recalcular();
  assert.equal(res.etiqueta, '2026-2027');
  assert.deepEqual(res.cambios.map((c) => [c.id, c.de, c.a]), [['1', '', 'Pre-Benjamín'], ['2', 'Alevín', 'Infantil'], ['6', '', 'Master']]);
  assert.equal(res.manuales, 1);
  assert.equal(res.sinFecha, 1);
  assert.equal(r.get('4').categoria, 'Junior');
  assert.equal(r.get('5').categoria, 'Benjamín');
  assert.equal(r.club.temporadaAplicada, '2026-2027');
  // idempotent: second pass with no changes and no swimmer writes
  const antes = r.escrituras;
  assert.deepEqual(s.recalcular().cambios, []);
  assert.equal(r.escrituras, antes);
});

test('the manual category wins even if the season changes', () => {
  const r = repoMem([N('1', '2013-05-05', { categoriaManual: 'Master' })]);
  const s = crearCategoriasService(r, { ahora: reloj('2026-10-15') });
  s.recalcular(2026);
  assert.equal(r.get('1').categoria, 'Master');
  s.recalcular(2030);
  assert.equal(r.get('1').categoria, 'Master');
  assert.deepEqual(s.previsualizarCambio(2030), []);
});

test('alAbrirClub recalculates only if the current season is not the last applied one', () => {
  const r = repoMem([N('1', '2014-05-05', { categoria: 'Alevín' })], { temporadaAplicada: '2026-2027' });
  // same season: does nothing
  assert.equal(crearCategoriasService(r, { ahora: reloj('2027-03-01') }).alAbrirClub(), null);
  assert.equal(r.get('1').categoria, 'Alevín');
  // new season (1 Sep 2027): recalculates and saves temporadaAplicada
  const res = crearCategoriasService(r, { ahora: reloj('2027-09-01') }).alAbrirClub();
  assert.deepEqual(res.cambios.map((c) => [c.id, c.de, c.a]), [['1', 'Alevín', 'Infantil']]);
  assert.equal(r.club.temporadaAplicada, '2027-2028');
  assert.equal(r.get('1').categoria, 'Infantil');
  // a second opening no longer recalculates
  assert.equal(crearCategoriasService(r, { ahora: reloj('2027-09-02') }).alAbrirClub(), null);
});

test('alAbrirClub on an old club (without temporadaAplicada) computes the categories', () => {
  const r = repoMem([N('1', '2016-05-05', { categoria: '' })], {});
  const res = crearCategoriasService(r, { ahora: reloj('2026-10-15') }).alAbrirClub();
  assert.equal(res.cambios.length, 1);
  assert.equal(r.get('1').categoria, 'Benjamín');
});

test('changing season: previews, applies and leaves the season pinned (or automatic if it is today\'s)', () => {
  const r = repoMem([N('1', '2014-05-05', { categoria: 'Alevín' }), N('2', '2013-05-05', { categoria: 'Infantil' }), N('3', '2014-05-05', { categoria: 'Alevín', categoriaManual: 'Alevín' })]);
  const s = crearCategoriasService(r, { ahora: reloj('2026-10-15') });
  s.recalcular();
  assert.deepEqual(s.previsualizarCambio('2027-2028').map((c) => [c.id, c.de, c.a, c.sube]), [['1', 'Alevín', 'Infantil', true]]);
  assert.equal(r.get('1').categoria, 'Alevín', 'previewing does not write');
  const res = s.cambiarTemporada(2027);
  assert.equal(r.club.temporadaActual, '2027-2028');
  assert.equal(res.etiqueta, '2027-2028');
  assert.equal(r.get('1').categoria, 'Infantil');
  assert.equal(r.get('3').categoria, 'Alevín');
  assert.equal(r.club.temporadaAplicada, '2027-2028');
  // going back to today's season leaves the setting as automatic
  s.cambiarTemporada(2026);
  assert.equal(r.club.temporadaActual, '');
  assert.equal(r.get('1').categoria, 'Alevín');
  s.cambiarTemporada('');
  assert.equal(r.club.temporadaActual, '');
  assert.deepEqual(s.previsualizarCambio('basura'), []);
});

test('guardarNadador materialises the category (automatic, manual, no date)', () => {
  const r = repoMem();
  const s = crearCategoriasService(r, { ahora: reloj('2026-10-15') });
  assert.equal(s.guardarNadador({ ...N('a', '2012-02-02') }).categoria, 'Infantil');
  assert.equal(s.guardarNadador({ ...N('b', '2012-02-02', { categoriaManual: 'Master' }) }).categoria, 'Master');
  assert.equal(s.guardarNadador({ ...N('c', '1985-02-02', { licenciaMaster: 'true' }) }).categoria, 'Master');
  assert.equal(s.guardarNadador({ ...N('d', '', { categoria: 'Alevín' }) }).categoria, 'Alevín'); // cannot be computed: kept as is
  assert.equal(s.guardarNadador({ ...N('e', '') }).categoria, '');
});

test('previsualizar for the form: range, warnings and manual category', () => {
  const s = crearCategoriasService(repoMem(), { ahora: reloj('2026-10-15') });
  const p = s.previsualizar({ fechaNacimiento: '2014-05-05', sexo: 'F' });
  assert.deepEqual([p.categoria, p.manual, p.rango.desde, p.rango.hasta], ['Alevín', false, 2014, 2015]);
  assert.equal(p.temporada, 2026);
  const m = s.previsualizar({ fechaNacimiento: '2014-05-05', sexo: 'F', categoriaManual: 'Junior' });
  assert.deepEqual([m.categoria, m.manual, m.calculada], ['Junior', true, 'Alevín']);
  assert.deepEqual(s.previsualizar({ fechaNacimiento: '2024-01-01', sexo: 'F' }).avisos, ['por-debajo-edad']);
  assert.equal(s.previsualizar({}).categoria, '');
  assert.equal(s.previsualizar(null).rango, null);
});

test('rules: guardarConfig validates, saves and recalculates; restablecerConfig goes back to the defaults', () => {
  const r = repoMem([N('1', '2008-06-01', { categoria: 'Absoluto' })]);
  const s = crearCategoriasService(r, { ahora: reloj('2026-10-15') });
  const mala = configPorDefecto();
  mala.edades.F['Alevín'] = [12, 13];
  const rm = s.guardarConfig(mala);
  assert.equal(rm.ok, false);
  assert.ok(rm.errores.length);
  assert.equal(r.club.categoriasConfig, undefined);

  const cfg = configPorDefecto();
  cfg.edades.F['Junior'] = [15, 18];
  cfg.edades.F['Absoluto'] = [19, null];
  const ok = s.guardarConfig(cfg);
  assert.equal(ok.ok, true);
  assert.equal(r.get('1').categoria, 'Junior');
  assert.deepEqual(ok.resumen.cambios.map((c) => c.a), ['Junior']);
  assert.equal(s.config().edades.F.Junior[1], 18);
  assert.equal(s.tabla(2026, 'F').find((f) => f.categoria === 'Junior').desde, 2008);

  const rest = s.restablecerConfig();
  assert.equal(r.get('1').categoria, 'Absoluto');
  assert.equal(rest.cambios.length, 1);
  assert.deepEqual(s.config(), configPorDefecto());
});
