import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../js/domain/categorias.js';
import { CATEGORIAS } from '../../js/schema.js';

const nad = (fecha, sexo = 'F', extra = {}) => ({ fechaNacimiento: fecha, sexo, ...extra });
const cat = (fecha, temporada, sexo = 'F', extra = {}, config) => C.categoriaDe(nad(fecha, sexo, extra), temporada, config).categoria;

// ---------- Constantes ----------
test('el orden de categorías del dominio coincide con schema.CATEGORIAS', () => {
  assert.deepEqual(C.CATEGORIAS_ORDEN, CATEGORIAS);
  assert.equal(C.ordenCategoria('Master'), 6);
  assert.equal(C.ordenCategoria('Desconocida'), 7);
});

// ---------- Temporadas ----------
test('temporadaDe: la temporada empieza el 1 de septiembre', () => {
  assert.equal(C.temporadaDe('2026-09-01'), 2026);
  assert.equal(C.temporadaDe('2026-08-31'), 2025);
  assert.equal(C.temporadaDe('2026-12-31'), 2026);
  assert.equal(C.temporadaDe('2027-01-01'), 2026);
  assert.equal(C.temporadaDe('2027-08-31'), 2026);
  assert.equal(C.temporadaDe('2027-09-01'), 2027);
  assert.equal(C.temporadaDe('2026-10-15T10:00:00'), 2026);
  assert.equal(C.temporadaDe(new Date(2027, 2, 3)), 2026);
});

test('temporadaDe: fechas inválidas -> null, sin lanzar', () => {
  for (const f of ['', null, undefined, 'hola', '2026-13-01', '2026-02-30', '2026-00-10', '26-01-01', 20260101, {}, [], new Date('x'), '1800-01-01']) {
    assert.equal(C.temporadaDe(f), null, String(f));
  }
  assert.equal(C.temporadaDe('2024-02-29'), 2023); // bisiesto válido
  assert.equal(C.temporadaDe('2025-02-29'), null);
});

test('etiqueta y parseo de temporada', () => {
  assert.equal(C.etiquetaTemporada(2026), '2026-2027');
  assert.equal(C.etiquetaTemporada('2026'), '2026-2027');
  assert.equal(C.etiquetaTemporada('x'), '');
  assert.equal(C.parseTemporada(2026), 2026);
  for (const v of ['2026', '2026-2027', '2026/2027', '2026-27', '2026/27', ' 2026-2027 ']) assert.equal(C.parseTemporada(v), 2026, v);
  assert.equal(C.parseTemporada('2099-2100'), 2099);
  for (const v of ['', null, undefined, 'x', '2026-2030', '2026-28', '26', 1800, 2026.5, NaN, {}]) assert.equal(C.parseTemporada(v), null, String(v));
  assert.deepEqual(C.limitesTemporada(2026), { inicio: '2026-09-01', fin: '2027-08-31' });
  assert.equal(C.limitesTemporada('x'), null);
});

test('edadCumplida', () => {
  assert.equal(C.edadCumplida('2010-06-15', '2026-06-14'), 15);
  assert.equal(C.edadCumplida('2010-06-15', '2026-06-15'), 16);
  assert.equal(C.edadCumplida('2010-12-31', '2027-01-01'), 16);
  assert.equal(C.edadCumplida('2030-01-01', '2026-01-01'), '');
  assert.equal(C.edadCumplida('', '2026-01-01'), '');
  assert.equal(C.edadCumplida('2010-01-01', 'x'), '');
});

// ---------- Tabla de la temporada 2026-2027 (referencia RFEN) ----------
test('tablaCategorias 2026: sale del cálculo, no de datos fijos', () => {
  const filas = C.tablaCategorias(2026);
  const r = Object.fromEntries(filas.map((f) => [f.categoria, [f.desde, f.hasta]]));
  assert.deepEqual(r['Pre-Benjamín'], [2018, 2018]);
  assert.deepEqual(r['Benjamín'], [2016, 2017]);
  assert.deepEqual(r['Alevín'], [2014, 2015]);
  assert.deepEqual(r['Infantil'], [2012, 2013]);
  assert.deepEqual(r['Junior'], [2009, 2011]);
  assert.deepEqual(r['Absoluto'], [null, 2008]);
  assert.deepEqual(r['Master'], [null, 2001]); // 25 años en la temporada
  assert.deepEqual(filas.map((f) => f.categoria), CATEGORIAS);
  assert.equal(filas.at(-1).master, true);
  assert.equal(filas.filter((f) => f.master).length, 1);
});

