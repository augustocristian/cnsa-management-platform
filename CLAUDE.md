# CLAUDE.md - CNL Plataforma

Operating manual for any Claude Code session working on this repository. Read it before changing anything. Human-facing docs: `README.md` and `docs/` (`ARCHITECTURE.md` = module contract and long reference, `DESIGN.md` = design system, `SETUP-GOOGLE.md` = Google Cloud setup). This file is the working contract.

Language policy: everything outside the app's UI strings (code comments, commit messages, docs, tests, Gherkin, this file) is **English**. UI strings live only in `js/presentation/i18n/locales/*` (es/en/it). Existing identifiers, file names, sheet names and stored values are **Spanish and must stay** (`Nadadores`, `Entrenamientos`, `'Pre-Benjamín'`, `planificado`, `crearTemporadaService`). Quoted UI texts inside Gherkin steps stay Spanish (the e2e app runs with `cnl:lang=es`).

---

## 1. Product model (non-negotiable)

CNL Plataforma is a static PWA (GitHub Pages, repo `augustocristian/cnsa-management-platform`) for swimming coaches: swimmers, groups, training sessions with set-by-set plans and PDF, attendance, loads, personal bests with a swimsuit catalogue, pool planning, season planning, categories by birth year, calendar (`.ics` + optional Google Calendar sync), communications, backup/restore. Club identity (name, motto, logo, colors) is configurable.

- **Individual use.** Each coach uses the app alone. **No sign-in, no accounts, no identity** (no name, e-mail or picture is requested, shown or stored). The person only _connects Google Drive_ (OAuth authorization, single scope `drive.file`; no `openid`/`email`/`profile`). Wording: "Connect Google Drive" / "Disconnect Drive", never "sign in/out", "login", "account".
- **Drive is the person's own persistence**, folder `cnl`, only so data survives and is on all their devices (laptop + phone). It is NOT a shared database: no sharing, roles, multi-user, `Usuarios` sheet, invite/join. If asked for collaboration features, push back citing this section.
- **Swimmers (`Nadadores`) are records the user owns**, never app users. One user may have several clubs (several files in `cnl/`), switched in Settings (route `club`).
- Concurrency is always the **same user on several devices/tabs**.
- No server, no database, no build step. No local-only storage mode: real data requires Drive (offline works from the local mirror once Drive was connected).
- **Demo mode exists ONLY while no Google Client ID is set** (neither `localStorage['cnl:clientId']` nor `BUILTIN_CLIENT_ID`, and Drive not already authorized: `demoDisponible()` in `application/modoService.js`). It is offered as "Try the demo" on the "Configuration needed" screen; with a Client ID the start screen has only "Connect Google Drive" (a demo left open is closed with a notice and wiped). Demo data come from `store.seedDemo`, live only in the browser (`localStorage` `cnl:demo:*`, flag `cnl:mode='demo'`, `store.mode === 'demo'`), never touch Drive, are labelled "Demo mode - data is not saved to Drive" (banner: "Set up Google Drive" / "Connect Google Drive" / "Exit demo"). Backups in Drive and Calendar sync are disabled in the demo. Connecting Drive from the demo starts an empty real club.

---

## 2. Stack and decisions

| Topic        | Decision                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Static files served as-is: plain JS ES modules, **no build, no bundler, no framework**. All paths **relative** (`./js/main.js`; Pages serves under `/cnsa-management-platform/`). Every import ends in `.js`.                                |
| Dependencies | npm; browser copies generated into `vendor/` by `scripts/vendor.mjs` (`postinstall`). `vendor/` **is committed**; CI fails if it differs from npm. SRI hashes in `vendor/integrity.json` applied by `js/infrastructure/vendorIntegridad.js`. |
| Excel / PDF  | SheetJS `@e965/xlsx` (global `XLSX`, lazy via `infrastructure/lazy.js`); `jspdf` + `jspdf-autotable` (injected by `infrastructure/pdfEntreno.js` on first PDF). Any new `vendor/` script must be loaded with SRI the same way.               |
| Google       | Identity Services token flow + Drive API v3, scope `drive.file` only (the app sees only files it created). Sheets API NOT used. Calendar (`calendar.events`) is an incremental scope requested only when the user turns on calendar sync.    |
| Client ID    | `BUILTIN_CLIENT_ID` in `js/infrastructure/config.js` (empty today; owner sets it once) or, for owner testing, `localStorage['cnl:clientId']`. Setup: `docs/SETUP-GOOGLE.md`.                                                                 |
| Charts       | Own SVG, no chart library.                                                                                                                                                                                                                   |
| Tests        | `node:test` + jsdom (unit, integration); Cucumber 13 + Playwright/Chromium (e2e). **Google is always simulated** (`infrastructure/fakeGoogle.js`).                                                                                           |
| Security     | Strict CSP `<meta>` in `index.html` (no inline scripts; `unsafe-inline` only for styles, known debt), SRI, all user text escaped via `h()`/`textContent` (never `innerHTML` with data). Review: `seguridad-rgpd`.                            |
| Node         | Dev on Node 24, **CI on Node 22**: code must run on both (see section 9 for parity).                                                                                                                                                         |

---

## 3. Commands (all verified)

Run from the repo root. `npm install` once (copies SheetJS/jsPDF to `vendor/`); first e2e run needs `npx playwright install chromium`.

