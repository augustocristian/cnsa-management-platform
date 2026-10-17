# CLAUDE.md - CNL Plataforma

Operating manual for any Claude Code session working on this repository. Read it fully before changing anything. Project documentation for humans lives in `README.md` and `docs/`; this file is the working contract.

Language policy: everything outside the app's UI strings (code comments in new code, commit messages, docs, this file) is written in **English**. UI strings live only in `js/presentation/i18n/locales/*` (es/en/it). Existing identifiers, file names, sheet names and stored data values are Spanish and **must stay as they are** (for example `Nadadores`, `Entrenamientos`, `'Pre-Benjamín'`, `planificado`). Do not rename them to English; explain them in English where useful. Tests (names, comments, messages) and the Gherkin features (steps, tags, helpers) are English too; only the quoted UI texts inside steps stay Spanish.

---

## 1. What this is and the product model

CNL Plataforma is a static PWA (GitHub Pages, repo `augustocristian/cnsa-management-platform`) for managing a swimming club: swimmers, groups, training sessions with detailed set-by-set plans and PDF export, attendance, training loads, personal bests, pool planning, season planning, calendar, a swimsuit catalogue (training suits and competition fast skins) linked to personal bests, communications. Originally built for Club Natacion Lugones; club identity (name, motto, logo, colors) is configurable.

### Product model (non-negotiable)

- **Each coach uses the app individually.** There is **no sign-in, no user identity** (no name, e-mail or picture is requested, shown or stored): the person just _connects Google Drive_ (OAuth authorization with the single scope `drive.file`, no `openid`/`email`/`profile`). Their data is stored in THEIR OWN Google Drive (folder `cnl`) **only so that it persists and is available on all their devices** (computer and phone).
- **Drive is NOT a shared database between users.** There is no sharing, no roles, no multi-user, no `Usuarios` sheet, no "join with a link", no "My space" view, no admin/coach/swimmer distinction. There is no `role` and no `user`.
- **"Nadadores" (swimmers) are records owned by the user, not app users.** They are never app users.
- One user may have **several clubs** (several files in `cnl/`) and switches between them in Settings (`Configuracion`, route `club`). That is still one person's data.
- Multi-device concurrency exists, but it is always the **same user on several devices/tabs** (phone + laptop), never several people.
- No server, no database, no build step, no local/offline-only _storage_ mode: connecting Google Drive is the only way to keep real data (offline use works from the local mirror cache once Drive was connected). The only exception is the **demo mode**, available ONLY while no Google Client ID is set (neither `localStorage['cnl:clientId']` nor `BUILTIN_CLIENT_ID`; rule in `demoDisponible()` of `application/modoService.js`), offered as "Try the demo" on the "Configuration needed" screen (with a Client ID the start screen has only "Connect Google Drive"; a demo left open is closed with a notice and wiped when an ID appears): sample data from `store.seedDemo` kept only in the browser (`localStorage` namespace `cnl:demo:*`, flag `cnl:mode='demo'`, `store.mode === 'demo'`), labelled "Demo mode - data is not saved to Drive" (banner actions: "Set up Google Drive" while there is no Client ID, "Connect Google Drive" after it, "Exit demo"), never touching Drive and never mixed with real data; exiting wipes it and connecting Drive from the demo starts an empty real club. Backups in Drive and Google Calendar sync are disabled in the demo. Wording rule: "Connect Google Drive" / "Disconnect Drive", never "sign in/out", "login" or "account".
- Do not add features or wording that imply collaboration (invite, share, permissions, roles). If asked, push back and cite this section.

---

## 2. Stack and decisions

| Topic        | Decision                                                                                                                                                                                                                                                                              | Why                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Runtime      | Static files served as-is. **No build, no bundler, no framework.** Plain JavaScript ES modules in the browser. All paths in code are **relative** (`./js/main.js`).                                                                                                                   | GitHub Pages serves under `/cnsa-management-platform/`.                                                  |
| Dependencies | npm packages in `package.json`; browser copies are generated into `vendor/` by `scripts/vendor.mjs` (runs on `npm install` via `postinstall`). `vendor/` **is committed**; CI fails if it is out of sync with npm.                                                                    | No build step, but dependencies stay managed and Dependabot-updatable.                                   |
| Excel        | SheetJS (`@e965/xlsx` -> `vendor/xlsx.full.min.js`, global `XLSX`), lazy-loaded by `js/infrastructure/lazy.js` only when exporting/importing Excel.                                                                                                                                   | Backup/exchange format; ~900 KB.                                                                         |
| PDF          | `jspdf` + `jspdf-autotable` -> `vendor/jspdf*.js`, injected by `js/infrastructure/pdfEntreno.js` the first time a PDF is requested.                                                                                                                                                   | Training plan PDF (A4 landscape).                                                                        |
| Integrity    | `vendor/integrity.json` holds sha384 SRI hashes (generated by `scripts/vendor.mjs`); `js/infrastructure/vendorIntegridad.js` applies them. Any new `vendor/` script must be loaded the same way.                                                                                      | Supply-chain protection.                                                                                 |
| Auth/storage | Google Identity Services (token flow) + Drive API v3 with the single scope `drive.file` (no `openid`/`email`/`profile`). Google Sheets API is **not** used. Google Calendar (`calendar.events`) is an optional incremental scope requested only when the user turns on calendar sync. | `drive.file` is non-sensitive: the app only sees files it created itself; no Google verification needed. |
| Client ID    | `BUILTIN_CLIENT_ID` in `js/infrastructure/config.js` (owner sets it once; empty today) or, for owner testing, `localStorage['cnl:clientId']`. Cannot live in Drive (needed before connecting).                                                                                        | Setup guide: `docs/SETUP-GOOGLE.md`.                                                                     |
| Charts       | Own SVG, no chart libraries.                                                                                                                                                                                                                                                          | Size and control.                                                                                        |
| Tests        | `node:test` + jsdom (unit, integration); Cucumber + Playwright/Chromium (e2e). **Google is simulated** (`js/infrastructure/fakeGoogle.js`).                                                                                                                                           | No real Google calls in tests.                                                                           |
| Security     | Strict CSP `<meta>` in `index.html` (no inline scripts; `unsafe-inline` only for styles, pending view migration), SRI on vendor scripts, all user text escaped via `h()`/`textContent` (never `innerHTML` with data).                                                                 | See `docs/DESIGN.md` > Security.                                                                         |

Node: development was done on Node 24; CI uses Node 22. Keep code compatible with both.

---

## 3. Commands

Always run from the repo root. Install once with `npm install` (also copies SheetJS/jsPDF to `vendor/` and regenerates `vendor/integrity.json`). First e2e run needs `npx playwright install chromium`.

