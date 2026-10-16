// Visual theme domain: PURE colour logic (no DOM). Used by js/theme.js / js/app.js and the contrast tests.
// Goal: whatever colour the user picks for the club must never make text unreadable (WCAG AA, 4.5:1).

export const BLANCO = [255, 255, 255];
export const NEGRO_TEXTO = [17, 17, 17]; // #111111: text on light colours (yellow, cyan...)
export const MIN_CONTRASTE = 4.5;

// Default brand colours and the surfaces of both themes (see css/tokens.css).
export const DEFECTO = { primario: '#1a73e8', secundario: '#0b3d91' };
export const SUPERFICIES = {
  light: { bg: [244, 247, 251], surface: [255, 255, 255], surface2: [248, 250, 253] },
  dark: { bg: [15, 23, 35], surface: [23, 34, 51], surface2: [29, 43, 64] },
};

// '#rrggbb' or '#rgb' (with or without #) -> [r,g,b]; anything else (including malicious CSS) -> null.
export function parseHex(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  let m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m) return m.slice(1, 4).map((x) => parseInt(x + x, 16));
  return null;
}

export const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// WCAG 2.x relative luminance (0 black .. 1 white).
export function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio between two [r,g,b] colours (1..21).
export function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Moves `color` towards `destino` (black or white) in 2 % steps until it contrasts >= min with `fondo`.
// If the colour already passes it is returned untouched.
export function ajustarContraste(color, fondo, destino, min = MIN_CONTRASTE) {
  let c = color;
  for (let t = 0; contraste(c, fondo) < min && t <= 1; t += 0.02) c = mezclar(color, destino, t);
  return contraste(c, fondo) >= min ? c : destino;
}

// Action colour (primary button background) and the text on it. Prefers white; if that fails uses #111;
// if neither passes (mid greys, pinks...) the colour is darkened until white passes.
// -> { action: [r,g,b], on: [r,g,b] }
export function colorSobrePrimario(rgb) {
  if (contraste(rgb, BLANCO) >= MIN_CONTRASTE) return { action: rgb, on: BLANCO };
  if (contraste(rgb, NEGRO_TEXTO) >= MIN_CONTRASTE) return { action: rgb, on: NEGRO_TEXTO };
  return { action: ajustarContraste(rgb, BLANCO, [0, 0, 0]), on: BLANCO };
}

const limpio = (c, def) => parseHex(c) || parseHex(def);

// CSS variables of the club theme for mode 'light' | 'dark'. Everything is validated: invalid input falls back to the default colour.
//  --c-primary / --c-secondary : club colours. In light mode EXACTLY the chosen ones (old views and tests read
//                                 them); in dark mode they are lightened just enough to read on dark surfaces.
//  --c-action / --c-on-primary : background and text of primary buttons, active menu item... (contrast >= 4.5).
//  --c-accent                  : primary as text / icon / link on surfaces (contrast >= 4.5).
//  --c-heading                 : secondary as heading text on surfaces (contrast >= 4.5).
export function variablesTema({ primario, secundario } = {}, modo = 'light') {
  const oscuro = modo === 'dark';
  const sup = SUPERFICIES[oscuro ? 'dark' : 'light'];
  const p = limpio(primario, DEFECTO.primario);
  const s = limpio(secundario, DEFECTO.secundario);
  // Worst-case text background: the one closest in luminance to the text (light: --bg; dark: --surface-2).
  const fondoTexto = oscuro ? sup.surface2 : sup.bg;
  const hacia = oscuro ? BLANCO : [0, 0, 0];
  const texto = (c) => ajustarContraste(c, fondoTexto, hacia);
  const base = oscuro ? texto(p) : p;
  const { action, on } = colorSobrePrimario(base);
  return {
    '--c-primary': toHex(base),
    '--c-secondary': toHex(oscuro ? texto(s) : s),
    '--c-action': toHex(action),
    '--c-on-primary': toHex(on),
    '--c-accent': toHex(texto(p)),
    '--c-heading': toHex(texto(s)),
  };
}
