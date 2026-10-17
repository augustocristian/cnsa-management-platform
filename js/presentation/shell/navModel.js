// Navigation model (pure data, no DOM). One source for the desktop sidebar, the mobile bottom bar and the "More" sheet.
//   - Desktop sidebar: Home, then the three groups with headers.
//   - Mobile bottom bar: BARRA_MOVIL (4 items) + "More".
//   - "More" sheet: the same three groups, minus the items that already sit in the bottom bar.
// Route names are the stored/neutral ones (js/presentation/views/<name>.js); labels come from i18n (`nav.<name>`).

export const INICIO = 'inicio';

export const GRUPOS = [
  { id: 'personas', titulo: 'nav.grupo.personas', rutas: ['nadadores', 'grupos'] },
  {
    id: 'entrenamiento',
    titulo: 'nav.grupo.entrenamiento',
    rutas: ['entrenamientos', 'asistencia', 'calendario', 'planificacion', 'cargas', 'marcas'],
  },
  { id: 'club', titulo: 'nav.grupo.club', rutas: ['comunicaciones', 'club', 'tutorial'] },
];

// Items in the mobile bottom bar (the fifth slot is the "More" button).
export const BARRA_MOVIL = ['inicio', 'entrenamientos', 'asistencia', 'calendario'];

// Old route names that still resolve (bookmarks, PWA shortcuts): swimsuits now live inside Marks.
export const REDIRECCIONES = { banador: 'marcas' };

// Short label for the bottom bar when the full one does not fit in a fifth of a phone width.
export const ETIQUETA_CORTA = { entrenamientos: 'nav.corto.entrenamientos' };

export const ICONOS = { club: 'ajustes', tutorial: 'ayuda' };
export const iconoDe = (ruta) => ICONOS[ruta] || ruta;

export const RUTAS = [INICIO, ...GRUPOS.flatMap((g) => g.rutas)];
export const esRuta = (name) => RUTAS.includes(name);
export const resolverRuta = (name) => REDIRECCIONES[name] || name;

// Groups shown in the "More" sheet (items already in the bottom bar removed; empty groups dropped).
export function gruposMas() {
  return GRUPOS.map((g) => ({ ...g, rutas: g.rutas.filter((r) => !BARRA_MOVIL.includes(r)) })).filter(
    (g) => g.rutas.length,
  );
}

// Is `name` reachable only through "More" on mobile?
export const enMas = (name) => esRuta(name) && !BARRA_MOVIL.includes(name);