| Purpose                       | Command                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Install                       | `npm install`                                                                                                | CI uses `npm ci`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Serve                         | `npm run serve` (optionally `node scripts/serve.mjs 8080`)                                                   | Static server, default port 4173 (or `PORT`). Connecting Drive needs the origin authorized in the OAuth client (`http://localhost:<port>`).                                                                                                                                                                                                                                                                              |
| Static checks                 | `npm run check` (architecture alone: `npm run check:arch`)                                                   | `node --check` on every `js/**/*.js` and `sw.js`, the generated service worker list (`generate-sw.mjs --check`) and the architecture rules (`scripts/check-arch.mjs`, baseline `scripts/arch-baseline.json`, currently empty). Fast. The CI "Static validation" job runs it. `node scripts/check-arch.mjs --all` lists every violation ignoring the baseline.                                                            |
| Unit tests                    | `npm run test:unit`                                                                                          | `node --test tests/unit` (loader `tests/unit/index.js`). ~15 s, 450 tests at the last run.                                                                                                                                                                                                                                                                                                                               |
| Integration tests             | `npm run test:integration`                                                                                   | jsdom, views + store + fake Google. ~45 s.                                                                                                                                                                                                                                                                                                                                                                               |
| All e2e (desktop then mobile) | `npm run test:e2e`                                                                                           | `scripts/e2e.mjs`: runs Cucumber twice (`VIEWPORT=desktop`, then `VIEWPORT=mobile`). Extra args are forwarded to both runs, e.g. `npm run test:e2e -- --tags @smoke`. Several minutes.                                                                                                                                                                                                                                   |
| e2e desktop only              | `npm run test:e2e:desktop` (= `cucumber-js`)                                                                 |                                                                                                                                                                                                                                                                                                                                                                                                                          |
| e2e mobile only (Pixel 5)     | PowerShell: `$env:VIEWPORT='mobile'; npx cucumber-js` / bash: `VIEWPORT=mobile npx cucumber-js`              | Mobile excludes `@desktop` scenarios.                                                                                                                                                                                                                                                                                                                                                                                    |
| By tag                        | `npx cucumber-js --tags @smoke` / `--tags "@season and not @smoke"`                                          | Tags in use: `@smoke` (essential scenarios, ~48), one tag per area (`@season`, `@categories`, `@planning`, `@training`, `@training-pdf`, `@calendar`, `@loads`...), `@desktop`, `@mobile`, `@accessibility`, `@theme`. `@google` and `@pending` are always excluded (need a real Google account).                                                                                                                        |
| One feature / scenario        | `npx cucumber-js features/temporada.feature` / `features/temporada.feature:12` / `--name "part of the name"` | `--dry-run` lists/validates steps without running (339 scenarios in the desktop profile).                                                                                                                                                                                                                                                                                                                                |
| Single unit/integration file  | `node --test tests/unit/temporada.test.js`                                                                   | Same for `tests/integration/*.test.js`.                                                                                                                                                                                                                                                                                                                                                                                  |
| Everything                    | `npm test`                                                                                                   | unit + integration + e2e.                                                                                                                                                                                                                                                                                                                                                                                                |
| E2E summary                   | `npm run e2e:resumen`                                                                                        | Markdown table from `reports/*.xml` (used by CI in the job summary).                                                                                                                                                                                                                                                                                                                                                     |
| Screenshots                   | `npm run capturas`                                                                                           | See below.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Vendor                        | `npm run vendor`                                                                                             | Re-copies from `node_modules` and rewrites `vendor/integrity.json`. Commit the result.                                                                                                                                                                                                                                                                                                                                   |
| Icons                         | `node scripts/iconos.mjs`                                                                                    | Regenerates `icons/apple-touch-icon.png` and `icons/icon-maskable-512.png` (no dependencies).                                                                                                                                                                                                                                                                                                                            |
| Format                        | `npm run format` (write) / `npm run format:check`                                                            | Prettier (`.prettierrc.json`: single quotes, semicolons, trailing commas, 120 columns, LF). `.prettierignore` skips `vendor/`, `sw.js` (its generated block is produced by `generate-sw.mjs`), screenshots, lockfile and `*.tpl`. `.feature` files are not formatted by Prettier.                                                                                                                                        |
| Lint                          | `npm run lint` (autofix: `npm run lint:fix`)                                                                 | ESLint flat config (`eslint.config.js`): recommended rules plus unused vars, `eqeqeq`, `prefer-const`, `no-var`, `no-shadow`, `no-duplicate-imports`, and size warnings (complexity 20, depth 5, 120 lines per function, 450 lines per file; not applied to tests). Errors fail; warnings are capped by `--max-warnings=92` in `package.json`, a ratchet that may only go down (lower the number when you fix warnings). |
| Full gate                     | `npm run verify`                                                                                             | `check` + `format:check` + `lint`. Run it before every commit; the CI "Static validation" job runs it.                                                                                                                                                                                                                                                                                                                   |

Reports go to `reports/` (git-ignored): `cucumber.html|xml`, `cucumber-mobile.html|xml`, failure screenshots in `reports/screenshots/`.

### Screenshots (`npm run capturas`)

`scripts/capturas.mjs` generates the real screenshots used by the README into `docs/screenshots/<device>-<id>.png` (`escritorio` 1366x850 and `movil` 390x844 @2x). It starts `scripts/serve.mjs` on a free port, drives Chromium with the fake Google and demo data, a fixed clock (Wednesday 14-Oct-2026 10:30 Europe/Madrid), Spanish unless the scenario says otherwise, reduced motion and no service worker. A capture is rejected (not written) on console errors, 4xx/5xx responses, a view stuck on "Cargando", or a tiny PNG; the process exits 1 if any fails (one retry each).

```bash
npm run capturas                                      # all, both devices
npm run capturas -- --solo=inicio,asistencia          # only some scenario ids
npm run capturas -- --dispositivo=movil               # only escritorio or movil
npm run capturas -- --concurrencia=2                  # parallel pages (default 4)
npm run capturas -- --salida=some/other/dir           # default docs/screenshots
```

To add a screenshot: add an entry to the `ESCENARIOS` array in `scripts/capturas.mjs` (`id`, `titulo`, `opciones` of the fake Google, `ruta`, optional `paso(p)` for UI actions, optional `captura` to override), run it with `--solo=<id>`, check the PNG visually (keep each under ~250 KB), then reference `docs/screenshots/<device>-<id>.png` from `README.md` with a caption. Regenerate screenshots after any visible UI change. Verified: `npm run capturas -- --solo=acceso --dispositivo=escritorio` works.

---

## 4. Architecture: layers (migration finished, enforced in CI)

```
js/
  main.js            entry point (referenced by index.html): starts the composition root
  composicion/       COMPOSITION ROOT: the only modules that import everything; build the real adapters, wire them into the
                     services and run the shell (boot.js, store.js, preferencias.js, modo.js, backup.js, calendario.js, contexto.js)
  domain/            pure business rules: no DOM, network, storage, timers, clock, randomness, console, i18n (ids/clocks are injected)
  application/       use-case services + the club sync engine; depend on domain; concrete things arrive injected through ports
    ports/           JSDoc contracts only (ArchivoClubPort, CachePort, TimersPort, VentanaPort, IdGenPort...), no code
  infrastructure/    adapters that implement the ports: Drive client + connection, demo storage, cache/IndexedDB, Excel, PDF,
                     backup crypto, Google Calendar client, lazy vendor loading, fake Google for tests
  presentation/      shell/ (start flow screens, header, nav...), views/, ui.js, icons.js, router.js, styles.js, theme*.js,
                     lang-switch.js, contexto.js (ctx helpers), i18n/ (engine + locales/)
css/views/           per-view stylesheets (CSS is not a code layer)
```

Dependency rules (enforced by `scripts/check-arch.mjs`, see below):

| Layer                    | May import                                        | Must NOT                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                 | `domain`                                          | anything else; DOM/window/localStorage/fetch/navigator/timers/`console`/`Date.now()`/`new Date()`/`Math.random()`/`crypto` (clocks, ids and hashes arrive as parameters)           |
| `application`            | `domain`, `application`, `application/ports`      | `infrastructure`, `presentation`, the same globals as the domain. Repositories, clients, clock, timers, id generator are **injected** (`crearXService(repo, {ahora, genId, ...})`) |
| `application/ports`      | `domain`                                          | everything else (contracts only)                                                                                                                                                   |
| `infrastructure`         | `domain`, `application` (ports), `infrastructure` | `presentation`, `composicion`                                                                                                                                                      |
| `presentation`           | `domain`, `application`, `presentation`           | `infrastructure` and `composicion` (adapters reach the views through the context `ctx` built by the composition root); locales are imported only by `presentation/i18n/i18n.js`    |
| `composicion`, `main.js` | everything                                        | -                                                                                                                                                                                  |