test('tablaCategorias es relativa al año de inicio: 2027 y 2028 desplazan un año por temporada', () => {
  const rango = (t, c) => { const x = C.rangoAnios(c, t); return [x.desde, x.hasta]; };
  assert.deepEqual(rango(2027, 'Pre-Benjamín'), [2019, 2019]);
  assert.deepEqual(rango(2027, 'Benjamín'), [2017, 2018]);
  assert.deepEqual(rango(2028, 'Alevín'), [2016, 2017]);
  assert.deepEqual(rango(2028, 'Absoluto'), [null, 2010]);
  assert.deepEqual(rango(2025, 'Junior'), [2008, 2010]);
});

test('tablaCategorias: temporada inválida -> []; rangoAnios de categoría desconocida -> null', () => {
  assert.deepEqual(C.tablaCategorias('x'), []);
  assert.deepEqual(C.tablaCategorias(null), []);
  assert.equal(C.rangoAnios('Nada', 2026), null);
  assert.deepEqual(C.rangoAnios('Benjamín', '2026-2027'), { desde: 2016, hasta: 2017, master: false, edadMin: 9, edadMax: 10 });
});

// ---------- categoriaDe ----------
test('categoriaDe: cada año de la tabla 2026-2027 cae en su categoría', () => {
  const esperado = {
    2020: 'Pre-Benjamín', 2019: 'Pre-Benjamín', 2018: 'Pre-Benjamín',
    2017: 'Benjamín', 2016: 'Benjamín', 2015: 'Alevín', 2014: 'Alevín',
    2013: 'Infantil', 2012: 'Infantil', 2011: 'Junior', 2010: 'Junior', 2009: 'Junior',
    2008: 'Absoluto', 2005: 'Absoluto', 1980: 'Absoluto', 1950: 'Absoluto',
  };
  for (const [anio, c] of Object.entries(esperado)) {
    assert.equal(cat(`${anio}-06-15`, 2026), c, anio);
    assert.equal(cat(`${anio}-01-01`, 2026), c, anio + ' 1 ene');
    assert.equal(cat(`${anio}-12-31`, 2026), c, anio + ' 31 dic');
  }
});

test('categoriaDe: bordes 31 dic / 1 ene (cuenta el año de nacimiento, no el mes)', () => {
  assert.equal(cat('2008-12-31', 2026), 'Absoluto');
  assert.equal(cat('2009-01-01', 2026), 'Junior');
  assert.equal(cat('2011-12-31', 2026), 'Junior');
  assert.equal(cat('2012-01-01', 2026), 'Infantil');
  assert.equal(cat('2013-12-31', 2026), 'Infantil');
  assert.equal(cat('2014-01-01', 2026), 'Alevín');
  assert.equal(cat('2017-12-31', 2026), 'Benjamín');
  assert.equal(cat('2018-01-01', 2026), 'Pre-Benjamín');
});

test('categoriaDe: detalle del resultado (edad, año, origen)', () => {
  const r = C.categoriaDe(nad('2013-06-30'), 2026);
  assert.deepEqual([r.categoria, r.origen, r.edad, r.anioNacimiento, r.sexo, r.avisos], ['Infantil', 'edad', 13, 2013, 'F', []]);
});

test('un nadador cambia de categoría al cambiar de temporada: 2026 -> 2027 -> 2028', () => {
  const n = nad('2014-05-05');
  assert.deepEqual([2026, 2027, 2028, 2029].map((t) => C.categoriaDe(n, t).categoria), ['Alevín', 'Infantil', 'Infantil', 'Junior']);
  const m = nad('2008-03-03', 'M');
  assert.deepEqual([2025, 2026, 2027].map((t) => C.categoriaDe(m, t).categoria), ['Junior', 'Absoluto', 'Absoluto']);
});

test('categoriaDe: la temporada se deriva de una fecha con temporadaDe', () => {
  const n = nad('2012-06-01');
  assert.equal(C.categoriaDe(n, C.temporadaDe('2026-08-31')).categoria, 'Infantil'); // temporada 2025: 13 años
  assert.equal(C.categoriaDe(n, C.temporadaDe('2026-09-01')).categoria, 'Infantil'); // temporada 2026: 14 años
  assert.equal(C.categoriaDe(n, C.temporadaDe('2027-09-01')).categoria, 'Junior'); // temporada 2027: 15 años
});

