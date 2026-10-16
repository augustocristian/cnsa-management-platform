# `.claude/` - agents, skills and permissions for CNL Plataforma

Project-level Claude Code configuration, specific to this repository (static ES-module PWA for swimming coaches; single-user: each person signs in with their own Google account and their data lives in the `cnl` folder of their own Drive). Everything here is written in English; only the app's UI strings are Spanish/English/Italian, and sheet names, identifiers and stored values (`Nadadores`, `Entrenamientos`, `planificado`...) stay in Spanish exactly as in the code.

```
.claude/
  settings.json               project permissions (allow / ask / deny)
  agents/<name>.md            subagents (YAML frontmatter: name, description, tools, model)
  skills/<name>/SKILL.md      step-by-step procedures (+ *.tpl templates next to them)
```

## Golden rule (applies to every agent and skill)

Small, descriptive commits; push at every milestone; **never break the app** - `npm run check` + `npm run test:unit` + `npm run test:integration` + the relevant e2e area before each commit, the full `npm run test:e2e` before each push. Agents running in parallel work on **disjoint file zones** (hot files: `sw.js`, `js/i18n.js`, `js/store.js`, `js/schema.js`, `js/app.js`, `README.md`, `docs/ARCHITECTURE.md`, `package*.json`) and stage explicit paths, never `git add -A`.

## Verified commands

| Purpose | Command |
|---|---|
| Syntax check | `npm run check` |
| Unit (~450 tests, ~15 s) | `npm run test:unit` (one file: `node --test tests/unit/<file>.test.js`) |
| Integration (jsdom) | `npm run test:integration` |
| E2E, desktop then mobile (8-10 min, run in background) | `npm run test:e2e` |
| E2E, one area | `npx cucumber-js --tags "@<area> and not @google and not @pendiente"` (+ `VIEWPORT=movil`). **A bare feature path runs ALL scenarios**, because `cucumber.js` merges its `paths` with the CLI ones; use the area tag |
| Screenshots | `npm run capturas [-- --solo=id1,id2 --dispositivo=movil]` |
| Local server | `npm run serve` (port 4173) |

## Agents (`agents/`)

| Agent | Model | Invoke it when... |
|---|---|---|
| `arquitecto` | opus | deciding which layer code goes in, reviewing dependency rules/ports, adding the architecture test, planning a phased refactor |
| `desarrollador-funcionalidades` | sonnet | implementing a whole feature end to end (domain -> service -> view -> i18n -> tests -> feature -> docs -> screenshots -> service worker) |
| `qa-tests` | sonnet | writing, running or diagnosing unit / integration / e2e tests; removing date-dependent or brittle tests |
| `i18n` | sonnet | translating texts, key/variable parity, swimming terminology, neutral stored values, adding a language |
| `ux-a11y` | sonnet | design system compliance, WCAG 2.2 AA, mobile-first, dark mode, Playwright visual review |
| `datos-drive` | opus | anything touching `schema.js`, `sheetdata.js`, `store.js`, `drive.js`, `cache.js`: formats, migrations, merge, offline, backups, GDPR of minors' data |
| `seguridad-rgpd` | opus | security/privacy review: CSP, SRI, XSS, export injection, tokens, sign-out cache, minors' data (review-first) |
| `release-ci` | sonnet | full verification, small commits, milestone push, CI/Pages/Dependabot, service worker version |
| `documentacion` | sonnet | README, `docs/`, screenshots, keeping docs consistent with the code |

## Skills (`skills/`)

| Skill | Use it for | Support files |
|---|---|---|
| `nueva-funcionalidad` | the end-to-end recipe for a new feature | `dominio.js.tpl`, `servicio.js.tpl`, `vista.js.tpl`, `test-unit.test.js.tpl`, `test-integracion.test.js.tpl` |
| `nueva-hoja-datos` | new sheet/columns with compatible migration, merge, demo, xlsx, GDPR relations | - |
| `nuevo-idioma` | adding a UI language | - |
| `nuevo-escenario-cucumber` | English Gherkin scenarios + steps, tags, running one area | `feature.tpl`, `steps.js.tpl` |
| `nuevo-componente-ui` | a reusable component in the design system | - |
| `regenerar-capturas` | refreshing/adding screenshots in `docs/screenshots` | - |
| `preparar-release` | the pre-commit/pre-push checklist and CI watch | - |

The `*.tpl` files are templates (not executed): copy, replace `<module>`/`<Module>`/`<Hoja>`, and adapt.

## Example flow: "add a new feature" (injury log per swimmer)

1. **`arquitecto`** (optional, 5 min): confirms the layering (pure `js/domain/lesiones.js`, `js/application/lesionesService.js` with injected repository, `js/views/lesiones.js`) and flags any debt it would touch.
2. **`datos-drive`** with the `nueva-hoja-datos` skill: designs the `Lesiones` sheet (columns appended in `js/schema.js`, `RELACIONES` entry so it enters swimmer export/erasure, demo data, migration/round-trip tests). Commit: `feat(data): Lesiones sheet`.
3. **`desarrollador-funcionalidades`** with `nueva-funcionalidad`: domain + service + view + route/menu + `sw.js` `SHELL`/`VERSION`, with unit and integration tests, committing after each green step. In parallel, **`i18n`** writes `js/locales/lesiones.{es,en,it}.js` (disjoint files; the dev agent only wires the three imports into `js/i18n.js`).
4. **`qa-tests`** with `nuevo-escenario-cucumber`: `features/lesiones.feature` (+ `@smoke`) and steps; runs the area on desktop and mobile; diagnoses failures.
5. **`ux-a11y`**: reviews the view at 390x844 and 1366x850, light and dark, keyboard-only; fixes findings (new component via `nuevo-componente-ui` only if needed).
6. **`seguridad-rgpd`**: reviews personal-data handling (minors), exports and escaping.
7. **`documentacion`** with `regenerar-capturas`: `docs/ARCHITECTURE.md` section, README row, screenshot scenario and `npm run capturas -- --solo=lesiones`.
8. **`release-ci`** with `preparar-release`: full `check` + unit + integration + `test:e2e`, small commits with explicit paths, `git push`, watches CI and the public URL.

Parallelism guideline: steps 3 (dev + `i18n`), and later 5-7, can run concurrently as long as each agent owns different files; steps 2 -> 3 -> 4 -> 8 are sequential.

## Permissions (`settings.json`)

- **allow**: the npm scripts above, `node scripts/*`, `node --test`, `npx cucumber-js`, read-only `gh run`, and `git status/diff/log/show/add/commit` plus a plain `git push` / `git push origin main`.
- **ask**: `rm`, `git rm/checkout/restore/revert/merge/rebase`, `npm uninstall/update`.
- **deny**: `taskkill`, `pkill`, `killall`, `Stop-Process` (never kill `node` processes: e2e cleans up its own server), any force push, `git reset --hard`, `git clean`, `--no-verify`, recursive deletes aimed outside the repo (root, home, parent, drive roots), and reading `.env*`.

Edit this file (or add `settings.local.json`, which is personal and should not be committed) to adjust. If you add a new npm script that agents should run freely, add it to `allow`.