How things connect at run time: `main.js` -> `composicion/boot.js` loads the adapters, builds the runtime object `rt` (`rt.ctxVista` = `serviciosDeVista(...)` of `composicion/contexto.js`: `prefs`, `CLAVES`, `config.setClientId`, `pdf`, `guardarPdfEnDrive`, `cargarDrive`, `servicioBackup()`, `servicioCalendario()`, `ahora`) and runs the start flow of `presentation/shell/`. Every view gets `ctx = {store, auth, ui, ...rt.ctxVista}` and builds its application services from it (`ahoraDe(ctx)`, `genIdDe(ctx)` in `presentation/contexto.js`). Tests build the same context with `serviciosDeVista` (see `tests/helpers/app.js`).

Ports (interfaces that adapters satisfy and tests replace): the club file (`ArchivoClubPort`: Drive or demo storage), the local cache (`CachePort`), timers, window events and network state (`TimersPort`, `VentanaPort`, `RedPort`), the id generator (`IdGenPort`), the clock (`RelojPort`/`ahora`), the repository (`list/get/upsert/remove`, satisfied by `store` or an in-memory fake), the preferences port `{leer, escribir}` (`drive.preferencias`), the Google Calendar client, and the PDF library (`usarLibreria`).

### Where things live

| Area                      | domain                                                                                                                                                 | application                                                                                                                                                                            | infrastructure                                                                                                              | presentation                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Club data store           | `schema.js`, `sheetdata.js` (doc <-> data, hash, 3-way merge), `filas.js`, `sellos.js` (logical stamps), `catalogoClub.js`, `demo.js`, `validacion.js` | `clubStore.js` (state, cache, CRUD, sync entry points), `clubSync.js` (open / sync cycle / refresh), `clubDatos.js` (backup support, import replace, GDPR, recovery, demo seed); ports | `drive.js`, `driveConnection.js`, `demoStorage.js`, `cache.js`, `xlsx.js`, `descargas.js`, `ids.js`, `lazy.js`, `config.js` | - (the `store` singleton is built in `composicion/store.js`)                         |
| Calendar                  | `calendario.js`                                                                                                                                        | `calendarioService.js`                                                                                                                                                                 | `googleCalendar.js`                                                                                                         | `views/calendario*.js`                                                               |
| Pool planning             | `planificacion.js`                                                                                                                                     | `planificacionService.js`                                                                                                                                                              | -                                                                                                                           | `views/planificacion*.js`                                                            |
| Season planning           | `temporada.js` (barrel of `temporada-modelo.js` + `temporada-plan.js`)                                                                                 | `temporadaService.js`                                                                                                                                                                  | -                                                                                                                           | `views/temporada*.js`                                                                |
| Training plan + PDF       | `entreno.js`, `desglose.js`                                                                                                                            | `entrenoService.js`, `entrenamientosService.js`, `etiquetasPdf.js`                                                                                                                     | `pdfEntreno.js`, `driveEntrenos.js`                                                                                         | `views/entreno-*.js`, `entrenamientos*.js`                                           |
| Loads / content catalogue | `cargas.js`                                                                                                                                            | `cargasService.js`                                                                                                                                                                     | -                                                                                                                           | `views/cargas*.js`                                                                   |
| Swimsuit catalogue        | `banadores.js`                                                                                                                                         | `banadoresService.js`                                                                                                                                                                  | -                                                                                                                           | `views/banadores-catalogo.js`                                                        |
| Categories by season      | `categorias.js`                                                                                                                                        | `categoriasService.js`                                                                                                                                                                 | -                                                                                                                           | `views/categorias-panel.js`                                                          |
| Preferences               | `preferencias.js`                                                                                                                                      | `preferenciasService.js`                                                                                                                                                               | -                                                                                                                           | - (instance in `composicion/preferencias.js`)                                        |
| Session / demo mode       | `erroresGoogle.js`, `clienteGoogle.js`                                                                                                                 | `sesionService.js`, `modoService.js`, `asistenteClub.js`, `avisosService.js`                                                                                                           | `driveConnection.js`, `demoStorage.js`                                                                                      | `shell/*`, `views/acceso.js`                                                         |
| Backup                    | `backup.js`                                                                                                                                            | `backupService.js`                                                                                                                                                                     | `backupCrypto.js`, `backupDrive.js`                                                                                         | `views/backup-panel.js` (service from `composicion/backup.js`)                       |
| Look and language         | `tema.js`                                                                                                                                              | -                                                                                                                                                                                      | -                                                                                                                           | `ui.js`, `icons.js`, `theme.js`, `i18n/`, `router.js`, `styles.js`, `lang-switch.js` |

### The architecture check (`scripts/check-arch.mjs`)

`npm run check` runs it (so the CI "Static validation" job does too) and `tests/unit/architecture.test.js` asserts it (plus tests of every rule on synthetic trees). Rules: **R1** allowed imports per layer, **R2** no import cycles, **R3** no forbidden globals/impure calls in domain/application (comments, strings, templates and regexes are ignored by a small scanner, `scripts/lib/scan.mjs`), **R4** presentation never imports infrastructure, **R5** locales only from `presentation/i18n`, **R6** domain/application never import presentation (i18n, ui, router, icons), **R7** ports import only domain, **R8** only the composition root imports `composicion/**` or `main.js`, **R9** more than 550 lines warns and more than 800 fails (Prettier-formatted line counts), **R10** no `<style>` injection in views, **R11** views calling `store.upsert/remove` directly (warning), **R12** every relative import resolves and ends in `.js` (also the static folder of a template `import()`). It is a ratchet: `scripts/arch-baseline.json` lists tolerated violations (currently **empty**); a new violation fails, and a baseline entry that no longer occurs also fails (`node scripts/check-arch.mjs --update-baseline` rewrites it, only ever to shrink). `node scripts/check-arch.mjs --all` lists everything ignoring the baseline.

Rules when moving or adding files: put the code in the layer that matches its dependencies; update (1) every import (the checks fail otherwise), (2) `npm run build:sw` (the precache list and `VERSION` are generated), (3) tests and features that import by path, (4) this file and `docs/ARCHITECTURE.md`. Do not move files "for tidiness" without a layer reason. Views never import adapters: add what a view needs to `composicion/contexto.js` and read it from `ctx`. Services never create clocks or ids: take `ahora` / `genId` as parameters.

---

## 5. Data model

Source of truth: the user's Drive. localStorage is only a mirror.

### Drive layout (folder `cnl`, created by the app; with `drive.file` the app cannot see a hand-made `cnl` folder, it creates and reuses its own)

