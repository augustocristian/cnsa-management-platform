// Swimsuit catalogue domain ("Banadores") and the swimsuit-aware filter of the personal bests ("Marcas").
// PURE: no DOM, store, i18n or clock.
//
// A suit is club-level reference data (not personal data): { id, tipo, marca, modelo, activo, notas }.
//   tipo   = 'entrenamiento' (training suit) | 'competicion' (competition suit = fast skin / tech suit). Stored values are
//            neutral Spanish; the UI translates them ("Training suit" / "Fast skin (competition)").
//   marca  = brand, modelo = model. Both are required for a competition suit and optional for a training one.
//   activo = false hides it from the pickers when registering a time; the marks that used it keep pointing at it.
// A mark references its suit through the optional column Marcas.banadorId. A dangling id (the suit was deleted on another
// device) is treated as "no suit": it never removes the mark.
import { claveBusqueda } from './nombres.js';

export const TIPOS_BANADOR = Object.freeze(['entrenamiento', 'competicion']);
export const MARCA_MAX = 40;
export const MODELO_MAX = 60;
export const NOTAS_MAX = 240;
// Pseudo value of the type filter: marks that have no (known) suit.
export const SIN_BANADOR = 'sin-banador';
// Words used by etiquetaBanador when the caller does not pass translated ones.
export const ETIQUETAS_TIPO = Object.freeze({ entrenamiento: 'training', competicion: 'fast skin' });

const texto = (v) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ');
const aBool = (v, defecto) => {
  if (v === true || v === false) return v;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === '') return defecto;
  return !['false', 'no', '0', 'n'].includes(s);
};

// 'Competición' | ' COMPETICION ' | 'competicion' -> 'competicion'; anything else -> ''.
export function normalizarTipoBanador(v) {
  const k = claveBusqueda(v);
  return TIPOS_BANADOR.includes(k) ? k : '';
}

// Sheet row -> typed domain object.
export function normalizarBanador(r) {
  return {
    id: String(r.id ?? ''),
    tipo: normalizarTipoBanador(r.tipo),
    marca: texto(r.marca),
    modelo: texto(r.modelo),
    activo: aBool(r.activo, true),
    notas: texto(r.notas),
  };
}

// Domain object -> sheet row (simple values).
export function filaBanador(b) {
  return {
    id: b.id,
    tipo: b.tipo,
    marca: b.marca,
    modelo: b.modelo,
    activo: b.activo ? 'true' : 'false',
    notas: b.notas || '',
  };
}

// Uniqueness key: (type, brand, model) without accents, case or repeated spaces.
export const claveBanador = (b) => [claveBusqueda(b.tipo), claveBusqueda(b.marca), claveBusqueda(b.modelo)].join('|');

// Validation of the data of a suit -> [{campo, codigo}] (empty = valid). `existentes` = normalised suits already stored;
// `id` = the suit being edited (excluded from the duplicate check).
// Codes: tipo-invalido, marca-vacia, modelo-vacio (competition only), marca-larga, modelo-largo, notas-largas, duplicado.
export function validarBanador(data, existentes = [], { id = '' } = {}) {
  const d = data || {};
  const tipo = normalizarTipoBanador(d.tipo);
  const marca = texto(d.marca);
  const modelo = texto(d.modelo);
  const competicion = tipo === 'competicion';
  const reglas = [
    [!tipo, 'tipo', 'tipo-invalido'],
    [competicion && !marca, 'marca', 'marca-vacia'],
    [competicion && !modelo, 'modelo', 'modelo-vacio'],
    [marca.length > MARCA_MAX, 'marca', 'marca-larga'],
    [modelo.length > MODELO_MAX, 'modelo', 'modelo-largo'],
    [texto(d.notas).length > NOTAS_MAX, 'notas', 'notas-largas'],
  ];
  const errores = reglas.filter(([falla]) => falla).map(([, campo, codigo]) => ({ campo, codigo }));
  if (!errores.length) {
    const k = claveBanador({ tipo, marca, modelo });
    if ((existentes || []).some((b) => b.id !== String(id) && claveBanador(b) === k))
      errores.push({ campo: modelo ? 'modelo' : 'marca', codigo: 'duplicado' });
  }
  return errores;
}

// "Arena Powerskin Carbon Core FX — fast skin". `etiquetasTipo` lets the view pass translated words
// ({entrenamiento: 'training', competicion: 'fast skin'} by default). A suit without brand and model is just its type word.
export function etiquetaBanador(b, etiquetasTipo = ETIQUETAS_TIPO) {
  if (!b) return '';
  const nombre = [texto(b.marca), texto(b.modelo)].filter(Boolean).join(' ');
  const tipo = (etiquetasTipo && etiquetasTipo[b.tipo]) || ETIQUETAS_TIPO[b.tipo] || '';
  return nombre && tipo ? `${nombre} — ${tipo}` : nombre || tipo;
}

const comparador = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const rangoTipo = (tipo) => {
  const i = TIPOS_BANADOR.indexOf(tipo);
  return i < 0 ? TIPOS_BANADOR.length : i;
};

// Copy sorted by type (training first), active first, brand and model.
export function ordenarBanadores(banadores) {
  return (banadores || [])
    .slice()
    .sort(
      (a, b) =>
        rangoTipo(a.tipo) - rangoTipo(b.tipo) ||
        Number(b.activo) - Number(a.activo) ||
        comparador.compare(a.marca, b.marca) ||
        comparador.compare(a.modelo, b.modelo),
    );
}

