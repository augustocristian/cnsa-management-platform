---
name: nueva-funcionalidad
description: Step-by-step recipe to add a complete feature to CNL Plataforma (pure domain, service with injected repository, view, i18n es/en/it, unit and integration tests, Cucumber feature, docs, screenshots and service worker) with templates. Use it when a new module, tab, screen, report or capability is requested, for example "add the injury log", "new goals view" or "I want to export X".
---

# New feature (the repo recipe)

Replace `<module>` (lower case, no accents: `lesiones`) and `<Module>` (`Lesiones`). Templates live in this folder (`*.tpl`): copy and adapt them, never paste blindly. Living reference of the pattern: `js/domain/temporada.js`, `js/application/temporadaService.js`, `js/views/temporada.js`, `tests/unit/temporadaService.test.js`, `tests/integration/temporada.test.js`, `features/temporada.feature`. Identifiers follow the project's Spanish domain vocabulary; comments, docs, test names, Gherkin and commits are in English; only the app's UI strings are Spanish/English/Italian.

**Golden rule:** small descriptive commits (one per step), push at every milestone, and never break the app: `npm run check` + `npm run test:unit` + `npm run test:integration` + the relevant e2e area before each commit; the full `npm run test:e2e` before each push. With parallel agents, disjoint file zones and `git add <paths>`.

## 0. Before writing

1. Define in 3-5 lines: user (coach), use case, data it stores, business rules, errors/warnings.
2. Decide layers with the `arquitecto` agent if in doubt. If there is new data, use the `nueva-hoja-datos` skill (and the `datos-drive` agent).
3. Read `docs/DESIGN.md` and find the most similar view.

## 1. Pure domain - `js/domain/<module>.js` (template `dominio.js.tpl`)

No DOM, network, storage, `i18n` or clock (dates by parameter). Export: constants, `normalizar<X>(row)`, `validar<X>(x, ctx)` -> `{ errores: [{codigo, params}], avisos: [...] }`, calculations. Messages are **codes**; the view translates them with `t()`. Commit: `feat(<module>): domain ...`.

## 2. Service - `js/application/<module>Service.js` (template `servicio.js.tpl`)

`crear<Module>Service(repo, { puedeEditar = () => true, ahora = () => new Date(), genId } = {})`. The repository (`list/get/upsert/remove`) is injected; errors block saving, warnings require `forzar`; without permission it throws `Error('sin-permiso')`. Commit: `feat(<module>): service ...`.

## 3. Data (only if there are new sheets or columns)

Skill `nueva-hoja-datos`: `js/schema.js`, normalisation, `RELACIONES`, demo, xlsx, merge, compatible migration, table in `docs/ARCHITECTURE.md`.

## 4. i18n - `js/locales/<module>.{es,en,it}.js`

Own key prefix (`les.`), parity of keys and `{variables}`. Import and merge into `DICTS` of `js/i18n.js`. Stored values neutral, in Spanish. Add the parity test (pattern of `tests/unit/temporada-i18n.test.js`). Delegate to the `i18n` agent if there are many texts. Commit: `feat(<module>): es/en/it texts`.

## 5. View - `js/views/<module>.js` (template `vista.js.tpl`)

`export async function render(container, params, ctx)`. It only presents: `h()` from `js/ui.js`, components from `docs/DESIGN.md` (`.page-head` with one `h1`, `sheet()`, `field()`/`formFields()`, `empty()` with a CTA, `toast.undo`, `badge`, icons from `js/icons.js`), no emojis, no hard-coded colours, no new `<style>` (if a component is missing use the `nuevo-componente-ui` skill). If it is a new tab:
- `MENU` in `js/app.js` (`['<module>', 'Label']`), the `nav.<module>` key in `js/locales/{es,en,it}.js` (the menu uses `tNav(route)`) and an icon named after the route in `js/icons.js` (SVG path with `currentColor`, like `cargas` or `marcas`).
- `MODULOS` in `features/support/world.js` (menu label -> route) and `VIEWS` in `tests/helpers/app.js` if applicable.
- If it is not a tab (sub-view/panel), call it from the parent view.

## 6. Tests (templates `test-unit.test.js.tpl`, `test-integracion.test.js.tpl`)

- Unit: domain and service with an in-memory repository; edge cases and `sin-permiso`; **never depending on today's date**.
- Integration: `fresh()` + `renderView('<module>', c.container, [], c)`; forms with `fieldByLabel`/`setValue`/`buttonByText`; empty state, inline error and saving.
- Run: `node --test tests/unit/<module>.test.js tests/unit/<module>Service.test.js tests/integration/<module>.test.js`, then `npm run test:unit && npm run test:integration`.

## 7. Cucumber feature

Skill `nuevo-escenario-cucumber` (templates in its folder). Minimum: one happy-path `@smoke` plus a validation/delete-with-undo flow. Run by area tag (a bare path runs ALL features): `npx cucumber-js --tags "@<module> and not @google and not @pendiente"` and the same with `VIEWPORT=movil` (`$env:VIEWPORT='movil'` in PowerShell) plus `and not @escritorio`.

## 8. Service worker

In `sw.js`: add to `SHELL` **all** new files (`./js/domain/<module>.js`, `./js/application/<module>Service.js`, `./js/views/<module>.js`, the 3 locales, CSS if any) and bump `VERSION` (`'vN'` -> `'vN+1'`). Outside `SHELL` it does not work offline. If the app needs a new folder at runtime, add it to the `cp` of the `build` job in `.github/workflows/pages.yml`.

## 9. Docs and screenshots

- `docs/ARCHITECTURE.md`: layers section for the module (what is pure, what is injected, decisions) and the sheets table.
- `README.md`: row in the feature table (agent `documentacion`).
- Screenshot: scenario in `ESCENARIOS` of `scripts/capturas.mjs` and `npm run capturas -- --solo=<id>` (skill `regenerar-capturas`).

## 10. Review and close

`ux-a11y` (contrast, focus, mobile, dark), `seguridad-rgpd` if there is personal data or exports, `arquitecto` if layers were touched. Then the `preparar-release` skill: `npm run check && npm run test:unit && npm run test:integration && npm run test:e2e`, commit and milestone push.

## Final checklist

- [ ] Domain free of DOM/network/storage/clock; service with injected repository
- [ ] Texts through `t()` in es/en/it, parity green
- [ ] One `h1`, visible labels, 44 px touch targets, no emojis or hard-coded colours
- [ ] New files in `SHELL` and `VERSION` bumped
- [ ] Unit + integration + feature tests (desktop and mobile)
- [ ] Docs and screenshot updated
- [ ] Small commits, `check` + tests green, milestone push