test('categoriaDe: demasiado joven -> Pre-Benjamín con aviso por-debajo-edad', () => {
  for (const f of ['2019-01-01', '2024-05-05', '2026-10-01', '2030-01-01']) {
    const r = C.categoriaDe(nad(f), 2026);
    assert.equal(r.categoria, 'Pre-Benjamín', f);
    assert.deepEqual(r.avisos, ['por-debajo-edad'], f);
  }
  assert.deepEqual(C.categoriaDe(nad('2018-12-31'), 2026).avisos, []);
});

test('categoriaDe: datos inválidos o ausentes -> sin categoría y nunca lanza', () => {
  const malos = [null, undefined, {}, [], 'x', 5, nad(''), nad(null), nad('mañana'), nad('2026-02-30'), nad('31/12/2010'), nad(12345), { fechaNacimiento: { a: 1 } }];
  for (const n of malos) {
    const r = C.categoriaDe(n, 2026);
    assert.equal(r.categoria, '', JSON.stringify(n));
    assert.equal(r.origen, 'sin-fecha');
  }
  for (const t of [null, undefined, '', 'x', NaN, {}]) assert.deepEqual([C.categoriaDe(nad('2010-01-01'), t).categoria, C.categoriaDe(nad('2010-01-01'), t).origen], ['', 'sin-temporada']);
  assert.doesNotThrow(() => C.categoriaDe(nad('2010-01-01'), 2026, 'no es json'));
  assert.doesNotThrow(() => C.categoriaDe(nad('2010-01-01'), 2026, { edades: 5 }));
});

test('categoriaDe: sexo (F/M, variantes y vacío)', () => {
  for (const s of ['F', 'f', 'Femenino', 'mujer']) assert.equal(C.sexoNormalizado(s), 'F');
  for (const s of ['M', 'm', 'Masculino', 'hombre']) assert.equal(C.sexoNormalizado(s), 'M');
  for (const s of ['', null, undefined, 'X', 5]) assert.equal(C.sexoNormalizado(s), '');
  // por defecto F y M comparten tabla, también sin sexo
  assert.equal(cat('2013-01-01', 2026, ''), 'Infantil');
  assert.equal(cat('2013-01-01', 2026, 'M'), 'Infantil');
  assert.equal(cat('2013-01-01', 2026, 'Masculino'), 'Infantil');
});

// ---------- Master ----------
test('Master: licencia máster Y edad mínima (25 por defecto)', () => {
  assert.equal(cat('1984-07-09', 2026, 'M', { licenciaMaster: 'true' }), 'Master');
  assert.equal(cat('1984-07-09', 2026, 'M', { licenciaMaster: 'false' }), 'Absoluto'); // sin licencia
  assert.equal(cat('1984-07-09', 2026, 'M', {}), 'Absoluto');
  assert.equal(C.categoriaDe(nad('1984-07-09', 'M', { licenciaMaster: 'true' }), 2026).origen, 'master');
  // edad 25 en la temporada: nacido en 2001
  assert.equal(cat('2001-12-31', 2026, 'F', { licenciaMaster: 'true' }), 'Master');
  assert.equal(cat('2002-01-01', 2026, 'F', { licenciaMaster: 'true' }), 'Absoluto'); // 24
  // al cambiar de temporada alcanza la edad
  assert.equal(cat('2002-01-01', 2027, 'F', { licenciaMaster: 'true' }), 'Master');
  assert.deepEqual(C.categoriaDe(nad('2002-01-01', 'F', { licenciaMaster: 'true' }), 2026).avisos, ['master-edad-insuficiente']);
});

test('Master: variantes de licenciaMaster y booleano', () => {
  for (const v of [true, 'true', 'TRUE', 'sí', 'Si', '1', 'yes']) assert.equal(cat('1980-01-01', 2026, 'M', { licenciaMaster: v }), 'Master', String(v));
  for (const v of [false, 'false', '', null, undefined, 0, 'no', 'zz']) assert.equal(cat('1980-01-01', 2026, 'M', { licenciaMaster: v }), 'Absoluto', String(v));
});

test('Master: una licencia máster en un joven no lo convierte en Master y respeta la tabla por año', () => {
  assert.equal(cat('2013-01-01', 2026, 'F', { licenciaMaster: 'true' }), 'Infantil');
});

// ---------- Configuración ----------
test('configPorDefecto: idéntica para F y M, 25 años, y es una copia independiente', () => {
  const c = C.configPorDefecto();
  assert.equal(c.edadMinimaMaster, 25);
  assert.deepEqual(c.edades.F, c.edades.M);
  assert.equal(C.tablasIguales(c), true);
  c.edades.F['Alevín'][0] = 1;
  assert.deepEqual(C.EDADES_POR_DEFECTO['Alevín'], [11, 12]);
  assert.deepEqual(C.configPorDefecto().edades.F['Alevín'], [11, 12]);
  assert.deepEqual(C.validarConfig(C.configPorDefecto()), []);
});

