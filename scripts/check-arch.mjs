// Architecture check (layers) for js/. Run by `npm run check` (and therefore by CI) and by tests/unit/architecture.test.js.
//
//   node scripts/check-arch.mjs                  checks js/ against scripts/arch-baseline.json (the ratchet)
//   node scripts/check-arch.mjs --update-baseline rewrites the baseline with the current violations (only to SHRINK it)
//   node scripts/check-arch.mjs --all            lists every violation, ignoring the baseline
//
// Ratchet: violations listed in the baseline are tolerated; a NEW violation fails; a baseline entry that no longer
// occurs also fails (remove it), so the file can only shrink. The goal is an empty baseline.
//
// Layers (docs/ARCHITECTURE.md):
//   domain          -> domain
//   application     -> domain, application       (application/ports = JSDoc contracts, may import only domain)
//   infrastructure  -> domain, application, infrastructure
//   presentation    -> domain, application, presentation
//   composicion     -> everything (composition root: js/composicion/** and js/main.js)
//
// Rules
//   R1  allowed imports per layer            R7  ports import only domain
//   R2  no import cycles                     R8  only the composition root imports composicion/** or main.js
//   R3  forbidden globals in domain/application (DOM, storage, network, timers, clock, randomness, console)
//   R4  presentation never imports infrastructure
//   R5  locales are imported only by presentation/i18n
//   R6  domain/application never import i18n / ui / router / icons / theme
//   R9  file size: > 550 lines warns, > 800 fails unless baselined
//   R10 no <style> injection in views (use useStyles('<name>') + css/views/<name>.css)
//   R11 views do not call store.upsert/remove directly (warn only)
//   R12 every import resolves to an existing file and ends in .js
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scan } from './lib/scan.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUTA_BASELINE = join(RAIZ, 'scripts', 'arch-baseline.json');

export const LIMITE_AVISO = 550;
export const LIMITE_ERROR = 800;

export const CAPAS = ['domain', 'application', 'ports', 'infrastructure', 'presentation', 'composicion'];
const PERMITIDO = {
  domain: ['domain'],
  ports: ['domain'],
  application: ['domain', 'application', 'ports'],
  infrastructure: ['domain', 'application', 'ports', 'infrastructure'],
  presentation: ['domain', 'application', 'ports', 'presentation'],
  composicion: CAPAS,
};

// Files that have not been moved into a layer folder yet (shrinks to nothing when the migration ends).
export const TRANSITORIO = [];

export function capaDe(rel) {
  if (rel === 'js/main.js') return 'composicion';
  const m = /^js\/(domain|application|infrastructure|presentation|composicion)\//.exec(rel);
  if (m) return m[1] === 'application' && rel.startsWith('js/application/ports/') ? 'ports' : m[1];
  for (const [re, capa] of TRANSITORIO) if (re.test(rel)) return capa;
  return null;
}