| Purpose              | Command                                                                 | Notes                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Install              | `npm install` (CI: `npm ci`)                                            | `postinstall` runs `scripts/vendor.mjs`.                                                                                                                                                                                             |
| Serve                | `npm run serve` / `node scripts/serve.mjs <port>`                       | Port 4173 or `PORT`. Pick a free port; Drive connection needs the origin authorized in the OAuth client.                                                                                                                             |
| **Full gate**        | `npm run verify`                                                        | `check` + `format:check` + `lint`. Run before every commit (CI job "Static validation").                                                                                                                                             |
| Static checks        | `npm run check`                                                         | `node --check` of `js/**` and `sw.js`, `generate-sw.mjs --check` (stale precache list / missing imports or stylesheets) and the architecture check.                                                                                  |
| Architecture only    | `npm run check:arch`                                                    | `node scripts/check-arch.mjs --all` lists every violation ignoring the baseline; `--update-baseline` rewrites it (only to shrink).                                                                                                   |
| Format / lint        | `npm run format` / `format:check`; `npm run lint` / `lint:fix`          | Prettier (`.prettierrc.json`: single quotes, semicolons, 120 cols, LF; ignores `vendor/`, `sw.js`, screenshots, lockfile, `*.tpl`; `.feature` not formatted). ESLint flat config with size warnings; `--max-warnings=92` (ratchet).  |
| Service worker       | `npm run build:sw`                                                      | Regenerates the precache list and `VERSION` of `sw.js`. Run after adding/renaming/editing any file under `js/ css/ icons/ vendor/` or `index.html`; commit `sw.js`.                                                                  |
| Unit                 | `npm run test:unit`                                                     | `node --test tests/unit` (loader `tests/unit/index.js`): 716 tests, ~7 s.                                                                                                                                                            |
| Integration          | `npm run test:integration`                                              | jsdom + store + fake Google: 283 tests, ~30 s.                                                                                                                                                                                       |
| One test file        | `node --test tests/unit/temporada.test.js`                              | Same for `tests/integration/*.test.js`.                                                                                                                                                                                              |
| e2e all              | `npm run test:e2e`                                                      | `scripts/e2e.mjs`: Cucumber twice (`VIEWPORT=desktop`, then `mobile`); extra args forwarded to both. Desktop 339 scenarios, mobile 332. Many minutes: run in background.                                                             |
| e2e desktop / mobile | `npm run test:e2e:desktop` / `VIEWPORT=mobile npx cucumber-js`          | PowerShell: `$env:VIEWPORT='mobile'; npx cucumber-js`. Mobile excludes `@desktop`.                                                                                                                                                   |
| e2e one area         | `npx cucumber-js --tags @season` / `--name "part of name"`              | **A `.feature` path (even `file:12`) does NOT narrow the run: `cucumber.js` merges its `paths`, so it runs the whole suite.** Use a tag or `--name`. `--tags` replaces the profile's exclusions (`@google`, `@pending`, `@desktop`). |
| e2e dry run          | `npx cucumber-js --dry-run [--tags ...]`                                | Validates steps and counts scenarios without a browser. `@smoke` = 62 scenarios.                                                                                                                                                     |
| Everything           | `npm test`                                                              | unit + integration + e2e.                                                                                                                                                                                                            |
| Node 22 / UTC parity | `TZ=UTC npx -y node@22 --test tests/unit` (PowerShell: `$env:TZ='UTC'`) | Reproduces CI's runtime for CI-only failures. Also works for `tests/integration`.                                                                                                                                                    |
| E2E summary          | `npm run e2e:resumen`                                                   | Markdown table from `reports/*.xml` (used in the CI job summary).                                                                                                                                                                    |
| Screenshots          | `npm run capturas [-- --solo=id1,id2] [-- --dispositivo=movil]`         | Skill `regenerar-capturas`. Also `--concurrencia=N`, `--salida=dir`. Fixed clock Wed 14-Oct-2026 10:30 Madrid; rejects captures with console errors, 4xx/5xx, "Cargando" or tiny PNGs.                                               |
| Vendor / icons       | `npm run vendor` / `node scripts/iconos.mjs`                            | Re-copy `vendor/` + `integrity.json` (commit result) / regenerate `apple-touch-icon.png` and maskable icon.                                                                                                                          |

Reports go to `reports/` (git-ignored): `cucumber[-mobile].html|xml`, failure screenshots in `reports/screenshots/`.

---

## 4. Architecture: layers (enforced in CI)

```
js/main.js         entry point (index.html): starts the composition root
js/composicion/    COMPOSITION ROOT, the only modules that import everything: boot, store, preferencias, modo, backup, calendario, contexto
js/domain/         pure rules: no DOM, network, storage, timers, clock, randomness, console, i18n (ids/clocks/hashes are parameters)
js/application/    use-case services + club sync engine; domain + application + ports; concrete things arrive injected
js/application/ports/   JSDoc contracts only: ArchivoClubPort, CachePort, IdGenPort (+RelojPort), TimersPort, VentanaPort (+RedPort)
js/infrastructure/ adapters of the ports: Drive client/connection, demo storage, cache/IndexedDB, Excel, PDF, backup crypto, Calendar client, lazy vendor, fakeGoogle
js/presentation/   shell/, views/, ui.js, icons.js, router.js, styles.js, theme*.js, lang-switch.js, contexto.js, i18n/ (engine + locales/)
css/               tokens.css, app.css, components.css, views/<name>.css (CSS is not a code layer)
```

| Layer                    | May import                                   | Must NOT                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                 | `domain`                                     | anything else; DOM/window/localStorage/fetch/navigator/timers/`console`/`Date.now()`/`new Date()`/`Math.random()`/`crypto`                     |
| `application`            | `domain`, `application`, `application/ports` | `infrastructure`, `presentation`, same globals. Repo, clients, clock, timers, ids are **injected**: `crearXService(repo, {ahora, genId, ...})` |
| `application/ports`      | `domain`                                     | everything else (contracts only)                                                                                                               |
| `infrastructure`         | `domain`, `application` (ports), itself      | `presentation`, `composicion`                                                                                                                  |
| `presentation`           | `domain`, `application`, itself              | `infrastructure`, `composicion` (adapters reach views through `ctx`); locales imported only by `presentation/i18n/i18n.js`                     |
| `composicion`, `main.js` | everything                                   | -                                                                                                                                              |

