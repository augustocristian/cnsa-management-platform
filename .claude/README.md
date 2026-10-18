# `.claude/` - agents, skills and permissions for CNL Plataforma

Project-level Claude Code configuration, specific to this repository (static ES-module PWA for swimming coaches; individual use: no sign-in or accounts, each person just connects Google Drive and their data lives in the `cnl` folder of their own Drive; demo mode exists only while no Google Client ID is set). Everything here is written in English; only the app's UI strings are Spanish/English/Italian, and sheet names, identifiers and stored values (`Nadadores`, `Entrenamientos`, `planificado`...) stay in Spanish exactly as in the code.

```
.claude/
  settings.json               project permissions (allow / ask / deny)
  agents/<name>.md            subagents (YAML frontmatter: name, description, tools, model)
  skills/<name>/SKILL.md      step-by-step procedures (+ *.tpl templates next to them)
```

## Golden rule (applies to every agent and skill)

Small, descriptive commits; push at every milestone; **never break the app** - `npm run verify` + `npm run test:unit` + `npm run test:integration` + the relevant e2e area (`npx cucumber-js --tags @area`) before each commit, the full `npm run test:e2e` before each push, then `gh run watch`. Agents running in parallel work on **disjoint file zones** (hot files: `sw.js`, `js/presentation/i18n/i18n.js`, `js/composicion/store.js`, `js/composicion/contexto.js`, `js/domain/schema.js`, `README.md`, `docs/ARCHITECTURE.md`, `package*.json`) and stage explicit paths, never `git add -A`.

## Verified commands

Full table with notes: `CLAUDE.md` section 3.

| Purpose                                                               | Command                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full static gate (run before every commit)                            | `npm run verify` = `npm run check` (syntax, generated `sw.js`, architecture) + `format:check` + `lint`; `npm run format` fixes formatting                         |
| Regenerate the service worker list                                    | `npm run build:sw`                                                                                                                                                |
| Unit (716 tests, ~7 s)                                                | `npm run test:unit` (one file: `node --test tests/unit/<file>.test.js`)                                                                                           |
| Integration (283 tests, ~30 s, jsdom)                                 | `npm run test:integration`                                                                                                                                        |
| E2E, desktop then mobile (339 / 332 scenarios; run in the background) | `npm run test:e2e`                                                                                                                                                |
| E2E, one area                                                         | `npx cucumber-js --tags @<area>` (+ `VIEWPORT=mobile`). **A `.feature` path runs ALL scenarios**, because `cucumber.js` merges its `paths`; use a tag or `--name` |
| CI parity (Node 22, UTC)                                              | `TZ=UTC npx -y node@22 --test tests/unit` (PowerShell: `$env:TZ='UTC'`)                                                                                           |
| Screenshots                                                           | `npm run capturas [-- --solo=id1,id2 --dispositivo=movil]`                                                                                                        |
| Local server                                                          | `npm run serve` (port 4173, or `node scripts/serve.mjs <port>`)                                                                                                   |
| CI                                                                    | `gh run list --limit 5`, `gh run watch <id>`, `gh run view <id> --log-failed`                                                                                     |

## Agents (`agents/`)