// Globals the pure layers must not touch. Property accesses (`x.fetch`) and object keys are not matched.
const GLOBALES = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'navigator',
  'location',
  'history',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'queueMicrotask',
  'console',
  'alert',
  'confirm',
  'prompt',
  'XMLHttpRequest',
  'FileReader',
  'Blob',
  'crypto',
  'performance',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'AbortController',
];
const RE_GLOBAL = new RegExp(
  `(?<![\\w$.])(?:globalThis\\s*\\.\\s*)?(${GLOBALES.join('|')})(?![\\w$])(?!\\s*:(?!:))`,
  'g',
);
const RE_GLOBAL_THIS = new RegExp(`\\bglobalThis\\s*\\.\\s*(${GLOBALES.join('|')})\\b`, 'g');
const PATRONES_IMPUROS = [
  [/\bDate\s*\.\s*now\s*\(/, 'Date.now()'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date()'],
  [/\bMath\s*\.\s*random\s*\(/, 'Math.random()'],
  [/(?<!\bnew\s+)\bDate\s*\(\s*\)/, 'Date()'],
];

const rutaLeg = (p) => p.split(sep).join('/');

function listarJs(raiz) {
  const out = [];
  const rec = (dir) => {
    for (const nombre of readdirSync(dir).sort()) {
      const abs = join(dir, nombre);
      if (statSync(abs).isDirectory()) rec(abs);
      else if (nombre.endsWith('.js')) out.push(rutaLeg(abs.slice(raiz.length + 1)));
    }
  };
  if (existsSync(join(raiz, 'js'))) rec(join(raiz, 'js'));
  return out;
}

// Strongly connected components with more than one member (import cycles). Static imports only: a dynamic import is
// a lazy edge and cannot deadlock module evaluation.
export function ciclos(grafo) {
  const idx = new Map(),
    low = new Map(),
    enPila = new Set(),
    pila = [],
    res = [];
  let n = 0;
  const visita = (v) => {
    idx.set(v, n);
    low.set(v, n);
    n++;
    pila.push(v);
    enPila.add(v);
    for (const w of grafo.get(v) || []) {
      if (!idx.has(w)) {
        visita(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (enPila.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = pila.pop();
        enPila.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1 || (grafo.get(v) || new Set()).has(v)) res.push(comp.sort());
    }
  };
  for (const v of [...grafo.keys()].sort()) if (!idx.has(v)) visita(v);
  return res;
}

function reglaDeImport(de, a, capaDeOrigen, capaDestino) {
  if (capaDeOrigen === 'ports' && capaDestino !== 'domain')
    return ['R7', `port imports ${a} (ports may only import domain)`];
  if (/\/locales\//.test(a) && !/^js\/(presentation\/i18n|locales)\//.test(de))
    return ['R5', `imports locale ${a} (only presentation/i18n may)`];
  if (capaDeOrigen !== 'composicion' && capaDestino === 'composicion')
    return ['R8', `imports composition root ${a} (only the composition root may)`];
  if ((capaDeOrigen === 'domain' || capaDeOrigen === 'application') && capaDestino === 'presentation')
    return ['R6', `imports presentation module ${a}`];
  if (capaDeOrigen === 'presentation' && capaDestino === 'infrastructure')
    return ['R4', `presentation imports infrastructure ${a}`];
  if (!PERMITIDO[capaDeOrigen].includes(capaDestino))
    return ['R1', `${capaDeOrigen} may not import ${capaDestino} (${a})`];
  return null;
}

// -> { errores: [{regla, clave, msg}], avisos: [string] }   `clave` is the stable identity used by the baseline.
export function analizar(raiz = RAIZ) {
  const errores = [],
    avisos = [];
  const add = (regla, clave, msg) => errores.push({ regla, clave: `${regla} ${clave}`, msg: `${regla} ${msg}` });
  const archivos = listarJs(raiz);
  const conjunto = new Set(archivos);
  const grafo = new Map();

  for (const f of archivos) {
    const src = readFileSync(join(raiz, f), 'utf8');
    const { code, text, imports } = scan(src);
    const capa = capaDe(f);
    const lineas = src.split('\n').length;
    grafo.set(f, new Set());

    // import(`./dir/${name}.js`): the static part of the specifier must at least point to a folder with modules.
    for (const m of text.matchAll(/import\(\s*`([^`$]*)\$\{/g)) {
      if (!m[1].startsWith('.')) continue;
      const dir = posix.normalize(posix.join(posix.dirname(f), m[1].replace(/[^/]*$/, ''))).replace(/\/?$/, '/');
      if (!archivos.some((a) => a.startsWith(dir)))
        add(
          'R12',
          `${f} -> ${m[1]}... (missing folder)`,
          `${f} dynamic import "${m[1]}\${...}" points to a folder without modules`,
        );
    }

    if (!capa)
      add(
        'R1',
        `${f} (outside a layer)`,
        `${f} is not inside a layer folder (domain/application/infrastructure/presentation/composicion)`,
      );

    for (const imp of imports) {
      if (!imp.spec.startsWith('.')) continue; // URL or bare specifier: not a module of the app
      const destino = posix.normalize(posix.join(posix.dirname(f), imp.spec));
      if (!/\.js$/.test(imp.spec)) {
        add('R12', `${f} -> ${imp.spec} (no .js)`, `${f}:${imp.line} import "${imp.spec}" must end in .js`);
        continue;
      }
      if (!conjunto.has(destino)) {
        add('R12', `${f} -> ${imp.spec} (missing)`, `${f}:${imp.line} import "${imp.spec}" does not resolve to a file`);
        continue;
      }
      if (!imp.dynamic) grafo.get(f).add(destino);
      if (!capa) continue;
      const capaDest = capaDe(destino);
      if (!capaDest) {
        add('R1', `${f} -> ${destino}`, `${f}:${imp.line} imports ${destino}, which is outside every layer`);
        continue;
      }
      const r = reglaDeImport(f, destino, capa, capaDest);
      if (r) add(r[0], `${f} -> ${destino}`, `${f}:${imp.line} ${r[1]}`);
    }

    if (capa === 'domain' || capa === 'application') {
      const vistos = new Set();
      const anota = (token) => {
        if (vistos.has(token)) return;
        vistos.add(token);
        add(
          'R3',
          `${f}: ${token}`,
          `${f} uses the forbidden global/impure call "${token}" (inject it: clock, id generator, storage, ...)`,
        );
      };
      for (const m of code.matchAll(RE_GLOBAL)) anota(m[1]);
      for (const m of code.matchAll(RE_GLOBAL_THIS)) anota(m[1]);
      for (const [re, nombre] of PATRONES_IMPUROS) if (re.test(code)) anota(nombre);
    }

    if (capa === 'presentation') {
      if (/createElement\(\s*['"]style['"]\s*\)|\bh\(\s*['"]style['"]|<style[\s>]/.test(text)) {
        add('R10', f, `${f} injects a <style>: use useStyles('<name>') with css/views/<name>.css`);
      }
      if (/\/views\//.test(f) && /\bstore\s*\.\s*(upsert|remove|upsertMany|removeMany)\s*\(/.test(code)) {
        avisos.push(`R11 ${f} calls store.upsert/remove directly (move the rule into an application service)`);
      }
    }

    if (lineas > LIMITE_ERROR) add('R9', f, `${f} has ${lineas} lines (> ${LIMITE_ERROR}): split it`);
    else if (lineas > LIMITE_AVISO)
      avisos.push(`R9 ${f} has ${lineas} lines (> ${LIMITE_AVISO}): consider splitting it`);
  }

  for (const comp of ciclos(grafo)) add('R2', comp.join(' > '), `import cycle: ${comp.join(' > ')}`);
  return { errores, avisos };
}

export function leerBaseline(ruta = RUTA_BASELINE) {
  if (!existsSync(ruta)) return [];
  return JSON.parse(readFileSync(ruta, 'utf8')).violations || [];
}

export function escribirBaseline(claves, ruta = RUTA_BASELINE) {
  const doc = {
    comment:
      'Known architecture violations tolerated by scripts/check-arch.mjs (ratchet). It may only shrink; the goal is an empty list. Each remaining entry is explained in docs/ARCHITECTURE.md.',
    violations: [...new Set(claves)].sort(),
  };
  writeFileSync(ruta, JSON.stringify(doc, null, 2) + '\n');
}

// -> { nuevos: [{clave,msg}], obsoletos: [clave], tolerados: n, avisos }
export function comprobar(raiz = RAIZ, baseline = leerBaseline()) {
  const { errores, avisos } = analizar(raiz);
  const base = new Set(baseline);
  const actuales = new Set(errores.map((e) => e.clave));
  const nuevos = errores.filter((e) => !base.has(e.clave));
  const obsoletos = baseline.filter((c) => !actuales.has(c));
  return { nuevos, obsoletos, tolerados: errores.length - nuevos.length, avisos, errores };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--update-baseline')) {
    const { errores } = analizar();
    escribirBaseline(errores.map((e) => e.clave));
    console.log(`Architecture baseline written: ${errores.length} known violation(s).`);
    process.exit(0);
  }
  if (args.includes('--all')) {
    const { errores, avisos } = analizar();
    for (const e of errores) console.log(e.msg);
    for (const a of avisos) console.log(`warn ${a}`);
    console.log(`${errores.length} violation(s), ${avisos.length} warning(s)`);
    process.exit(0);
  }
  const r = comprobar();
  for (const a of r.avisos) console.warn(`warn ${a}`);
  if (r.nuevos.length) {
    console.error(
      `Architecture check FAILED: ${r.nuevos.length} new violation(s):\n  - ` +
        r.nuevos.map((e) => e.msg).join('\n  - '),
    );
  }
  if (r.obsoletos.length) {
    console.error(
      `Architecture baseline is stale (fixed violations still listed). Run: node scripts/check-arch.mjs --update-baseline\n  - ` +
        r.obsoletos.join('\n  - '),
    );
  }
  if (r.nuevos.length || r.obsoletos.length) process.exit(1);
  console.log(`Architecture OK (${r.tolerados} known violation(s) in the baseline, ${r.avisos.length} warning(s))`);
}