Run-time wiring: `main.js` -> `composicion/boot.js` builds the adapters and the runtime object `rt` (`rt.ctxVista` = `serviciosDeVista()` of `composicion/contexto.js`: `prefs`, `CLAVES`, `config.setClientId`, `pdf`, `guardarPdfEnDrive`, `cargarDrive`, `servicioBackup()`, `servicioCalendario()`, `ahora`...) and runs the start flow in `presentation/shell/`. Every view gets `ctx = {store, auth, ui, ...rt.ctxVista}` and builds its services from it (`ahoraDe(ctx)`, `genIdDe(ctx)` in `presentation/contexto.js`). Tests build the same context with `serviciosDeVista` (`tests/helpers/app.js`).

### Where each kind of file goes

| Area                | domain                                                                                          | application                                                               | infrastructure                                                                                   | presentation                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Club data store     | `schema`, `sheetdata` (doc/merge/hash), `filas`, `sellos`, `catalogoClub`, `demo`, `validacion` | `clubStore`, `clubSync`, `clubDatos` (+ `clubService`), ports             | `drive`, `driveConnection`, `demoStorage`, `cache`, `xlsx`, `descargas`, `ids`, `lazy`, `config` | store singleton built in `composicion/store.js`                     |
| Calendar            | `calendario`                                                                                    | `calendarioService`                                                       | `googleCalendar`                                                                                 | `views/calendario*.js`, `suscripcion.js`                            |
| Pool planning       | `planificacion`                                                                                 | `planificacionService`                                                    | -                                                                                                | `views/planificacion*.js`                                           |
| Season planning     | `temporada` (barrel of `temporada-modelo` + `temporada-plan`)                                   | `temporadaService`                                                        | -                                                                                                | `views/temporada*.js`                                               |
| Training plan + PDF | `entreno`, `desglose`, `entrenamientos`                                                         | `entrenoService`, `entrenamientosService`, `etiquetasPdf`, `borradorPlan` | `pdfEntreno`, `driveEntrenos`                                                                    | `views/entreno-*.js`, `entrenamientos*.js`                          |
| Loads / contents    | `cargas`                                                                                        | `cargasService`                                                           | -                                                                                                | `views/cargas*.js`                                                  |
| Swimsuits / marks   | `banadores`, `marcas`, `tiempos`                                                                | `banadoresService`, `marcasService`                                       | -                                                                                                | `views/marcas*.js`, `banadores-catalogo.js`                         |
| Categories          | `categorias`                                                                                    | `categoriasService`                                                       | -                                                                                                | `views/categorias-panel.js`                                         |
| Swimmers/groups/... | `nadadores`, `grupos`, `asistencia`, `comunicaciones`, `inicio`, `avisos`                       | `*Service` of each, `inicioService`, `avisosService`                      | -                                                                                                | `views/<name>*.js`                                                  |
| Preferences         | `preferencias`                                                                                  | `preferenciasService`                                                     | -                                                                                                | instance in `composicion/preferencias.js`                           |
| Session / demo mode | `erroresGoogle`, `clienteGoogle`                                                                | `sesionService`, `modoService`, `asistenteClub`                           | `driveConnection`, `demoStorage`                                                                 | `shell/*`, `views/acceso.js`                                        |
| Backup              | `backup`                                                                                        | `backupService`                                                           | `backupCrypto`, `backupDrive`                                                                    | `views/backup-panel.js` (`composicion/backup.js`)                   |
| Look and language   | `tema`                                                                                          | -                                                                         | -                                                                                                | `ui`, `icons`, `theme*`, `i18n/`, `router`, `styles`, `lang-switch` |

### The architecture check (`scripts/check-arch.mjs`)

Part of `npm run check` (so of `verify` and CI) and asserted by `tests/unit/architecture.test.js` (which also tests every rule on synthetic trees). Rules: **R1** allowed imports per layer, **R2** no import cycles, **R3** no forbidden globals/impure calls in domain/application (a small scanner, `scripts/lib/scan.mjs`, ignores comments/strings/regexes), **R4** presentation never imports infrastructure, **R5** locales only from `presentation/i18n`, **R6** domain/application never import presentation, **R7** ports import only domain, **R8** only the composition root imports `composicion/**`/`main.js`, **R9** > 550 lines warns, > 800 fails (Prettier-formatted count), **R10** no `<style>` injection in views, **R11** views calling `store.upsert/remove` directly (warning), **R12** every relative import resolves and ends in `.js`.

Ratchet: `scripts/arch-baseline.json` (tolerated violations) is **empty**; a new violation fails and a stale baseline entry also fails. Never add to it: fix the dependency (inject it, move the file, expose it through `composicion/contexto.js`). **To extend:** add the rule in `check-arch.mjs` (`reglaDeImport()` for import rules, `analizar()` for the others), add a positive and a negative synthetic-tree test in `architecture.test.js`, document it here and in `docs/ARCHITECTURE.md`.

When moving/adding files: put code in the layer that matches its dependencies; update imports (checks fail otherwise), run `npm run build:sw`, fix tests/features that import by path, update this file and `docs/ARCHITECTURE.md`. Views never import adapters; services never create clocks or ids.

---

## 5. Data model

Source of truth is the user's Drive; localStorage is only a mirror. Full reference tables: `docs/ARCHITECTURE.md`.

### Drive layout (folder `cnl`, created by the app; with `drive.file` a hand-made `cnl` folder is invisible, the app creates and reuses its own)