test('config editable: edad mínima máster de 30 años', () => {
  const cfg = C.configPorDefecto();
  cfg.edadMinimaMaster = 30;
  assert.equal(cat('1997-01-01', 2026, 'M', { licenciaMaster: 'true' }, cfg), 'Absoluto'); // 29
  assert.equal(cat('1996-01-01', 2026, 'M', { licenciaMaster: 'true' }, cfg), 'Master'); // 30
  assert.equal(C.rangoAnios('Master', 2026, { config: cfg }).hasta, 1996);
});

test('tabla por sexo distinta: F y M se calculan por separado', () => {
  const cfg = C.configPorDefecto();
  cfg.edades.M['Junior'] = [15, 18];
  cfg.edades.M['Absoluto'] = [19, null];
  assert.deepEqual(C.validarConfig(cfg), []);
  assert.equal(C.tablasIguales(C.normalizarConfig(cfg)), false);
  assert.equal(cat('2008-06-01', 2026, 'M', {}, cfg), 'Junior'); // 18
  assert.equal(cat('2008-06-01', 2026, 'F', {}, cfg), 'Absoluto');
  assert.deepEqual(C.tablaCategorias(2026, { sexo: 'M', config: cfg }).find((f) => f.categoria === 'Absoluto'), { categoria: 'Absoluto', edadMin: 19, edadMax: null, desde: null, hasta: 2007 });
  // sin sexo y con tablas distintas no se puede decidir
  const r = C.categoriaDe(nad('2008-06-01', ''), 2026, cfg);
  assert.deepEqual([r.categoria, r.origen], ['', 'sin-sexo']);
});

test('validarConfig detecta huecos, solapes, abiertas y edades no válidas', () => {
  const con = (fn) => { const c = C.configPorDefecto(); fn(c); return C.validarConfig(c).map((e) => `${e.codigo}:${e.sexo || ''}:${e.categoria || ''}`); };
  assert.deepEqual(con((c) => { c.edades.F['Alevín'] = [12, 13]; }), ['no-contigua:F:Alevín', 'no-contigua:F:Infantil']);
  assert.deepEqual(con((c) => { c.edades.M['Junior'] = [15, 20]; }), ['no-contigua:M:Absoluto']);
  assert.deepEqual(con((c) => { c.edades.F['Absoluto'] = [18, 30]; }), ['ultima-abierta:F:Absoluto']);
  assert.deepEqual(con((c) => { c.edades.F['Benjamín'] = [10, 9]; }), ['no-contigua:F:Benjamín', 'rango-invalido:F:Benjamín']);
  assert.ok(con((c) => { c.edades.M['Pre-Benjamín'] = ['x', 8]; }).some((e) => e.startsWith('edad-invalida:M:Pre-Benjamín')));
  assert.deepEqual(con((c) => { c.edadMinimaMaster = 5; }), ['edad-master-invalida::']);
  assert.deepEqual(con((c) => { delete c.edades.M; }), ['tabla-invalida:M:']);
  assert.ok(C.validarConfig(null).length > 0);
});

test('normalizarConfig siempre devuelve una configuración válida (JSON, parcial o rota)', () => {
  const def = C.configPorDefecto();
  for (const raw of [undefined, null, '', 'no json', '[]', 5, {}, { edades: { F: { 'Alevín': [1, 2] } } }]) assert.deepEqual(C.normalizarConfig(raw), def, JSON.stringify(raw));
  const cfg = C.configPorDefecto();
  cfg.edadMinimaMaster = 28;
  cfg.edades.M['Junior'] = [15, 18];
  cfg.edades.M['Absoluto'] = [19, null];
  const n = C.normalizarConfig(JSON.stringify(cfg));
  assert.deepEqual(n, cfg);
  // una tabla inválida se sustituye sólo en ese sexo; la edad máster válida se conserva
  const parcial = JSON.parse(JSON.stringify(cfg));
  parcial.edades.F['Alevín'] = [20, 21];
  const p = C.normalizarConfig(parcial);
  assert.deepEqual(p.edades.F, def.edades.F);
  assert.deepEqual(p.edades.M, cfg.edades.M);
  assert.equal(p.edadMinimaMaster, 28);
  assert.deepEqual(C.validarConfig(p), []);
});