// [{tipo, banadores}] for BOTH types, in TIPOS_BANADOR order (a group may be empty); suits of an unknown type are left out.
export function agruparBanadores(banadores) {
  const ord = ordenarBanadores(banadores);
  return TIPOS_BANADOR.map((tipo) => ({ tipo, banadores: ord.filter((b) => b.tipo === tipo) }));
}

export const filtrarActivos = (banadores) => (banadores || []).filter((b) => b.activo);

// Suits to offer when registering/editing a mark: the active ones plus the one the mark already has (even if inactive).
export function disponiblesParaMarca(banadores, banadorIdActual = '') {
  return ordenarBanadores((banadores || []).filter((b) => b.activo || b.id === String(banadorIdActual)));
}

// ---------- Marks and suits ----------
// Suit of a mark (or null: no suit, or the id no longer exists).
export function banadorDeMarca(marca, banadores) {
  const id = marca && marca.banadorId !== undefined && marca.banadorId !== null ? String(marca.banadorId) : '';
  if (!id) return null;
  return (banadores || []).find((b) => b.id === id) || null;
}

// Marks that used the suit `id`.
export const marcasDeBanador = (marcas, id) => (marcas || []).filter((m) => String(m.banadorId ?? '') === String(id));

// Number of marks per suit id -> Map(id -> n) (every suit appears, with 0 when unused).
export function conteoMarcasPorBanador(banadores, marcas) {
  const cuenta = new Map((banadores || []).map((b) => [b.id, 0]));
  (marcas || []).forEach((m) => {
    const id = String(m.banadorId ?? '');
    if (cuenta.has(id)) cuenta.set(id, cuenta.get(id) + 1);
  });
  return cuenta;
}

// Filter criteria are compared accent/case-insensitively. Empty criterion = no restriction.
// tipo may also be SIN_BANADOR (marks without a known suit).
function criterios({ tipo = '', marca = '', modelo = '' } = {}) {
  const t = tipo === SIN_BANADOR ? SIN_BANADOR : normalizarTipoBanador(tipo);
  return { tipo: t, marca: claveBusqueda(marca), modelo: claveBusqueda(modelo), tipoInvalido: !!tipo && !t };
}

// PURE FILTER used by the Marks view: marks whose suit matches {tipo, marca, modelo}.
//  - no criteria -> every mark (also those without suit);
//  - tipo 'entrenamiento' | 'competicion' -> only marks with a suit of that type;
//  - tipo SIN_BANADOR -> only marks without a (known) suit; brand and model are ignored then;
//  - marca / modelo -> exact match of the suit's brand / model.
export function filtrarMarcasPorBanador(marcas, banadores, filtro = {}) {
  const c = criterios(filtro);
  if (!c.tipo && !c.marca && !c.modelo && !c.tipoInvalido) return (marcas || []).slice();
  const porId = new Map((banadores || []).map((b) => [b.id, b]));
  return (marcas || []).filter((m) => {
    const b = porId.get(String(m.banadorId ?? '')) || null;
    if (c.tipo === SIN_BANADOR) return !b;
    if (c.tipoInvalido || !b) return false;
    return (
      (!c.tipo || b.tipo === c.tipo) &&
      (!c.marca || claveBusqueda(b.marca) === c.marca) &&
      (!c.modelo || claveBusqueda(b.modelo) === c.modelo)
    );
  });
}

// Options of the three filters with how many marks each one has.
//   -> { tipos: [{valor, n}], marcas: [{valor, etiqueta, n}], modelos: [{valor, etiqueta, marca, n}], sinBanador: n, conBanador: n }
// `valor` is the key to pass to filtrarMarcasPorBanador (type, or accent/case-insensitive brand/model); `etiqueta` is the
// brand/model as written. `seleccion` ({tipo, marca}) narrows the dependent lists: brands to the chosen type, models to the
// chosen type and brand; the counts then are those of the narrowed list. By default only options with at least one mark are
// offered ({ incluirVacios: true } lists every suit of the catalogue).
export function opcionesFiltro(banadores, marcas, seleccion = {}, { incluirVacios = false } = {}) {
  const sel = criterios(seleccion);
  const lista = banadores || [];
  const cuenta = conteoMarcasPorBanador(lista, marcas);
  const conBanador = lista.reduce((s, b) => s + cuenta.get(b.id), 0);
  const total = (marcas || []).length;
  const tipos = TIPOS_BANADOR.map((valor) => ({
    valor,
    n: lista.filter((b) => b.tipo === valor).reduce((s, b) => s + cuenta.get(b.id), 0),
  })).filter((o) => incluirVacios || o.n > 0);

  const acumular = (suits, clave, extra = () => ({})) => {
    const m = new Map();
    suits.forEach((b) => {
      const v = clave(b);
      if (!v) return;
      const k = claveBusqueda(v);
      const o = m.get(k) || { valor: k, etiqueta: v, ...extra(b), n: 0 };
      o.n += cuenta.get(b.id);
      m.set(k, o);
    });
    return [...m.values()]
      .filter((o) => incluirVacios || o.n > 0)
      .sort((a, b) => comparador.compare(a.etiqueta, b.etiqueta));
  };
  const deTipo = lista.filter((b) => !sel.tipo || sel.tipo === SIN_BANADOR || b.tipo === sel.tipo);
  const marcasOp = acumular(deTipo, (b) => b.marca);
  const deMarca = deTipo.filter((b) => !sel.marca || claveBusqueda(b.marca) === sel.marca);
  const modelosOp = acumular(
    deMarca,
    (b) => b.modelo,
    (b) => ({ marca: b.marca }),
  );
  return { tipos, marcas: marcasOp, modelos: modelosOp, sinBanador: total - conBanador, conBanador };
}