| Path                    | Content                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cnl/<ClubName>.json`   | One file per club: `{ version, club: {key: value}, hojas: { <Sheet>: [rows] }, sync?: {...} }`; `appProperties.cnl='club'`; renamed with the club.                                                                                      |
| `cnl/preferencias.json` | `{ version, valores, marcas }`: `idioma`, `ultimoClub`, `clubes`, `tutorial`, `tema`, `calendario.*`, `calSync.<key>`... merged per key by timestamp; newer version never downgraded, unknown keys kept.                                |
| `cnl/entrenos/`         | Training-plan PDFs saved from the app.                                                                                                                                                                                                  |
| `cnl/backups/`          | `<club>-YYYYMMDD.json` rotating daily (last 14, before the first write of the day), `<club>-import-*.json` before an Excel import (5), `<club>-restore-*.json` before a restore (5). Best effort: a backup failure never blocks saving. |
| `cnl/<Club>.xlsx`       | Optional Excel copy.                                                                                                                                                                                                                    |

### Sheets (`SHEETS` in `js/domain/schema.js` = tabs of the Excel export; row 1 = exact headers; `id` = UUID v4 from the injected generator)

`Club` (key/value: `nombre`, `lema`, `logo`, colors, `zonaHoraria`, `temporadaActual`, `temporadaAplicada`, `categoriasConfig`), `Nadadores`, `Grupos`, `Entrenamientos`, `EntrenoLineas` (plan rows by `set`; `componentes`, `estilo` JSON), `Asistencia`, `Cargas` (`tipo` = content NAME), `TiposCarga` (content catalogue, predefined ids `tc-<key>`), `ObjetivosCarga` (LEGACY, migrated into `TiposCarga` on open), `Marcas` (`tiempoMs`, `piscina` 25|50, optional `banadorId`), `Comunicaciones`, `Banadores` (club swimsuit catalogue: `tipo` `entrenamiento`|`competicion`; `Marcas.banadorId` is a soft reference, no cascade), `Piscinas`, `AsignacionesCalle`, `Temporadas`, `Fases`, `SemanasPlan` (id `sp-<season>-<monday>`), `EventosTemporada`. The old per-swimmer `Banador` delivery sheet is retired (`HOJAS_RETIRADAS`): old files load, the sheet is dropped on the next write.

**Stored values are neutral Spanish** (`'Alevín'`, `planificado`, `presente`...); translation is display-only. Dates `YYYY-MM-DD`, times `HH:MM`, JSON columns are strings, booleans `'true'|'false'`.

### Backup format (`js/domain/backup.js`, UI in Settings > Backup)

One JSON file, a complete lossless copy: `{ format:'cnl-backup', formatVersion:1, appVersion, docVersion, createdAt, club:{name,data}, sheets:{every sheet incl. unknown}, extra:{top}, preferences:{user-level only, never tokens/calSync/ultimoClub}, counts, checksum:'sha256:...' }`. Optional envelope `cnl-backup-encrypted` (PBKDF2-SHA256 + AES-GCM; wrong passphrase = auth failure). Limits as Excel import (20 MB, 50,000 rows); future `formatVersion`/`docVersion` refused. Restore always saves a safety copy first (Drive `cnl/backups/`, memory in demo; failure = nothing restored), applies through `upsertMany`/`removeMany` (replace leaves tombstones) or `mergeData` (merge, current wins), skips invalid rows and GDPR-erased rows, never renames the club, then `store.migrar()` + category recalculation + preferences; never into a read-only club.

### Schema version, evolution, integrity

- `DOC_VERSION = 1` (`domain/sheetdata.js`). A **newer** file puts the store in read-only mode and unknown sheets/columns/keys are preserved in `extra` (lossless round trip).
- Changes are always backward compatible: append columns at the end, never rename/reorder/reuse; migrate on open (as `ensureCatalog`, categories recalculation). Skill `nueva-hoja-datos`, agent `datos-drive`.
- Damaged/emptied remote file = `problema`, nothing is written until the user resolves it (`store.resolverProblema`). Rows are validated by `domain/validacion.js` on `upsert` and import. Settings > "Data integrity" shows notices.
- **GDPR** (swimmers may be minors): `store.exportNadador(id)`, `store.purgarNadador(id)` (cascade + permanent tombstone, optionally deletes Drive copies/backups/revisions); disconnecting Drive revokes tokens and clears personal local data except unsynced club data (`cache.js` `CLAVES_LOCALES`); every new personal field must be reachable via `RELACIONES`/`datosNadador`.

### Sync, merge, concurrency (same user)

- Writes: debounce 1.5 s, "Sincronizar" button, `online` event; each write overwrites the file (PATCH `uploadType=media`). Remote change detection polls `drive.meta` (~30 s while visible, back-off to 5 min on errors).
- **Three-way, field-level merge** (`sheetdata.mergeData`) of base (last synced) / local / remote with **logical stamps** `n@device` (Lamport, no wall clock) and **tombstones**; same-field conflict: local wins; an edit beats a deletion except a GDPR purge. If Drive's integer `version` jumps by more than 1 between read and write, merge+write repeats (up to 5 rounds).
- Mirror: `localStorage['cnl:club:<id>']` (overflow to IndexedDB `cnl-cache`) with `dirty` + `base` = offline queue. `store.status`: `sincronizado|pendiente|error|offline`. Preferences mirror `cnl:prefs` with its own queue.

| Datum                                          | Truth                                                                   | Local mirror                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Club identity, all sheets                      | `cnl/<Club>.json`                                                       | `cnl:club:<id>`                                                           |
| Language, theme, last club, tutorial, calendar | `cnl/preferencias.json`                                                 | `cnl:prefs`, `cnl:lang` (sync boot), `cnl:tema` (read by `theme-boot.js`) |
| PDFs / Excel / backups                         | `cnl/entrenos/`, `cnl/<Club>.xlsx`, `cnl/backups/`                      | none                                                                      |
| Client ID                                      | `config.js` or `localStorage['cnl:clientId']`                           | -                                                                         |
| Drive connection                               | tokens in memory only; flag `cnl:drive-auth='1'` ("already authorized") | -                                                                         |
| Demo mode                                      | `cnl:mode='demo'`, `cnl:demo:*`, `cnl:demo:club:*`                      | erased on exit                                                            |
| Device-only                                    | `cnl:install-dismissed`, `cnl:test*` (test tooling)                     | -                                                                         |

localStorage is **never** the source of truth for configuration. `cnl:user` and `cnl:token` are legacy keys, only deleted.

---

## 6. Module and route map

Hash router (`presentation/router.js`), `#/<name>[/<param>]`. `presentation/shell/navModel.js` is the single nav model (sidebar groups People / Training / Club, mobile bottom bar `inicio, entrenamientos, asistencia, calendario` + "More", redirect `banador` -> `marcas`); each name loads `views/<name>.js` (`export async function render(container, params, ctx)`). Unknown routes go to `inicio`.