// ---------- categoriaVigente y cambiosDeTemporada ----------
test('categoriaVigente: la manual manda; si no, la calculada', () => {
  const a = C.categoriaVigente(nad('2013-06-30', 'F', { categoriaManual: 'Junior' }), 2026);
  assert.deepEqual([a.categoria, a.manual, a.calculada], ['Junior', true, 'Infantil']);
  const b = C.categoriaVigente(nad('2013-06-30', 'F', { categoriaManual: '  ' }), 2026);
  assert.deepEqual([b.categoria, b.manual], ['Infantil', false]);
  const c = C.categoriaVigente(nad('', 'F', { categoriaManual: 'Alevín' }), 2026); // manual sin fecha
  assert.deepEqual([c.categoria, c.manual], ['Alevín', true]);
  assert.equal(C.categoriaVigente(null, 2026).categoria, '');
});

test('cambiosDeTemporada: quién cambia de categoría entre dos temporadas', () => {
  const lista = [
    { id: '1', nombre: 'Ana', apellidos: 'Z', fechaNacimiento: '2014-05-05', sexo: 'F' }, // Alevín -> Infantil (2027)
    { id: '2', nombre: 'Beto', apellidos: 'A', fechaNacimiento: '2014-05-05', sexo: 'M' },
    { id: '3', nombre: 'Cris', apellidos: 'M', fechaNacimiento: '2013-05-05', sexo: 'F' }, // Infantil -> Infantil (14->... 2027: 14) sin cambio
    { id: '4', nombre: 'Dani', apellidos: 'M', fechaNacimiento: '2014-05-05', sexo: 'F', categoriaManual: 'Alevín' }, // manual: omitido
    { id: '5', nombre: 'Eva', apellidos: 'M', fechaNacimiento: '', sexo: 'F' }, // sin fecha: omitido
    { id: '6', nombre: 'Fer', apellidos: 'M', fechaNacimiento: '1990-01-01', sexo: 'M', licenciaMaster: 'true' }, // Master ya
    { id: '7', nombre: 'Gus', apellidos: 'B', fechaNacimiento: '2002-02-02', sexo: 'M', licenciaMaster: 'true' }, // Absoluto -> Master en 2027
  ];
  const c = C.cambiosDeTemporada(lista, 2026, 2027);
  assert.deepEqual(c.map((x) => [x.id, x.de, x.a, x.sube]), [['1', 'Alevín', 'Infantil', true], ['2', 'Alevín', 'Infantil', true], ['7', 'Absoluto', 'Master', true]]);
  assert.deepEqual(C.cambiosDeTemporada(lista, 2026, 2026), []);
  assert.deepEqual(C.cambiosDeTemporada(null, 2026, 2027), []);
  assert.deepEqual(C.cambiosDeTemporada(lista, 2027, 2026).map((x) => x.sube).every((s) => s === false), true);
  assert.deepEqual(C.cambiosDeTemporada(lista, 'x', 2027), []);
});

// ---------- i18n ----------
import es from '../../js/locales/categorias.es.js';
import en from '../../js/locales/categorias.en.js';
import it from '../../js/locales/categorias.it.js';
import { readFileSync } from 'node:fs';
import { t, setLang } from '../../js/i18n.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [nombre, d] of [['en', en], ['it', it]]) {
  test(`categorías ${nombre}: mismas claves y variables que es`, () => {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), []);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), []);
    for (const k of Object.keys(es)) { assert.ok(d[k].trim().length > 0, k); assert.equal(vars(d[k]), vars(es[k]), k); }
  });
}

test('categorías: todas las claves categorias.* usadas en el código existen y están fusionadas en i18n', () => {
  const codigo = ['js/views/categorias-panel.js', 'js/views/nadadores.js'].map((f) => readFileSync(f, 'utf8')).join('\n');
  const usadas = new Set([...codigo.matchAll(/'(categorias\.[\w.-]+)'/g)].map((m) => m[1]));
  const dinamicas = ['categorias.reglas.err.']; // categorias.reglas.err.<codigo>
  for (const k of usadas) assert.ok(k in es, 'falta ' + k);
  for (const e of ['edad-invalida', 'no-contigua', 'rango-invalido', 'ultima-abierta', 'tabla-invalida', 'edad-master-invalida']) assert.ok(`${dinamicas[0]}${e}` in es);
  for (const lang of ['es', 'en', 'it']) { setLang(lang, { persist: false }); assert.notEqual(t('categorias.panel.cambiar'), 'categorias.panel.cambiar', lang); }
  setLang('es', { persist: false });
});