| Path                    | Content                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cnl/<ClubName>.json`   | One file per club: `{ version, club: {key: value}, hojas: { <Sheet>: [rows...] }, sync?: {...} }`. Tagged with `appProperties.cnl='club'` so `drive.listClubs()` finds it; renamed when the club name changes.                                                                                                                                                                              |
| `cnl/preferencias.json` | User preferences `{ version, valores: {key: value}, marcas: {key: timestampMs} }`. Keys: `idioma`, `ultimoClub`, `clubes` (mirror of the club list), `tutorial`, `tema`, `calendario.vista\|ventanaDias\|alarmaMin`, `calSync.<key>` (Google Calendar sync map), privacy-notice flag. Merged per key by timestamp. A newer file version is never downgraded and unknown keys are preserved. |
| `cnl/entrenos/`         | PDFs of training plans saved from the app (`Alevin-2026-10-15-jueves.pdf` style).                                                                                                                                                                                                                                                                                                           |
| `cnl/backups/`          | `<club>-restore-YYYYMMDDHHMMSS.json` (last 5) automatic safety copy (a `cnl-backup` document) taken before every backup restore; `<club>-YYYYMMDD.json` rotating daily backup (last 14) taken before the first write of the day; `<club>-import-YYYYMMDDHHMMSS.json` before an Excel import (last 5). Best effort: a backup failure never blocks saving.                                    |
| `cnl/<Club>.xlsx`       | Optional Excel backup (`store.guardarXlsxEnDrive`).                                                                                                                                                                                                                                                                                                                                         |

### Sheets (`js/domain/schema.js` `SHEETS`; same columns as the exportable Excel tabs; row 1 = exact headers; `id` = unique string, UUID v4 via `newId()` of `infrastructure/ids.js`)

| Sheet (stored name)                                      | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Club`                                                   | key/value: `nombre`, `lema`, `logo` (dataURL), `colorPrimario`, `colorSecundario`, `zonaHoraria` (IANA, default `Europe/Madrid`), `temporadaActual`, `temporadaAplicada`, `categoriasConfig`                                                                                                                                                                                                                                                                                                           |
| `Nadadores`                                              | swimmers (the user's records): names, `fechaNacimiento`, `sexo`, `categoria` (current, materialized), `grupoId`, contact, `licencia`, `activo`, `licenciaMaster`, `categoriaManual` (wins over calculation)                                                                                                                                                                                                                                                                                            |
| `Grupos`                                                 | training groups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Entrenamientos`                                         | sessions: `fecha`, `hora`, `duracionMin`, `grupoId`, `estado` (`planificado`\|`realizado`), `piscina`, `volumenMin/Max`, `enfoque`...                                                                                                                                                                                                                                                                                                                                                                  |
| `EntrenoLineas`                                          | rows of the detailed plan of a session grouped by `set`; `componentes` (JSON split among training contents) and `estilo`                                                                                                                                                                                                                                                                                                                                                                               |
| `Asistencia`                                             | attendance per session and swimmer (`presente`\|`ausente`\|`justificado`)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Cargas`                                                 | training loads (metres, RPE, minutes, `tipo` = NAME of the content, in Spanish)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TiposCarga`                                             | catalog of training contents (predefined ids `tc-<key>` + custom), weekly min/max objectives, `alias`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ObjetivosCarga`                                         | LEGACY; migrated into `TiposCarga` on open and the rows are removed                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Marcas`                                                 | personal bests (`tiempoMs`, `piscina` 25\|50)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Comunicaciones`                                         | announcements (all club or per group)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Banadores`                                              | club-level swimsuit catalogue (not personal data): `tipo` = `entrenamiento` (training suit) \| `competicion` (competition fast skin / tech suit), `marca`, `modelo`, `activo`, `notas`. `Marcas.banadorId` optionally points to one (soft reference: no cascade; a dangling id means "no suit"). The old per-swimmer `Banador` delivery sheet is retired: old files still load and the sheet is dropped on the next write (`HOJAS_RETIRADAS` in `schema.js`; the daily backup keeps the previous file) |
| `Piscinas`, `AsignacionesCalle`                          | pools (lanes, schedule JSON) and lane assignments (weekly or one-off by `fecha`)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Temporadas`, `Fases`, `SemanasPlan`, `EventosTemporada` | season planning: season, phases (macrocycles), edited weeks (microcycles, id `sp-<season>-<monday>`), events (competitions A/B/C etc.)                                                                                                                                                                                                                                                                                                                                                                 |

**Stored values are neutral Spanish** (categories `'Pre-Benjamín'`, `'Benjamín'`, `'Alevín'`, `'Infantil'`, `'Junior'`, `'Absoluto'`, `'Master'`; states `planificado`, `presente`...). Translations are display-only (see section 7). Dates are `YYYY-MM-DD` text, times `HH:MM`, JSON columns are strings.

### Full backup format (`js/domain/backup.js`)

Settings > Backup (`views/backup-panel.js`, `application/backupService.js`, `infrastructure/backupCrypto.js` + `backupDrive.js`, wired in `composicion/backup.js`). A backup is ONE JSON file, the complete lossless copy (the Excel export stays for spreadsheets):

```
{ format: 'cnl-backup', formatVersion: 1, appVersion, docVersion, createdAt (ISO),
  club: { name, data: {Club key/values} },
  sheets: { <every entity sheet>: [rows incl. unknown columns], <unknown sheets kept as is> },
  extra: { top: {unknown top-level keys of the club document} },
  preferences: { idioma, tema, calendario.* }   // user-level only, never tokens / calSync / ultimoClub
  counts: { sheet: rows }, checksum: 'sha256:<hex over canonical JSON without the checksum>' }
```

Optional encrypted envelope `{format:'cnl-backup-encrypted', formatVersion, kdf:'PBKDF2-SHA256', iterations, cipher:'AES-GCM', salt, iv, ciphertext}` (WebCrypto; a wrong passphrase is an authentication failure). Limits as the Excel import (20 MB, 50,000 rows). A future `formatVersion` or `docVersion` is refused. Restore: always saves a safety copy first (Drive `cnl/backups/` or session memory in demo mode; failure = nothing restored), applies through the store (`upsertMany`/`removeMany`, so replace leaves tombstones), merge uses `sheetdata.mergeData` (current values win), skips invalid rows and rows erased for good (GDPR tombstones), never renames the club, then `store.migrar()` + category recalculation + user preferences. Never into a read-only (future version) club. Plain daily/import Drive copies are accepted too.

### Schema version, evolution, integrity

- `DOC_VERSION = 1` (`js/domain/sheetdata.js`). Reading a file with a **newer** version puts the store in **read-only mode** and preserves unknown sheets/columns/keys in `extra` (lossless round trip). Preferences have their own `version`.
- Adding sheets/columns must be backward compatible: old files lack the column and read it as empty; migrate on open (as `ObjetivosCarga` and the categories recalculation do). Never rename or reuse a column; add a new one. Use the `nueva-hoja-datos` skill.
- A remote file that is damaged/empty is reported as a `problema` and nothing is written until the user resolves it (`store.resolverProblema`). Rows are validated by `domain/validacion.js` on `upsert` and import (ranges, real dates, HH:MM). Import limits: 20 MB, 50,000 rows.
- GDPR (swimmers can be minors): `store.exportNadador(id)` (export one swimmer's data) and `store.purgarNadador(id)` (erase, optionally also from Drive); disconnecting Drive revokes tokens and clears personal local data except unsynced club data (`cache.js` `CLAVES_LOCALES`).

### Sync, merge and multi-device concurrency (same user)

- Writes: debounce 1.5 s, button "Sincronizar", `online` event. Each write is a full overwrite of the file (PATCH `uploadType=media`).
- Remote change detection: `drive.meta(id)` returns `rev` (`md5Checksum`/`modifiedTime`) and `version` (Drive's monotonic integer). `store.refresh` polls ~30 s while the tab is visible (exponential back-off up to 5 min on errors).
- Merge: **three-way, field-level** between `base` (last synced), local and remote (`sheetdata.mergeData`), using **logical stamps** `n@device` (Lamport clock, independent of wall-clock time) and **tombstones** for deleted rows. Concurrent edits to the same field: the local one wins. If Drive's `version` jumps by more than 1 between read and write, another device wrote in between and the merge+write repeats (up to 5 rounds). (`docs/ARCHITECTURE.md` still says "per row"; the code is per field.)
- Local mirror: `localStorage['cnl:club:<id>']` (overflow to IndexedDB `cnl-cache`; the newest copy wins on read) holding data, `dirty` flag and `base` = **offline queue** of unsynced changes. `store.status`: `sincronizado | pendiente | error | offline`. Preferences mirror: `cnl:prefs` with its own debounce and offline queue.

### What is stored where

| Datum                                                                   | Truth                                                                                                                       | Local mirror                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Club identity, all sheets                                               | `cnl/<Club>.json`                                                                                                           | `cnl:club:<id>`                                                                              |
| Language, theme, last club, tutorial, calendar prefs, calendar sync map | `cnl/preferencias.json`                                                                                                     | `cnl:prefs`, `cnl:lang` (sync boot), `cnl:tema` (read by `theme-boot.js` before first paint) |
| PDFs / Excel copies / backups                                           | `cnl/entrenos/`, `cnl/<Club>.xlsx`, `cnl/backups/`                                                                          | none                                                                                         |
| Client ID                                                               | `js/infrastructure/config.js` or `localStorage['cnl:clientId']`                                                             | -                                                                                            |
| Drive connection                                                        | tokens in memory only; flag `localStorage['cnl:drive-auth']='1'` ("already authorized", no identity)                        | -                                                                                            |
| Demo mode                                                               | `localStorage['cnl:mode']='demo'` + `cnl:demo:*` (club file) + `cnl:demo:club:*` (store mirror); erased by exiting the demo | -                                                                                            |
| Device-only                                                             | `cnl:install-dismissed`, `cnl:test*` (test tooling)                                                                         | -                                                                                            |

localStorage is **never** the source of truth for configuration.

---

## 6. Module and route map

Routing: hash router (`js/presentation/router.js`), `#/<name>[/<param>...]`; `js/presentation/shell/navModel.js` lists the modules (bottom bar, sidebar groups and the "More" sheet) and each name loads `js/presentation/views/<name>.js` (`export async function render(container, params, ctx)`, `ctx = {store, auth, ui}`). Unknown routes go to `inicio`. Pool planning is `#/planificacion/piscina` (Season is the default of `#/planificacion`).

| Route                         | View                                                                          | Purpose                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inicio`                      | `views/inicio.js` (+ `primerospasos.js`)                                      | Dashboard: shortcuts, weekly loads vs objectives, alerts, next session, today's attendance, recent communications; "first steps" card on an empty club                     |
| `nadadores`, `nadadores/<id>` | `nadadores.js`                                                                | Swimmer list, form with automatic category, profile with attendance/loads/personal bests, GDPR export/erase                                                                |
| `grupos`                      | `grupos.js`                                                                   | Training groups CRUD and members                                                                                                                                           |
| `entrenamientos`              | `entrenamientos.js` + `entreno-editor.js`, `entreno-acciones.js`              | Weekly sessions; detailed set editor with totals, templates, content/style breakdown; PDF download/preview/print/save to Drive                                             |
| `calendario`                  | `calendario.js`                                                               | Month/Week/Agenda, filters, `.ics` export, optional Google Calendar sync                                                                                                   |
| `planificacion`               | `planificacion.js` + `temporada.js`, `temporada-grafico.js`                   | Tab "Temporada" (phases, weeks, planned vs actual volume, A/B/C events, chart, timeline) and tab "Piscina" (lanes, conflicts, suggestion, print)                           |
| `asistencia`                  | `asistencia.js`                                                               | Roll call with one tap, history, percentage per swimmer                                                                                                                    |
| `cargas`                      | `cargas.js` + `cargas-contenidos.js`                                          | Loads by training content, RPE, weekly objectives with alerts; content catalog manager                                                                                     |
| `marcas`                      | `marcas.js`                                                                   | Times (mm:ss.cc), bests and evolution per event                                                                                                                            |
| `comunicaciones`              | `comunicaciones.js`                                                           | Announcements                                                                                                                                                              |
| `club`                        | `club.js` (+ `categorias-panel.js`, `datos-integridad.js`, `backup-panel.js`) | "Configuracion": identity, Drive locations, Excel export/import, full Backup (download, restore, Drive copies), preferences, categories rules, data integrity, switch club |
| `tutorial`                    | `tutorial.js`                                                                 | Interactive Google setup guide                                                                                                                                             |
| (no route)                    | `acceso.js`                                                                   | Start screen (connect Drive), "Configuracion necesaria" (no Client ID, offers the demo), first-run wizard, club selector, Google error help                                |

Other core modules: `js/main.js` (thin entry) -> `js/composicion/boot.js` (composition root: builds the adapters and the view context, then runs the start flow of `js/presentation/shell/`: no Client ID -> "Configuration needed" screen (Try the demo first, owner setup below); Client ID and not connected -> start screen (Connect Google Drive only); Drive connected -> preferences + `drive.listClubs()` -> 0 clubs wizard / 1 or `ultimoClub` open / several selector; demo -> demo club; then the shell with the 56 px header, settings/connection menu, sidebar on desktop, bottom bar of 4 items + More on mobile, club theme), `js/infrastructure/config.js`, `js/infrastructure/lazy.js`, `js/infrastructure/entornoPruebas.js` (decides whether fake Google may be activated).

---

## 7. i18n (es / en / it)

- Engine `js/presentation/i18n/i18n.js`: `t('key', {vars})` resolves current language -> `es` -> the key itself. Flat dotted keys, `{name}` interpolation. Helpers: `tCat`, `tEstado`, `tTipo`, `tContenido`, `tContenidoDesc`, `tNav`, `tDate`, `tNum`, `locale()`, `setLang`, `onLangChange` (the control is `js/presentation/lang-switch.js` `langSwitch()`). Language is stored in `preferencias.json` (`idioma`) and mirrored in `localStorage['cnl:lang']`; first run follows the browser, else `es`.
- Locale files in `js/presentation/i18n/locales/`: base `es.js`/`en.js`/`it.js` plus per-area triplets `<area>.{es,en,it}.js`: `vistas-a`, `vistas-b`, `vistas-c`, `planificacion`, `calendario`, `entreno`, `cargas-tipos`, `acceso`, `categorias`, `temporada`, `datos`, `diseno`, `backup`. All are merged in `DICTS` at the top of `i18n.js`.
- **Stored values stay in neutral Spanish**; translation is display-only (`cat.<normalized>`, `estado.<normalized>`, `tc.<key>.nombre|desc` for predefined training contents; custom ones are shown as typed).
- Add a key: add it to the `es` file first, then `en` and `it` with the **same interpolation variables**; never leave a UI string hard-coded in a view. Unit tests enforce parity (same keys, no orphans, same variables, no empty values): `tests/unit/i18n.test.js`, `temporada-i18n.test.js`.
- Add a new locale file for a new area: create the three files, import and spread them into all three `DICTS` entries in `i18n.js`, add them to `SHELL` in `sw.js`, add them to the parity test.
- Add a language: use the `nuevo-idioma` skill (dictionaries, `LANGS`, `INTL` locale map, PDF texts `entreno.<lang>.js`, `sw.js`, parity tests).
- Terminology: Phase = macrocycle, Week = microcycle (es "Fase"/"Semana", en "Phase"/"Week", it "Fase"/"Settimana").
- Documentation, tests (names, comments, messages) and code comments are English; only UI strings are Spanish/en/it (inside Gherkin steps, quoted UI texts stay Spanish because the e2e app runs with `cnl:lang=es`).

---

## 8. Design system

Contract and markup examples: **`docs/DESIGN.md`** (read it before touching UI). Files: `css/tokens.css` (variables), `css/app.css` (shell), `css/components.css` (components), `js/presentation/ui.js` (helpers that build markup), `js/presentation/theme.js` + `js/presentation/theme-boot.js` (light/dark/auto), `js/domain/tema.js` (club color and contrast, pure), `js/presentation/icons.js` (icons). Load order: tokens -> app -> components.

Rules (summary):

1. One `<h1>` per view, inside `.page-head`; blocks use `h2/h3`.
2. No `<style>` injected from views (rule R10 of the architecture check; per-view CSS is `css/views/<name>.css` loaded with `useStyles('<name>')`). Add reusable pieces to `components.css`.
3. No hard-coded colors: use tokens (`var(--surface)`, `var(--text)`, `var(--c-accent)`...). Club brand color is applied through `--c-*` with contrast guaranteed >= 4.5:1 (`variablesTema`).
4. Inline validation (`fieldError`, `formFields().validate()`); never `alert()`.
5. Tables in `.table-wrap > .table`; `.table--cards` with `data-label` on mobile; numbers with `class="num"`.
6. Delete with undo (`toast.undo`) or `confirmDialog(..., {danger: true})`.
7. Empty states always with a call to action (`empty({icon, title, text, action})`).
8. Forms and dialogs in `sheet()` (bottom sheet on mobile) with visible labels (`field()`).
9. State = color + icon/dot + text (`badge`, `alert`), never color alone.
10. **No emojis anywhere** (UI, docs, commits): icons come from `js/presentation/icons.js` (`icon('name')`, `currentColor`, 24 viewBox line icons). Add an icon by adding its path to `ICONS`.
11. 44 px touch targets on mobile, text never below 12 px; visible focus; skip link; dialogs trap focus and return it.
12. All text through `t('key')`.

Dark mode: `[data-theme="dark"]` forces it; `prefers-color-scheme: dark` applies it when no `[data-theme="light"]`; `tokens.css` keeps both dark blocks identical (a test checks it). Static tests (`tests/unit/diseno-estatico.test.js`, `ui-diseno.test.js`, `theme.test.js`, `tema.test.js`) verify contrast, tokens, components, CSP, icons and manifest.

---

## 9. Testing

### Pyramid

| Level       | Location                                                                 | Tool                                              | Covers                                                          |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| Unit        | `tests/unit/*.test.js`                                                   | `node --test` (+ jsdom for `ui`/store/drive/auth) | domain, services, store, drive, sheetdata, i18n, design statics |
| Integration | `tests/integration/*.test.js`                                            | `node --test` + jsdom + fake Google               | views + store together                                          |
| E2E         | `features/*.feature` + `features/steps/*.steps.js` + `features/support/` | Cucumber 13 + Playwright Chromium                 | user journeys, desktop and mobile                               |

`tests/unit/index.js` and `tests/integration/index.js` import every `*.test.js` in their folder (Node 24 treats `node --test <dir>` as a file): a new test file is picked up automatically, no registration needed.

### Simulated Google (never call real Google in tests)

`js/infrastructure/fakeGoogle.js` is an in-memory adapter with the same interfaces as `driveConnection` and `drive` (simulated connection, `ensureFolder`, `listClubs`, `createClub`, `meta/read/write`, preferences, `upload`, `findFile`, backups...). It is activated **only** with `localStorage['cnl:test']='1'` on `localhost`/`127.0.0.1`/`[::1]` or `window.__CNL_TEST__` (decided by `infrastructure/entornoPruebas.js`); it is dynamically imported by `app.js`, so production never downloads it (and it is intentionally not in `sw.js` `SHELL`). Options via `localStorage['cnl:test:opts']` (JSON) or `__CNL_TEST__`: `conectado` (alias `sesion`), `demo` (seeds `store.seedDemo` once into a club of the simulated Drive; not the product demo mode), `sinClientId` (lands on the config screen WITH the demo button; a Client ID saved in the browser counts as configured), `errorConexion` (alias `errorLogin`), `fallos` (no user option: there is no identity). It mirrors state in `localStorage['cnl:test:drive']` and exposes `window.__CNL_FAKE__` (`clubs()`, `prefs()`, `archivos()`, `editarClubExterno`, `desinstalar()`). The `cnl:test` mechanism is test tooling: invisible to users, no "demo mode" in the product.

### Helpers

- `tests/helpers/env.js`: `setupEnv()` (global jsdom), `importApp(rel)`, `tick()`.
- `tests/helpers/app.js`: `boot()`, `fresh({demo, club})` (clean DOM + fake Drive + open club), `renderView(name, container, params, ctx)`, `fieldByLabel`, `buttonByText`, `setValue`. `tests/helpers/pdf.js`: PDF inspection.
- Cucumber: `features/support/world.js` (`CnlWorld`: `openApp`, `enterClub({demo})`, `goTo(route)`, `eventually`, `expectVisible`, `fill`, `drive()`), `hooks.js` (free port, static server, Chromium, fresh context per scenario, failure screenshot, **fails a passing scenario if there were console errors or 4xx/5xx**), `cucumber.js` (profile/tags/retries: 2 in CI). `MODULES` in `world.js` maps visible module names to routes (add new modules there).

### Writing a Cucumber feature (English Gherkin)

Features are English (`# language: en`; keywords `Feature`, `Background`, `Scenario`, `Scenario Outline`, `Given`, `When`, `Then`, `And`). Texts that come from the UI (button labels, headings, toasts, stored values) stay Spanish inside the English step, e.g. `When I open the "Nadadores" module`. Reuse existing steps (`features/steps/comunes.steps.js` has club setup, navigation, buttons, text, forms); add area-specific steps in a new `features/steps/<area>.steps.js` using `this.page`/`this.eventually` (never fixed sleeps).

```gherkin
# language: en
@myarea
Feature: Name of the capability
  As a coach I want ... so that ...

  Background:
    Given a club with demo data

  @smoke
  Scenario: Essential happy path
    When I open the "Nadadores" module
    Then I see the button "Nuevo nadador"
```

Starting states: `Given a club with demo data`, `Given an empty club with Drive connected`, `Given the app has just been opened without Drive connected`, `Given the app is open without a Google Client ID`. Put `@smoke` only on essential scenarios; use `@desktop` / `@mobile` when the layout differs; one area tag per feature. Use the `nuevo-escenario-cucumber` skill.

### Rules

- **Never depend on the current date.** Pure code receives the date as a parameter; services receive an `ahora` clock; tests use fixed dates or dates relative to a fixed clock. Demo data (`seedDemo`) is built relative to the clock; in e2e steps derive dates from the page, not hard-coded calendar days. If a test would fail "next September" (season change) it is wrong.
- No flaky waits: `eventually`/Playwright auto-wait, not `waitForTimeout` guesses.
- Domain and services: unit tests with in-memory repositories. Views: integration. Journeys: e2e. Test the thing at the lowest level that can show it.
- Do not weaken or delete a test to make the suite pass; fix the cause.

---

## 10. CI/CD, deployment, dependencies

Workflow `.github/workflows/pages.yml` ("CI and deployment to GitHub Pages"; triggers: push to `main`, pull requests, manual; concurrency cancels superseded runs; Node 22; `npm ci`):

| Job           | Needs             | What                                                                                                                                                     |
| ------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate`    | -                 | `npm run verify` (check, Prettier check, ESLint); `npm audit --omit=dev --audit-level=high`; `git diff --exit-code -- vendor/` (vendor in sync with npm) |
| `unit`        | validate          | `npm run test:unit`                                                                                                                                      |
| `integration` | validate          | `npm run test:integration`                                                                                                                               |
| `e2e`         | unit, integration | installs Chromium, `npm run test:e2e` (desktop + mobile, `CI=true`, 2 retries), job summary via `scripts/resumen-e2e.mjs`, uploads `reports/` (14 days)  |
| `build`       | e2e               | copies `index.html manifest.webmanifest sw.js css js icons vendor` into `_site/` and uploads the Pages artifact                                          |
| `deploy`      | build             | only on `main` (not PRs): `actions/deploy-pages` (needs Settings > Pages > Source: GitHub Actions)                                                       |
| `smoke`       | deploy            | polls `https://augustocristian.github.io/cnsa-management-platform/` for HTTP 200 (5 tries)                                                               |

Consequences: a new top-level runtime folder/file must be added to the `cp -r` list in the `build` job or it will not be deployed. `docs/`, `features/`, `tests/`, `scripts/` are not deployed.

Dependabot (`.github/dependabot.yml`): weekly (Monday) for `npm` (minor+patch grouped, max 5 PRs, label `dependencies`) and `github-actions` (all grouped). When a Dependabot PR changes `jspdf`, `jspdf-autotable` or `@e965/xlsx`, run `npm install` so `vendor/` and `vendor/integrity.json` are regenerated and committed, then run the full suite, and bump the `sw.js` `VERSION`. Production dependencies: `@e965/xlsx`, `jspdf`, `jspdf-autotable`. Dev: `@cucumber/cucumber`, `jsdom`, `pdfjs-dist` (screenshots of PDFs), `playwright`, `prettier`, `eslint`, `@eslint/js`, `globals` (the last four are grouped in one Dependabot PR; after merging one, run `npm run format` and `npm run lint`).

PWA: `sw.js` is stale-while-revalidate for HTML/JS/CSS and cache-first for `vendor/`, `icons/` (same-origin GET only; Google/Drive/GIS are never intercepted); its precache list and `VERSION` are GENERATED from the disk (`npm run build:sw`, checked by `npm run check`); a new worker waits until the user clicks "Reload" in the banner; `manifest.webmanifest` (maskable + any icons).

---

## 11. Workflow and commit policy

- **Never break the app.** Before every commit run `npm run verify` (check + format:check + lint), `npm run test:unit` and `npm run test:integration`; `npm run format` fixes formatting. New code follows Prettier and ESLint: no new warnings (the `--max-warnings` count in `package.json` must not grow), no `eslint-disable` without a reason. For large changes (new view, store/sync/merge, routing, service worker, shell, CSS tokens) also run the e2e suite (at least `npx cucumber-js --tags @smoke` desktop and mobile; the full `npm run test:e2e` before a milestone push). If something fails and it is not yours, say so; do not hide it.
- **Small, descriptive commits** that say what and why (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:` prefixes as in the history; one logical change each; body explains the reason when not obvious). Past tense is not required; be consistent with the log.
- **Push at each milestone**, after the checks above pass. Check CI afterwards; a red CI on `main` is the top priority.
- Commit footer (when a commit is made by Claude): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` as configured for the session. Pull request descriptions end with the Claude Code generated-with line.
- **Do not commit temporary files**: `cap*_tmp.mjs`, example PDFs, ad-hoc scratch scripts, `reports/`, `test-results/`, `playwright-report/`, `node_modules/` (already ignored: `node_modules/ reports/ playwright-report/ test-results/`). Put scratch work in the session scratchpad, not in the repo. Check `git status` before staging; stage files by name, not `git add -A`.
- **Never use `taskkill /IM node.exe`** (it kills every Node process, including editor tooling and other agents' servers). Stop only the PID you started.
- Use **free ports** for test/dev servers (the harnesses pick one automatically; for manual `npm run serve` pass an explicit unused port). Never assume 4173/8080 is free.
- **One agent per file zone** when work is parallelized: never edit files another agent owns; zones follow the layer/area split of section 4 (e.g. domain+service of an area, its view, locales, tests/features, docs, `sw.js`). Shared files that collide often: `sw.js` `SHELL`, `js/presentation/i18n/i18n.js` `DICTS`, `js/presentation/i18n/locales/*.js`, `js/domain/schema.js`, `js/composicion/store.js`, `README.md`, `docs/ARCHITECTURE.md`. Coordinate or serialize edits to them.
- Windows/PowerShell specifics: see section 14. Do not run destructive git commands (reset --hard, push --force, checkout --) without being asked.

---

## 12. How to add things (step by step)

### A feature (use skill `nueva-funcionalidad`, or agent `desarrollador-funcionalidades`)

1. **Domain** `js/domain/<area>.js`: pure functions (dates and clock as parameters), validation, calculations. Unit tests first.
2. **Service** `js/application/<area>Service.js`: `crear<Area>Service(repo, {puedeEditar, ahora, genId})`; the repository (`list/get/upsert/remove`) is injected; no DOM. Unit tests with an in-memory repo.
3. **Data** if it persists: see "a data sheet" below.
4. **View** `js/presentation/views/<name>.js`: `export async function render(container, params, ctx)`; presentation only; build DOM with `h()`; use `ui.js` helpers and design components (section 8); empty state with a call to action; works on mobile first.
5. **Route**: add the route to a group in `js/presentation/shell/navModel.js` only for a top-level module; add `nav.<name>` in locales, the icon in `js/presentation/icons.js`, and the module in `MODULES` of `features/support/world.js`.
6. **i18n**: all strings in es/en/it (section 7).
7. **Tests**: unit (domain + service), integration (`tests/integration/<area>.test.js` with `fresh()`/`renderView()`), and add the view to `VIEWS` in `tests/helpers/app.js` if it should be in the generic render test.
8. **Cucumber** feature + steps (section 9), with `@smoke` for the essential scenario; mobile profile must pass too.
9. **Docs**: README feature table, `docs/ARCHITECTURE.md` (module/sheet), `docs/DESIGN.md` if a component was added, this file's module map.
10. **Screenshots**: add a scenario in `scripts/capturas.mjs`, run `npm run capturas -- --solo=<id>`, reference the PNG in the README.
11. **Service worker**: run `npm run build:sw` (the list and `VERSION` are generated from the files on disk, including `css/views/*.css`); `npm run check` fails when it is stale or when an import / `useStyles` stylesheet is missing or not precached.
12. Run `check` + unit + integration (+ e2e), then commit in small steps.

### A data sheet or column (skill `nueva-hoja-datos`, agent `datos-drive`)

1. Add to `SHEETS` in `js/domain/schema.js` (new sheets are picked up by `ENTITY_SHEETS`); add range/date/time rules in `js/domain/validacion.js` if numeric/date/time; add text columns to `COLS_TEXTO` in `sheetdata.js` when they must stay text (ids ending in `Id` already do).
2. Keep it backward compatible (old files have no such column/sheet). Add a migration on open if needed (follow `ensureCatalog`/categories recalculation); do not bump `DOC_VERSION` unless the file format itself changes incompatibly.
3. Relations: declare in `RELACIONES` (`sheetdata.js`) so deletes cascade/orphans are detected; consider GDPR (`datosNadador`, `purgarNadador`) if the data hangs from a swimmer.
4. Update `store.seedDemo` if the demo should show it; check Excel export/import (`store.exportXlsx/importXlsx`) round-trips it.
5. Tests: `schema.test.js`, `store.test.js`/`integridad-*.test.js`, merge cases in `sheetdata`; update the sheet tables in `docs/ARCHITECTURE.md` and section 5 here.

### A language (skill `nuevo-idioma`, agent `i18n`)

Add the code to `LANGS` and `INTL` in `js/presentation/i18n/i18n.js`; create `js/presentation/i18n/locales/<area>.<lang>.js` for every area (copy from `es`, translate); spread into a new `DICTS.<lang>`; add `entreno.<lang>.js` for PDF texts; add all files to `sw.js` `SHELL` (+ bump `VERSION`); extend the parity tests; check dates/numbers and PDF; stored values stay Spanish.

### A training content (load type)

Predefined contents live in `CATALOGO_PREDEFINIDO` (`js/domain/cargas.js`, stable id `tc-<key>`, never rename or delete one): add the entry, add `tc.<key>.nombre` and `tc.<key>.desc` to `js/presentation/i18n/locales/cargas-tipos.{es,en,it}.js` (the i18n test requires every predefined content to be translated), include its alias for the exercise-text parser (`TiposCarga.alias`, e.g. `AeL`), run `cargas.test.js`/`cargasService.test.js`/`desglose.test.js`. Existing clubs get it through `ensureCatalog` (adds missing predefined ids without duplicating or overwriting edits). User-defined contents are created at runtime in the UI and need no code.

### A screen (without a new module)

A sub-screen/tab inside an existing view: put the model in the domain/service, render it as a separate view module imported by the parent (as `temporada.js` does for `planificacion.js`), reuse design components, i18n in the area's locale file, keep the `<h1>` unique, add integration + e2e coverage, screenshot, docs.

### A UI component (skill `nuevo-componente-ui`, agent `ux-a11y`)

Add markup helper to `js/presentation/ui.js` (if it generates DOM), CSS to `components.css` using tokens only (light, dark, mobile 44 px, focus), example markup and rules to `docs/DESIGN.md`, a test in `diseno-estatico.test.js`/`ui-diseno.test.js`, then use it in a view.

---

## 13. Subagents and skills

Defined in `.claude/agents/` (subagents) and `.claude/skills/` (skills). Prefer delegating to the matching agent; each owns its file zone.

| Agent                           | Use it when                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arquitecto`                    | Deciding which layer something belongs to; reviewing dependency rules/ports; creating or extending `scripts/check-arch.mjs`; planning safe phased refactors (e.g. splitting a module that grew past 800 lines) |
| `desarrollador-funcionalidades` | Implementing a whole feature end to end (domain -> service -> view -> i18n -> tests -> feature -> docs -> SW)                                                                                                  |
| `qa-tests`                      | Writing/diagnosing unit, integration and Cucumber tests; flaky or date-dependent tests; mobile-only failures                                                                                                   |
| `i18n`                          | Translating a feature's strings, key parity audits, terminology, hard-coded Spanish in views, adding a language                                                                                                |
| `ux-a11y`                       | Design system compliance, WCAG 2.2 AA, mobile layout, dark mode, migrating legacy `<style>` views                                                                                                              |
| `datos-drive`                   | Anything touching schema/sheets, `sheetdata`, `store`, `drive`, `cache`: migrations, merge/concurrency between the user's devices, offline queue, backups, integrity                                           |
| `seguridad-rgpd`                | Security/privacy review: CSP, SRI, XSS/export injection, token handling, OAuth scopes, data of minors, what stays in the browser after disconnecting Drive                                                     |
| `release-ci`                    | Verify -> small commits -> push -> watch CI; red CI diagnosis; Pages deployment; Dependabot PRs; service worker staleness                                                                                      |
| `documentacion`                 | Keeping README, CLAUDE.md, `docs/*` and screenshots aligned with the code                                                                                                                                      |

| Skill                      | Use it when                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `nueva-funcionalidad`      | Adding a module/screen/report/capability end to end (has templates for domain, service, view, tests, feature, steps) |
| `nueva-hoja-datos`         | A feature needs a new sheet or column without breaking existing files                                                |
| `nuevo-idioma`             | Adding a language or auditing a language is complete                                                                 |
| `nuevo-escenario-cucumber` | Adding or fixing Cucumber scenarios/steps                                                                            |
| `nuevo-componente-ui`      | Adding a design-system component                                                                                     |
| `regenerar-capturas`       | Regenerating `docs/screenshots` and updating the README references                                                   |
| `preparar-release`         | Pre-release verification and deployment checklist                                                                    |

Existence check at the time of writing: all nine agents exist in `.claude/agents/`; skills `nueva-funcionalidad`, `nueva-hoja-datos` and `nuevo-idioma` exist, the remaining four skill folders were still empty while being created (see the closing check in the final report; re-verify with `ls .claude/skills/*`).

---

## 14. Known issues, limits, traps, roadmap

### Traps

- **`sw.js` SHELL/VERSION are generated.** After adding, renaming or editing any file under `js/`, `css/`, `icons/` or `vendor/` (or `index.html`/the manifest) run `npm run build:sw` and commit `sw.js`; `npm run check` (and CI) fails with a readable report when it is stale. Only `fakeGoogle.js` is deliberately excluded. A required file that fails to precache aborts the worker install (no silent catch); `vendor/*` are optional.
- **Not tested against real Google.** All automated tests use the fake. The end-to-end flow with a real account (consent screen, `drive.file` behavior, token expiry after 7 days in "Testing" mode, Calendar sync) is unverified in production; `@google @pending` scenarios are documented but excluded. `BUILTIN_CLIENT_ID` is empty in the repo.
- **Windows / PowerShell**: the shell here is PowerShell (and Git Bash); `&&` does not exist in Windows PowerShell 5.1; set env vars with `$env:VIEWPORT='mobile'`; use forward slashes in npm scripts and paths; `rm -rf`, `head`, etc. are not PowerShell. Never `taskkill /IM node.exe`.
- **CRLF**: files in this checkout have CRLF line endings (e.g. `README.md`). Keep the line endings of the file you edit (do not mix); `git diff --exit-code -- vendor/` in CI can differ from local if `core.autocrlf` rewrites vendor files, so commit `vendor/` as produced by `npm run vendor`.
- **Ports**: never hard-code a test port; a stuck server from a previous run (static server or Chromium) can hold one. Kill only your own PID.
- **Dates**: no hidden dependency on today's date (season changes on 1 September; the category table shifts with it). The demo data is clock-relative.
- **Drive scope**: with `drive.file` the app cannot see files it did not create; do not write features that assume it can list the whole Drive or reuse a hand-made `cnl` folder.
- **Docs drift**: `docs/ARCHITECTURE.md` and `docs/SETUP-GOOGLE.md` say merge is "per row"; the code merges per field with logical stamps and tombstones. The old "design target mockup" section may still be present.
- No view injects `<style>` any more (rule R10), but the CSP still keeps `'unsafe-inline'` for styles and `components.css` block 11 is still a temporary `!important` bridge for dark mode: check both before removing them.
- Suite status: run `npm run check`, `npm run test:unit` and `npm run test:integration` (plus the e2e smoke) before relying on any recorded count.

### Roadmap (status: in progress unless noted)

| Item                                                                                                                                                                                                                                                                | Status                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered refactor: `presentation/`, `composicion/` + `main.js`, `store.js` split into `application/clubStore.js` + `clubSync.js` + `clubDatos.js` with ports, Drive/cache/Excel under `infrastructure/`                                                              | Done (see section 4); `scripts/arch-baseline.json` is empty                                                                                  |
| `scripts/check-arch.mjs` architecture test + CI step                                                                                                                                                                                                                | Done: part of `npm run check` and `tests/unit/architecture.test.js`                                                                          |
| Prettier + ESLint (scripts `format`, `lint`, `verify`, CI step)                                                                                                                                                                                                     | Done: `.prettierrc.json`, `eslint.config.js`, `npm run verify` in the CI static job; lint warning baseline in `package.json` may only shrink |
| UX batches: shell/header and menu redesign (theme selector provisionally next to the language selector), decide whether the footer repeats on every screen (tests look for `footer.footer`), migrate legacy view `<style>` blocks to components and delete block 11 | In progress                                                                                                                                  |
| Align README/docs/code texts with the individual-user model (no sharing/roles wording anywhere)                                                                                                                                                                     | In progress (another agent)                                                                                                                  |
| README screenshots wired to `docs/screenshots/*`                                                                                                                                                                                                                    | Pending (screenshots exist; README does not reference them yet)                                                                              |
| Test the full flow with a real Google account in production; set `BUILTIN_CLIENT_ID`                                                                                                                                                                                | Pending                                                                                                                                      |