| Route              | View                                                                        | Purpose                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inicio`           | `inicio.js`, `primerospasos.js`                                             | Dashboard: shortcuts, weekly loads vs objectives, alerts, next session, today's attendance, notices; first-steps card                                               |
| `nadadores[/<id>]` | `nadadores*.js`                                                             | List, form with automatic category, profile (attendance, loads, bests), GDPR export/erase                                                                           |
| `grupos`           | `grupos.js`                                                                 | Groups and members                                                                                                                                                  |
| `entrenamientos`   | `entrenamientos*.js`, `entreno-editor*.js`, `entreno-acciones.js`           | Weekly sessions; set-based plan editor with totals, templates, content/style breakdown; PDF download/preview/print/save to Drive                                    |
| `asistencia`       | `asistencia*.js`                                                            | One-tap roll call, history, percentages                                                                                                                             |
| `calendario`       | `calendario*.js`                                                            | Month/Week/Agenda, filters, `.ics`, optional Google Calendar sync                                                                                                   |
| `planificacion`    | `planificacion.js` + `temporada*.js`, `planificacion-*.js`                  | Tab Season (`#/planificacion`: phases, weeks, planned vs actual, A/B/C events, chart) and tab Pool (`#/planificacion/piscina`: lanes, conflicts, suggestion, print) |
| `cargas`           | `cargas*.js`                                                                | Loads by content, RPE, weekly objectives with alerts, content catalogue manager                                                                                     |
| `marcas`           | `marcas*.js`, `banadores-catalogo.js`                                       | Times (mm:ss.cc), bests/evolution, suit column and filter by suit type, swimsuit catalogue dialog                                                                   |
| `comunicaciones`   | `comunicaciones.js`                                                         | Announcements ("Avisos y notas")                                                                                                                                    |
| `club`             | `club*.js`, `categorias-panel.js`, `datos-integridad.js`, `backup-panel.js` | Settings: identity, Drive locations, Excel, full Backup, preferences, category rules, data integrity, switch club                                                   |
| `tutorial`         | `tutorial.js`                                                               | Interactive Google setup guide                                                                                                                                      |
| (no route)         | `acceso.js`                                                                 | Start screen, "Configuration needed" (no Client ID: demo + owner setup), first-run wizard, club selector, Google error help                                         |

Start flow (`composicion/boot.js` + `shell/`): no Client ID -> "Configuration needed" (Try the demo first); Client ID and not connected -> start screen (Connect Google Drive only); Drive connected -> preferences + `drive.listClubs()` -> 0 clubs wizard / 1 or `ultimoClub` opens / several selector; demo -> demo club; then the shell (56 px header, settings/connection menu, sidebar on desktop, bottom bar on mobile, club theme). `infrastructure/entornoPruebas.js` decides whether fake Google may be activated.

---

## 7. i18n (es / en / it)

- Engine `presentation/i18n/i18n.js`: `t('key', {vars})` resolves current language -> `es` -> the key. Flat dotted keys, `{name}` interpolation. Helpers: `tCat`, `tEstado`, `tTipo`, `tContenido`, `tContenidoDesc`, `tNav`, `tDate`, `tNum`, `locale()`, `getLang`, `setLang`, `onLangChange`, `LANGS`, `INTL`. Switch control: `presentation/lang-switch.js`. Language stored in `preferencias.json` (`idioma`, `IDIOMAS` in `domain/preferencias.js`) mirrored in `cnl:lang`; first run follows the browser, else `es`.
- Locale files in `presentation/i18n/locales/`: base `es|en|it.js` plus per-area triplets `<area>.{es,en,it}.js`: `vistas-a|b|c`, `planificacion`, `calendario`, `entreno` (PDF texts), `cargas-tipos`, `acceso`, `categorias`, `temporada`, `datos`, `diseno`, `backup`, `banadores`, `inicio`, `tutorial`. All merged into `DICTS` at the top of `i18n.js`.
- Stored values stay neutral Spanish; translate on display (`cat.<normalized>`, `estado.<normalized>`, `tc.<key>.nombre|desc`); user-typed values (custom contents, notes) shown as typed. Content aliases (`AeL`, `Tope`) are never translated.
- Add a key: `es` first, then `en` and `it` with the **same `{variables}`**; no hard-coded UI string in views, services or PDFs. Parity tests: `tests/unit/i18n.test.js`, `temporada-i18n.test.js`, `personas-i18n.test.js`, `banadores-i18n.test.js`.
- New locale file for an area: create the three files, import and spread them into all three `DICTS` entries, add them to the parity test, run `npm run build:sw`.
- New language: skill `nuevo-idioma`. Terminology: Phase = macrocycle, Week = microcycle (es Fase/Semana, en Phase/Week, it Fase/Settimana).

---

## 8. Design system

Contract and markup: **`docs/DESIGN.md`** (read before touching UI). Files: `css/tokens.css`, `css/app.css`, `css/components.css` (load order tokens -> app -> components), per-view `css/views/<name>.css` loaded with `useStyles('<name>')` (`presentation/styles.js`), `presentation/ui.js` (markup helpers), `theme.js` + `theme-boot.js` (light/dark/auto, no flash), `domain/tema.js` (club color with guaranteed contrast), `icons.js`.