| Agent                           | Model  | Invoke it when...                                                                                                                                                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arquitecto`                    | opus   | deciding which layer code goes in, reviewing dependency rules/ports, adding the architecture test, planning a phased refactor                                                                           |
| `desarrollador-funcionalidades` | sonnet | implementing a whole feature end to end (domain -> service -> view -> i18n -> tests -> feature -> docs -> screenshots -> service worker)                                                                |
| `qa-tests`                      | sonnet | writing, running or diagnosing unit / integration / e2e tests; removing date-dependent or brittle tests                                                                                                 |
| `i18n`                          | sonnet | translating texts, key/variable parity, swimming terminology, neutral stored values, adding a language                                                                                                  |
| `ux-a11y`                       | sonnet | design system compliance, WCAG 2.2 AA, mobile-first, dark mode, Playwright visual review                                                                                                                |
| `datos-drive`                   | opus   | anything touching `schema.js`, `sheetdata.js`, the club store (`clubStore.js`/`clubSync.js`/`clubDatos.js`), `drive.js`, `cache.js`: formats, migrations, merge, offline, backups, GDPR of minors' data |
| `seguridad-rgpd`                | opus   | security/privacy review: CSP, SRI, XSS, export injection, tokens, sign-out cache, minors' data (review-first)                                                                                           |
| `release-ci`                    | sonnet | full verification, small commits, milestone push, CI/Pages/Dependabot, service worker version                                                                                                           |
| `documentacion`                 | sonnet | README, CLAUDE.md, `docs/`, screenshots, keeping docs consistent with the code                                                                                                                          |
| `revisor-codigo`                | opus   | read-only review of a diff/branch/PR against the checklist: layers, tests, i18n parity, a11y, security, docs                                                                                            |

## Skills (`skills/`)

| Skill                      | Use it for                                                                                           | Support files                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `nueva-funcionalidad`      | the end-to-end recipe for a new feature                                                              | `dominio.js.tpl`, `servicio.js.tpl`, `vista.js.tpl`, `test-unit.test.js.tpl`, `test-integracion.test.js.tpl` |
| `nueva-hoja-datos`         | new sheet/columns with compatible migration, merge, demo, xlsx, GDPR relations                       | -                                                                                                            |
| `nuevo-idioma`             | adding a UI language                                                                                 | -                                                                                                            |
| `nuevo-escenario-cucumber` | English Gherkin scenarios + steps, tags, running one area                                            | `feature.tpl`, `steps.js.tpl`                                                                                |
| `nuevo-componente-ui`      | a reusable component in the design system                                                            | -                                                                                                            |
| `regenerar-capturas`       | refreshing/adding screenshots in `docs/screenshots`                                                  | -                                                                                                            |
| `preparar-release`         | the pre-commit/pre-push checklist and CI watch                                                       | -                                                                                                            |
| `diagnosticar-ci`          | a red GitHub Actions run: `gh run view --log-failed`, Node 22 + `TZ=UTC` repro, known CI-only causes | -                                                                                                            |

The `*.tpl` files are templates (not executed): copy, replace `<module>`/`<Module>`/`<Hoja>`, and adapt.

## Example flow: "add a new feature" (injury log per swimmer)

1. **`arquitecto`** (optional, 5 min): confirms the layering (pure `js/domain/lesiones.js`, `js/application/lesionesService.js` with injected repository, `js/presentation/views/lesiones.js`) and flags any debt it would touch.
2. **`datos-drive`** with the `nueva-hoja-datos` skill: designs the `Lesiones` sheet (columns appended in `js/domain/schema.js`, `RELACIONES` entry so it enters swimmer export/erasure, demo data, migration/round-trip tests). Commit: `feat(data): Lesiones sheet`.
3. **`desarrollador-funcionalidades`** with `nueva-funcionalidad`: domain + service + view + route in `shell/navModel.js` + `npm run build:sw`, with unit and integration tests, committing after each green step. In parallel, **`i18n`** writes `js/presentation/i18n/locales/lesiones.{es,en,it}.js` (disjoint files; the dev agent only wires the three imports into `js/presentation/i18n/i18n.js`).
4. **`qa-tests`** with `nuevo-escenario-cucumber`: `features/lesiones.feature` (+ `@smoke`) and steps; runs the area on desktop and mobile; diagnoses failures.
5. **`ux-a11y`**: reviews the view at 390x844 and 1366x850, light and dark, keyboard-only; fixes findings (new component via `nuevo-componente-ui` only if needed).
6. **`seguridad-rgpd`**: reviews personal-data handling (minors), exports and escaping.
7. **`documentacion`** with `regenerar-capturas`: `docs/ARCHITECTURE.md` section, README row, screenshot scenario and `npm run capturas -- --solo=lesiones`.
8. **`revisor-codigo`**: read-only review of the whole diff against the checklist (layers, tests, i18n parity, a11y, security, docs) before committing.
9. **`release-ci`** with `preparar-release`: full `verify` + unit + integration + `test:e2e`, small commits with explicit paths, `git push`, watches CI (`gh run watch`) and the public URL. If CI is red: `diagnosticar-ci`.

Parallelism guideline: steps 3 (dev + `i18n`), and later 5-7, can run concurrently as long as each agent owns different files; steps 2 -> 3 -> 4 -> 9 are sequential.

## Permissions (`settings.json`)

- **allow**: `npm run verify|check|check:arch|format|format:check|lint|lint:fix|build:sw|test*|e2e:resumen|capturas|serve|vendor`, `npm ci|install`, `npm audit`, `node scripts/*`, `node --test`, `node --check`, `npx cucumber-js`, `npx prettier`, `npx eslint`, `npx -y node@22` (CI parity), read-only `gh run list|view|watch|download`, and `git status|diff|log|show|add|commit|push` (plain push and `push origin main` only).
- **ask**: `rm`, `git rm|checkout|restore|revert|merge|rebase`, `npm uninstall|update`.
- **deny**: `taskkill`, `pkill`, `killall`, `Stop-Process` (never kill `node` processes: e2e cleans up its own server), any force push, `git reset --hard`, `git clean`, `--no-verify`, recursive deletes aimed outside the repo (root, home, parent, drive roots), and reading `.env*`.

Edit this file (or add `settings.local.json`, which is personal and should not be committed) to adjust. If you add a new npm script that agents should run freely, add it to `allow`. The agents' own `tools:` lists in their frontmatter are minimal (the reviewer has no Edit/Write).