Rules: (1) one `<h1>` per view in `.page-head`; (2) **no `<style>` injected from views** (R10); (3) no hard-coded colors, use tokens (`--surface`, `--text`, `--c-accent`...; brand text via `--c-accent`/`--c-heading`, never `--c-primary`); (4) inline validation (`fieldError`, `formFields().validate()`), never `alert()`; (5) tables in `.table-wrap > .table`, `.table--cards` + `data-label` on mobile, numbers `class="num"`; (6) delete with `toast.undo` or `confirmDialog(..., {danger:true})`; (7) empty states with a call to action (`empty()`); (8) forms/dialogs in `sheet()` with visible labels; (9) state = color + icon/dot + text; (10) **no emojis anywhere** (UI, docs, commits), icons from `icons.js` (`icon('name')`, add a path to `ICONS`); (11) 44 px touch targets, text >= 12 px, visible focus, skip link, focus trap; (12) all text through `t()`.

Dark mode: `[data-theme="dark"]` forces it, `prefers-color-scheme: dark` applies unless `[data-theme="light"]`; `tokens.css` keeps both dark blocks identical (tested). Static tests: `diseno-estatico.test.js`, `ui-diseno.test.js`, `theme.test.js`, `tema.test.js`. Known debt: `components.css` block 11 (`!important` dark-mode bridge) and CSP `style-src 'unsafe-inline'`; check both before removing.

---

## 9. Testing

| Level       | Location                                                                 | Tool                                       | Covers                                                                        |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Unit        | `tests/unit/*.test.js` (716)                                             | `node --test` (+ jsdom for ui/store/drive) | domain, services, store, drive, sheetdata, i18n, design statics, architecture |
| Integration | `tests/integration/*.test.js` (283)                                      | `node --test` + jsdom + fake Google        | views + store together                                                        |
| E2E         | `features/*.feature` + `features/steps/*.steps.js` + `features/support/` | Cucumber 13 + Playwright Chromium          | journeys; desktop 339 / mobile 332 scenarios                                  |

`tests/unit/index.js` and `tests/integration/index.js` import every `*.test.js` of their folder: a new test file needs no registration.

**Simulated Google** (`js/infrastructure/fakeGoogle.js`): in-memory adapter with the same interfaces as `driveConnection` and `drive`. Activated only with `localStorage['cnl:test']='1'` on localhost/127.0.0.1/[::1] or `window.__CNL_TEST__` (`infrastructure/entornoPruebas.js`); dynamically imported so production never downloads it (excluded from `sw.js`). Options (`cnl:test:opts` JSON or `__CNL_TEST__`): `conectado` (alias `sesion`), `demo` (seeds `store.seedDemo` into a simulated-Drive club; NOT the product demo mode), `sinClientId`, `errorConexion` (alias `errorLogin`), `fallos`. State mirrored in `cnl:test:drive`; `window.__CNL_FAKE__` exposes `clubs()`, `prefs()`, `archivos()`, `editarClubExterno`, `desinstalar()`.

**Helpers.** `tests/helpers/env.js` (`setupEnv`, `importApp`, `tick`), `tests/helpers/app.js` (`boot`, `fresh({demo, club})`, `renderView`, `fieldByLabel`, `buttonByText`, `setValue`, `VIEWS`), `tests/helpers/pdf.js`. Cucumber: `features/support/world.js` (`CnlWorld`: `openApp`, `enterClub({demo})`, `goTo`, `eventually`, `expectVisible`, `fill`, `drive()`; `MODULES` maps UI module names to routes: add new modules), `hooks.js` (free port, static server, fresh context per scenario, failure screenshot, **fails a passing scenario on console errors or 4xx/5xx**), `cucumber.js` (profile; excludes `@google`, `@pending`, and `@desktop` on mobile; `retry: 2` only with `CI`).

**Writing a feature** (English Gherkin, `# language: en`, area tag on line 2, `@smoke` only on essential scenarios, `@desktop`/`@mobile` when layout differs): reuse steps from `comunes.steps.js`, `conexion.steps.js`, `navegacion.steps.js` before writing new ones (step definitions are global; duplicates fail with "Multiple step definitions"). Starting states: `Given a club with demo data`, `Given an empty club with Drive connected`, `Given the app has just been opened without a session` (or `without Drive connected`), `Given the app is open without a Google Client ID`. Tags in use: `@smoke`, `@home @swimmers @attendance @loads @times @club @communications @season @planning @calendar @categories @swimsuits @training @training-pdf @training-contents @training-demo @trainings @backup @data-integrity @single-user @demo @access @tutorial @pwa @navigation @theme @design @accessibility @toasts @sheet`, plus `@desktop`/`@mobile`. Skill `nuevo-escenario-cucumber`.

**Rules**

- **Never depend on the current date or timezone.** Pure code receives dates; services receive `ahora`; tests use fixed dates or dates relative to a fixed clock; e2e derive dates from the page. A test that would fail "next September" (season change) is wrong. CI runs with `TZ=UTC` on Node 22: reproduce with `TZ=UTC npx -y node@22 --test tests/unit`.
- **Timers and `unref`** (a classic CI-only failure): background timers (debounce, polling, watchdogs) are scheduled through `TimersPort.programar(fn, ms, {unref})` and are `unref`'d by default so they never keep Node alive; a timer that a caller **awaits** (deadlines such as the one in `clubStore.js`) must pass `{ unref: false }`, otherwise Node ends the event loop while the promise is pending and the test is cancelled. Never leave a ref'd `setTimeout`/`setInterval` running in code under test (the runner hangs). Inject timers and fake them. No fixed sleeps: `eventually`/Playwright auto-wait/`tick()`.
- Test at the lowest level that can show the behaviour: domain/services -> unit with in-memory repos; views -> integration; journeys -> e2e.
- Never weaken or delete a test to get green; fix the cause. Never call real Google.

---

## 10. CI/CD, deployment, dependencies

Workflow `.github/workflows/pages.yml` ("CI and deployment to GitHub Pages"; push to `main`, PRs, manual; concurrency cancels superseded runs; Node 22; `npm ci`). Pages source must be **Settings > Pages > Source: GitHub Actions**.

| Job (name in Actions)             | Needs             | What                                                                                                                         |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `validate` (Static validation)    | -                 | `npm run verify`, `npm run check:arch`, `npm audit --omit=dev --audit-level=high`, `git diff --exit-code -- vendor/`         |
| `unit` (Unit tests)               | validate          | `npm run test:unit`                                                                                                          |
| `integration` (Integration tests) | validate          | `npm run test:integration`                                                                                                   |
| `e2e` (End-to-end tests)          | unit, integration | Chromium install, `npm run test:e2e` (`CI=true`, 2 retries), job summary via `resumen-e2e.mjs`, uploads `reports/` (14 days) |
| `build` (Build site)              | e2e               | copies `index.html manifest.webmanifest sw.js css js icons vendor` to `_site/`, uploads the Pages artifact                   |
| `deploy` (Deploy to GitHub Pages) | build             | only `main`, not PRs                                                                                                         |
| `smoke` (Post-deployment check)   | deploy            | polls the public URL for HTTP 200                                                                                            |

A new top-level runtime folder/file must be added to the `cp -r` list in `build` or it is not deployed (`docs/ features/ tests/ scripts/` are not). Watch a run: `gh run list --limit 5`, `gh run watch <id>`, `gh run view <id> --log-failed` (skill `diagnosticar-ci`).

Dependabot (`.github/dependabot.yml`): weekly, `npm` (groups `lint-format` = prettier/eslint/@eslint/*/globals and `npm-minor-patch`) and `github-actions`. When a PR touches `jspdf`, `jspdf-autotable` or `@e965/xlsx`: `npm install` so `vendor/` + `integrity.json` are regenerated and committed, run everything, `npm run build:sw`. After a lint/format bump run `npm run format` and `npm run lint`. Production deps: `@e965/xlsx`, `jspdf`, `jspdf-autotable`.

PWA: `sw.js` is stale-while-revalidate for HTML/JS/CSS, cache-first for `vendor/` and `icons/` (same-origin GET only; Google is never intercepted); precache list and `VERSION` (content hash, CRLF-safe) are GENERATED by `npm run build:sw`; a new worker waits until the user clicks "Reload". Only `fakeGoogle.js` is excluded.

---

## 11. Workflow and commit policy

- **Never break the app.** Before every commit: `npm run verify` + `npm run test:unit` + `npm run test:integration` + the relevant e2e area (`--tags @area`, plus `VIEWPORT=mobile` for UI changes). Before a milestone push: full `npm run test:e2e`. `npm run format` fixes formatting. No new lint warnings (the `--max-warnings` number may only go down), no `eslint-disable` without a reason. If a failure is not yours, say so; do not hide it.
- **Small, descriptive commits**: one logical change, prefixes `feat:` `fix:` `refactor:` `test:` `docs:` `ci:` `chore:` (match `git log`), body explains the why. **Push at each milestone**, then watch CI with `gh run watch`; a red `main` is top priority (fix forward in a small commit or `git revert`; never rewrite published history).
- Commit footer when Claude commits: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR descriptions end with the Claude Code generated-with line.
- **No temporary files in commits**: scratch scripts, example PDFs, `reports/`, `test-results/`, `playwright-report/`, `node_modules/`. Scratch work goes in the session scratchpad. Check `git status`; stage by name, not `git add -A`.
- **Never `taskkill /IM node.exe`** (kills editors and other agents' servers); stop only the PID you started. Use free ports for servers.
- **Parallel agents work on disjoint file zones** (by layer/area: domain+service of an area, its view, locales, tests/features, docs, `sw.js`). Collision-prone files: `sw.js`, `i18n/i18n.js` `DICTS`, `i18n/locales/*`, `domain/schema.js`, `composicion/store.js`, `composicion/contexto.js`, `features/support/world.js`, `tests/helpers/app.js`, `README.md`, `docs/ARCHITECTURE.md`, `package*.json`: one agent at a time.
- No destructive git (`reset --hard`, `push --force`, `checkout --`, `clean`) unless asked. Permissions live in `.claude/settings.json`.
- Windows: the shell is PowerShell and Git Bash. No `&&` in Windows PowerShell 5.1; env vars via `$env:VIEWPORT='mobile'`; forward slashes in paths. Working-tree files are CRLF (autocrlf; the repo stores LF): keep the line endings of a file you edit; commit `vendor/` exactly as `npm run vendor` produced it.

---

## 12. How to add things

**A feature** (skill `nueva-funcionalidad`, agent `desarrollador-funcionalidades`): (1) domain `js/domain/<area>.js`, pure, unit tests first; (2) service `js/application/<area>Service.js`: `crear<Area>Service(repo, {ahora, genId})`, unit tests with an in-memory repo; (3) data if it persists (below); (4) view `js/presentation/views/<name>.js` (`h()`, `ui.js`, design components, `useStyles`, `repintarAlCambiar` from `suscripcion.js`); (5) route: add the name to a group of `shell/navModel.js` (top-level modules only), `nav.<name>` in locales, icon in `icons.js`, module in `MODULES` of `features/support/world.js`, view in `VIEWS` of `tests/helpers/app.js`; (6) i18n es/en/it; (7) integration test (`fresh()` + `renderView()`); (8) Cucumber feature + steps with `@smoke`, mobile must pass; (9) docs: README feature table, `docs/ARCHITECTURE.md`, this file's maps; (10) screenshot scenario in `scripts/capturas.mjs`; (11) `npm run build:sw`; (12) `verify` + tests, small commits.

**A data sheet or column** (skill `nueva-hoja-datos`, agent `datos-drive`): add to `SHEETS` in `domain/schema.js`; validation in `domain/validacion.js`; text columns in `COLS_TEXTO` (`domain/sheetdata.js`; `*Id` columns already text); relations in `RELACIONES` (cascade/orphans/GDPR); migration on open if needed (follow `ensureCatalog`; `DOC_VERSION` bump only for incompatible format changes); demo data in `domain/demo.js`/`seedDemo`; check Excel round trip and backup tests; tests `schema`, `store`, `integridad-*`; update section 5 and `docs/ARCHITECTURE.md`.

**A language** (skill `nuevo-idioma`, agent `i18n`): `LANGS`, `INTL`, `IDIOMAS`, one `<area>.<lang>.js` per area incl. `entreno` (PDF) and `calendario`, `DICTS` branch, parity tests, `npm run build:sw`.

**A training content**: add to `CATALOGO_PREDEFINIDO` (`domain/cargas.js`, stable id `tc-<key>`, never rename/delete), `tc.<key>.nombre|desc` in `cargas-tipos.{es,en,it}.js`, alias for the exercise parser; run `cargas*.test.js`, `desglose.test.js`. Existing clubs get it via `ensureCatalog`.

**A sub-screen/tab**: model in domain/service, separate view module imported by the parent (as `temporada.js` in `planificacion.js`), unique `<h1>`, integration + e2e, screenshot, docs.

**A UI component** (skill `nuevo-componente-ui`, agent `ux-a11y`): helper in `ui.js` if it builds DOM, CSS in `components.css` with tokens only (light, dark, 44 px, focus), markup + rules in `docs/DESIGN.md`, test in `diseno-estatico`/`ui-diseno`, then use it.

---

## 13. Subagents and skills (`.claude/`, index in `.claude/README.md`)

| Agent                           | Use it when                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `arquitecto`                    | Which layer something belongs to; dependency/port review; extending `check-arch.mjs`; phased refactors / splitting files > 800 lines |
| `desarrollador-funcionalidades` | A whole feature end to end (domain -> service -> view -> i18n -> tests -> feature -> docs -> SW)                                     |
| `qa-tests`                      | Writing/diagnosing unit, integration, Cucumber tests; flaky or date-dependent tests; mobile-only failures                            |
| `i18n`                          | Translating strings, key parity, terminology, hard-coded Spanish, new language                                                       |
| `ux-a11y`                       | Design system, WCAG 2.2 AA, mobile layout, dark mode                                                                                 |
| `datos-drive`                   | Schema/sheets, `sheetdata`, store, drive, cache: migrations, merge/concurrency, offline queue, backups, integrity                    |
| `seguridad-rgpd`                | CSP, SRI, XSS/export injection, tokens, OAuth scopes, minors' data, what stays after disconnecting                                   |
| `release-ci`                    | Verify -> commits -> push -> watch CI; red CI; Pages; Dependabot; service worker staleness                                           |
| `documentacion`                 | README, CLAUDE.md, `docs/*`, screenshots aligned with the code                                                                       |
| `revisor-codigo`                | Read-only review of a diff/branch/PR against the checklist: layers, tests, i18n parity, a11y, security, docs                         |

| Skill                      | Use it when                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `nueva-funcionalidad`      | Adding a module/screen/report end to end (templates for domain, service, view, tests)               |
| `nueva-hoja-datos`         | A feature needs a new sheet or column without breaking existing files                               |
| `nuevo-idioma`             | Adding a language or auditing completeness                                                          |
| `nuevo-escenario-cucumber` | Adding/fixing Cucumber scenarios and steps (templates)                                              |
| `nuevo-componente-ui`      | Adding a design-system component                                                                    |
| `regenerar-capturas`       | Regenerating `docs/screenshots` / adding a screenshot scenario                                      |
| `preparar-release`         | Pre-commit/pre-push checklist, push, CI watch, post-deploy                                          |
| `diagnosticar-ci`          | A GitHub Actions run is red: fetch the log, reproduce with Node 22 + `TZ=UTC`, known CI-only causes |

---

## 14. Known limitations, traps, roadmap

- **Never tested against real Google.** All automated tests use the fake. The real flow (consent screen, `drive.file` behavior, 7-day token expiry in "Testing" mode, Calendar sync) is unverified; `BUILTIN_CLIENT_ID` is empty in the repo.
- **Lint baseline**: 92 ESLint warnings (cap in `package.json`), mostly complexity / function / file length. **Files over the size limit** (R9 warns > 550 lines, current offenders: `domain/calendario`, `cargas`, `desglose`, `entreno`, `planificacion`, `temporada-modelo`, `temporada-plan`, `application/clubStore`, `presentation/ui`, `views/backup-panel`, `views/temporada-secciones`). Splitting them needs phased refactors (`arquitecto`); none is above the 800-line failure threshold.
- **`sw.js` is generated.** Stale list/`VERSION` fails `npm run check` and CI with a readable report; a required file that fails to precache aborts the worker install; `vendor/*` are optional.
- **Drive scope**: with `drive.file` the app cannot see files it did not create; do not assume listing the whole Drive or reusing a hand-made `cnl` folder.
- **Dates**: the season changes on 1 September and the category table shifts with it; the demo data are clock-relative.
- **Ports**: never hard-code a test port; kill only your own PID.
- **CSP/CSS debt**: `style-src 'unsafe-inline'` and `components.css` block 11. The CSP comment in `index.html` still says "sign-in" / "views inject `<style>`" (stale wording; editing `index.html` changes the SW `VERSION`, run `npm run build:sw`).
- `.claude/skills/*/*.tpl` templates are illustrative and not formatted by Prettier; copy and adapt.

### Roadmap

| Item                                                                                                                                                                                            | Status                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Layered architecture + architecture check + Prettier/ESLint + `verify` gate in CI                                                                                                               | Done (baseline empty; lint warning cap only shrinks) |
| UX batches: shell/header and menu polish, decide whether the footer repeats on every screen (tests look for `footer.footer`), migrate remaining legacy styles to components and delete block 11 | In progress                                          |
| README rewritten for the individual-use model with screenshots wired to `docs/screenshots/*`                                                                                                    | In progress (separate agent)                         |
| Split the files over the R9 soft limit; lower the ESLint warning cap                                                                                                                            | Pending                                              |
| Test the full flow with a real Google account in production; set `BUILTIN_CLIENT_ID`                                                                                                            | Pending                                              |
