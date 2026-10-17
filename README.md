# CNL Plataforma

[![CI and deployment](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml/badge.svg)](https://github.com/augustocristian/cnsa-management-platform/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-1a73e8?logo=github)](https://augustocristian.github.io/cnsa-management-platform/)
[![PWA](https://img.shields.io/badge/PWA-instalable-5a0fc8?logo=pwa&logoColor=white)](https://augustocristian.github.io/cnsa-management-platform/)
[![Dependabot](https://img.shields.io/badge/Dependabot-activado-025e8c?logo=dependabot&logoColor=white)](.github/dependabot.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-f7df1e?logo=javascript&logoColor=black)
![Sin build](https://img.shields.io/badge/build-ninguno-brightgreen)
![Google Drive](https://img.shields.io/badge/persistencia-Google%20Drive-0f9d58?logo=googledrive&logoColor=white)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-orange)

**Complete management for a swimming club**: swimmers, training sessions, attendance, training loads, personal bests, kit, announcements, season planning, pool lanes and a calendar, all in a PWA that works from your phone at the pool.

**[Open the app](https://augustocristian.github.io/cnsa-management-platform/)**

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-inicio.png" width="620" alt="Desktop home screen: welcome banner, quick access, load alerts, weekly load chart and next session"> | <img src="docs/screenshots/movil-inicio.png" width="200" alt="Mobile home screen with the bottom navigation bar and the welcome banner"> |

This is an **individual-use** app: there is **no sign-in and no user account**: the person just *connects Google Drive* (authorization only, the single `drive.file` permission; the app never knows who you are) and **everything is stored in the `cnl` folder of their own Google Drive**, only so that it persists and is available on all their devices (e.g. computer and phone). Drive is not a shared database: there is no sharing, no roles and no multi-user support, and the app shares data with nobody (no server, no database). To look around first, the start screen also offers **Try the demo**: sample data kept only in your browser, clearly labelled *Demo mode: your data is not saved to Drive*, erased when you exit. Swimmers and groups are records you manage, not app users. It was first built for Club Natación Lugones, with a configurable visual identity so other clubs can adopt it. The interface is available in Spanish, English and Italian; the screenshots below show the Spanish interface unless noted.

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Season categories](#season-categories)
- [Storage: Google Drive](#storage-google-drive)
- [Languages](#languages)
- [Accessibility and design](#accessibility-and-design)
- [Architecture](#architecture)
- [Development](#development)
- [Regenerating the screenshots](#regenerating-the-screenshots)
- [Testing](#testing)
- [Deployment](#deployment)
- [Dependencies](#dependencies)

## How it works

### 1. First launch

Connect Google Drive, then a two-step wizard creates the club file inside `cnl/`. The club starts **empty**: no sample data, a *First steps* card and empty states with calls to action.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-acceso.png" width="620" alt="Start screen with the Connect Google Drive button and the language selector"> | <img src="docs/screenshots/movil-acceso.png" width="200" alt="Mobile start screen with the Connect Google Drive button"> |
| <img src="docs/screenshots/escritorio-asistente.png" width="620" alt="Wizard step 1 of 2: club name and motto already filled in"> | <img src="docs/screenshots/movil-asistente.png" width="200" alt="Mobile wizard step 1 of 2"> |
| <img src="docs/screenshots/escritorio-asistente-colores.png" width="620" alt="Wizard step 2 of 2: club colours and time zone"> | <img src="docs/screenshots/movil-asistente-colores.png" width="200" alt="Mobile wizard step 2 of 2"> |
| <img src="docs/screenshots/escritorio-primeros-pasos.png" width="620" alt="Home of a brand new club with the First steps card: create groups, add swimmers, define the pool, schedule a session"> | <img src="docs/screenshots/movil-primeros-pasos.png" width="200" alt="Mobile home of a new club with the First steps card"> |

If the copy of the app has no Google Client ID (`BUILTIN_CLIENT_ID` in `js/infrastructure/config.js`), a *Configuración necesaria* screen offers **Try the demo** first (sample data kept only in the browser, nothing sent to Drive) and, below it, the owner setup: the 5-minute tutorial ([docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md)). That is a one-off task for the owner of the app. You can have **several clubs** (several files in `cnl/`) and switch between them from *Configuración*.

### 2. Day to day at the pool: attendance and loads

Take attendance with one tap per swimmer, register the metres swum per training content and keep an eye on the weekly targets.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-asistencia.png" width="620" alt="Attendance: session selector, present/absent/excused counters and one card per swimmer"> | <img src="docs/screenshots/movil-asistencia.png" width="200" alt="Mobile attendance list: tap a swimmer to cycle present, absent, excused, unmarked"> |
| <img src="docs/screenshots/escritorio-cargas.png" width="620" alt="Loads: alerts and metres per content against the weekly minimum and maximum targets"> | <img src="docs/screenshots/movil-cargas.png" width="200" alt="Mobile loads screen with alerts and bars per content"> |
| <img src="docs/screenshots/escritorio-cargas-contenidos.png" width="620" alt="Training contents manager: predefined contents with colour, aliases and weekly targets"> | <img src="docs/screenshots/movil-cargas-contenidos.png" width="200" alt="Mobile training contents manager"> |

The week's sessions are listed in *Entrenamientos*, each with its plan, PDF, edit, duplicate and delete actions.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-entrenamientos.png" width="620" alt="Training sessions of the week with plan, PDF, edit, duplicate and delete buttons"> | <img src="docs/screenshots/movil-entrenamientos.png" width="200" alt="Mobile list of the week's training sessions"> |

### 3. Plan the week: the training plan editor

Open the **Plan** of any session to build it set by set (time, objective, blocks, series, distance, send-off, exercise, material, notes). Each exercise can have **several training contents and several strokes** (for example `4x100 Crol. 75 AeL-25 Tope`), distributed manually or automatically, and the **session summary** shows metres and percentages per content and per stroke. It can be copied as text and registered as loads.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-entreno-editor.png" width="620" alt="Training plan editor with the session summary by content and by stroke"> | <img src="docs/screenshots/movil-entreno-editor.png" width="200" alt="Mobile training plan editor"> |
| <img src="docs/screenshots/escritorio-entreno-editor-filas.png" width="620" alt="Plan rows with several contents and strokes per exercise and live totals per set"> | <img src="docs/screenshots/movil-entreno-editor-filas.png" width="200" alt="Mobile plan rows with content chips"> |

### 4. Plan the season and the pool

**Planificación > Temporada** manages the whole season: phases (macrocycles), weeks (Monday to Sunday) with planned volume split by content, week-by-week comparison with what was actually done (loads and training plans), A/B/C competitions and other events, an evolution chart, a timeline and adjustment suggestions.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-temporada.png" width="620" alt="Season planning: indicators, suggestions and phases"> | <img src="docs/screenshots/movil-temporada.png" width="200" alt="Mobile season planning: indicators"> |
| <img src="docs/screenshots/escritorio-temporada-grafico.png" width="620" alt="Chart of planned volume and real loads per week with phases and competitions, plus the timeline"> | <img src="docs/screenshots/movil-temporada-grafico.png" width="200" alt="Mobile list of weeks with planned and real mini-bars"> |
| <img src="docs/screenshots/escritorio-temporada-semanas.png" width="620" alt="Week-by-week summary table of the season"> | <img src="docs/screenshots/movil-temporada-detalle.png" width="200" alt="Mobile detail of the current week: planned against real"> |
| <img src="docs/screenshots/escritorio-temporada-detalle.png" width="620" alt="Detail of the current week: planned against real per content and the week's training plans"> | |

**Planificación > Piscina** organises the pool: several pools with lanes, schedule per day and capacity; courses are assigned to lanes and hours (weekly or one-off) and conflicts are detected (lane, group, coach, schedule, capacity).

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-piscina.png" width="620" alt="Weekly view of the pool: assignments per day with lanes, coach and occupancy"> | <img src="docs/screenshots/movil-piscina.png" width="200" alt="Mobile pool planning"> |
| <img src="docs/screenshots/escritorio-piscina-conflictos.png" width="620" alt="Daily lane grid and the conflicts panel with a warning about a session without coach"> | <img src="docs/screenshots/movil-piscina-conflictos.png" width="200" alt="Mobile lane grid and conflicts panel"> |

### 5. Generate the training PDF

From the list of sessions or from the plan editor you can **download**, **preview**, **print** or **save to Drive** (`cnl/entrenos/`) an A4 landscape PDF of one session or of the whole week. This is the first page of a generated PDF, rendered from the real file:

<img src="docs/screenshots/escritorio-entreno-pdf.png" width="820" alt="First page of the generated training PDF: day, time, group, session type, pool, material, sets table and summary by content and stroke">

### 6. Calendar and export

The calendar has **Month / Week / Agenda** views, a colour per group, and filters by group and pool. Events are the sessions plus the lane assignments of the pool planning and the club events of the season (competitions and others). Export it as `.ics` for Apple, Outlook or Google, or sync it to Google Calendar.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-calendario-mes.png" width="620" alt="Calendar, month view, with the sessions of each day colour-coded by group"> | <img src="docs/screenshots/movil-calendario-mes.png" width="200" alt="Mobile calendar, month view"> |
| <img src="docs/screenshots/escritorio-calendario-semana.png" width="620" alt="Calendar, week view"> | <img src="docs/screenshots/movil-calendario-semana.png" width="200" alt="Mobile calendar, week view"> |
| <img src="docs/screenshots/escritorio-calendario-agenda.png" width="620" alt="Calendar, agenda view"> | <img src="docs/screenshots/movil-calendario-agenda.png" width="200" alt="Mobile calendar, agenda view"> |
| <img src="docs/screenshots/escritorio-calendario-exportar.png" width="620" alt="Export the calendar as .ics and synchronise with Google Calendar"> | <img src="docs/screenshots/movil-calendario-exportar.png" width="200" alt="Mobile export and Google Calendar sync panels"> |

### 7. The rest of the club

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-nadadores.png" width="620" alt="Swimmers list with filters by category and group"> | <img src="docs/screenshots/movil-nadadores.png" width="200" alt="Mobile swimmers list"> |
| <img src="docs/screenshots/escritorio-nadador-ficha.png" width="620" alt="Swimmer profile with category rule, attendance statistics, loads and personal bests"> | <img src="docs/screenshots/movil-nadador-ficha.png" width="200" alt="Mobile swimmer profile"> |
| <img src="docs/screenshots/escritorio-nadador-formulario.png" width="620" alt="New swimmer form: the category is calculated automatically from the birth date"> | <img src="docs/screenshots/movil-nadador-formulario.png" width="200" alt="Mobile new swimmer form with the automatic category"> |
| <img src="docs/screenshots/escritorio-grupos.png" width="620" alt="Training groups and their swimmers"> | <img src="docs/screenshots/movil-grupos.png" width="200" alt="Mobile training groups"> |
| <img src="docs/screenshots/escritorio-marcas.png" width="620" alt="Personal bests per event and pool length"> | <img src="docs/screenshots/movil-marcas.png" width="200" alt="Mobile personal bests"> |
| <img src="docs/screenshots/escritorio-marcas-evolucion.png" width="620" alt="Evolution chart of a swimmer in one event and the history of times"> | <img src="docs/screenshots/movil-marcas-evolucion.png" width="200" alt="Mobile evolution chart of a swimmer"> |
| <img src="docs/screenshots/escritorio-comunicaciones.png" width="620" alt="Notices and notes for the whole club or for one group"> | <img src="docs/screenshots/movil-comunicaciones.png" width="200" alt="Mobile notices and notes"> |

### 8. Settings and tutorial

Club identity (name, motto, logo and colours), season categories, the training contents catalogue, where the data lives in Drive, Excel backup, preferences and data protection.

| Desktop | Mobile |
|---|---|
| <img src="docs/screenshots/escritorio-club.png" width="620" alt="Settings: club identity, name, motto, logo and colours"> | <img src="docs/screenshots/movil-club.png" width="200" alt="Mobile club settings"> |
| <img src="docs/screenshots/escritorio-club-categorias.png" width="620" alt="Settings: categories of the 2026-2027 season with birth years, change of season and recalculation"> | <img src="docs/screenshots/movil-club-categorias.png" width="200" alt="Mobile season categories"> |
| <img src="docs/screenshots/escritorio-club-drive.png" width="620" alt="Settings: where the data is stored in Drive, Excel export and import, preferences, clubs"> | <img src="docs/screenshots/movil-club-drive.png" width="200" alt="Mobile Drive storage settings"> |
| <img src="docs/screenshots/escritorio-tutorial.png" width="620" alt="Built-in tutorial"> | <img src="docs/screenshots/movil-tutorial.png" width="200" alt="Mobile tutorial"> |

### 9. Languages and dark mode

The language is chosen from the selector in the header and saved in your Drive preferences. The theme can be automatic, light or dark.

| English (desktop) | Italian (desktop) |
|---|---|
| <img src="docs/screenshots/escritorio-inicio-en.png" width="400" alt="Home screen in English"> | <img src="docs/screenshots/escritorio-entrenamientos-it.png" width="400" alt="Training sessions in Italian"> |

| English (mobile) | Dark mode (mobile) | Dark mode (desktop) |
|---|---|---|
| <img src="docs/screenshots/movil-temporada-en.png" width="180" alt="Season planning in English on a phone"> | <img src="docs/screenshots/movil-inicio-oscuro.png" width="180" alt="Home screen in dark mode on a phone"> | <img src="docs/screenshots/escritorio-inicio-oscuro.png" width="420" alt="Home screen in dark mode on desktop"> |

## Features

| Module | What it does |
|---|---|
| **Home** | Summary: quick access, weekly loads against targets, alerts, next session, today's attendance and recent notices |
| **Swimmers** | Create, edit and individual profile; category computed from birth year and season (from Pre-Benjamín to Master, with manual category and master licence) and groups |
| **Groups** | Training groups and their swimmers |
| **Training** | Weekly planning: pool, target volume, focus, planned/done status. **Detailed training plan** by sets (time, objective, blocks, series, distance, send-off, exercise, material, notes) with live totals, templates and copy from other sessions; **several contents and strokes per exercise** (`4x100 Crol. 75 AeL-25 Tope`) with manual or automatic distribution (metres per repetition or %), autocomplete from the text with editable aliases, and a **session summary** with metres and % per content and per stroke (copyable and registrable as loads); and the **training PDF** (A4 landscape) of one session or of the whole week: download, preview, print and save to `cnl/entrenos` in Drive |
| **Calendar** | Month / Week / Agenda with filters by group and pool; `.ics` export (Apple, Outlook, Google) and optional Google Calendar sync |
| **Planning** | Two sections. **Season** (default): phases (macrocycles) and weeks (Monday to Sunday) with planned volume and split by content, week-by-week comparison with the real figures (loads and training plans), A/B/C competitions and other events (also shown in the Calendar and the `.ics`), evolution chart, timeline and adjustments with suggestions. **Pool**: several pools with lanes, schedule per day and capacity; assigns courses to lanes and hours (weekly or one-off), detects conflicts (lane, group, coach, schedule, capacity), suggests a distribution, day/week view and printing |
| **Attendance** | Take attendance from your phone with one tap; history and percentage per swimmer |
| **Loads** | Metres per training content (predefined catalogue of intensities and specific work, plus your own), optional session, RPE and minimum/maximum targets with alerts |
| **Personal bests** | Times mm:ss.cc, best times and evolution per event (25 m / 50 m) |
| **Swimsuit-aware marks** | A club catalogue of swimsuits (training suits and competition fast skins, with brand and model); each time can record the suit it was set with, and the times can be filtered by suit type, brand and model |
| **Notices & notes** | Your own notices and notes for the whole club or per group, saved in your Drive; copy the text to pass it on through your usual channel (the app sends nothing to anyone) |
| **Settings** | Club name, motto, logo and colours; season categories; training contents; where the data lives in Drive; Excel export and import (for spreadsheets); **Backup** (complete, lossless copy: download, optional passphrase encryption, restore with preview, copies in Drive); preferences; switch club |

## Season categories

The category is **calculated, not typed**: from the **year of birth** (not the month) and the **sex**, for the **current season** (it starts on 1 September and is identified by its starting year: 1-9-2026 to 31-8-2027 is season 2026-2027). With `age = season start year - birth year`, the default table is:

| Category | Age | Born in season 2026-2027 |
|---|---|---|
| Pre-Benjamín | 8 | 2018 |
| Benjamín | 9-10 | 2016-2017 |
| Alevín | 11-12 | 2014-2015 |
| Infantil | 13-14 | 2012-2013 |
| Junior | 15-17 | 2009-2011 |
| Absoluto | 18 or more | 2008 and earlier |
| Master | 25 or more **and master licence** | 2001 and earlier, only with the *Licencia máster* box ticked |

- The ranges come from the calculation and shift on their own when the season changes (in 2027-2028 Pre-Benjamín are those born in 2019). A swimmer younger than the table gets Pre-Benjamín with a warning. The RFEN rule can vary by sex or season: in *Configuración* you can edit the age table per sex and the minimum Master age.
- **Manual category**: when creating or editing a swimmer, the *Categoría manual* switch fixes a specific category that overrides the calculation and does not change with the season (flagged with a *manual* badge).
- **Season change**: categories update themselves when the club is opened in a new season (the last applied one is stored in `temporadaAplicada`). In *Configuración > Categorías de la temporada* you can set another season with *Cambiar de temporada*, which **previews who changes category** and applies after confirmation, or run *Recalcular categorías* on demand. `Nadadores.categoria` always holds the current category (the rest of the app reads that field).

## Storage: Google Drive

Everything lives in the **`cnl`** folder of your Google Drive, with **a single permission**: `drive.file` (the app only sees the files it creates itself; it is not a sensitive scope and needs no Google verification). The Google Sheets API is not used.

| Where | What it stores |
|---|---|
| `cnl/<Club>.json` | All data and settings of the club: identity, motto, colours, logo, time zone, swimmers, groups, sessions, attendance, loads, personal bests, contents catalogue, pools, seasons... One per club. |
| `cnl/preferencias.json` | Your preferences: language, last club opened, tutorial progress, calendar view and reminder, and the Google Calendar sync map. Schema-versioned, merged per key. |
| `cnl/entrenos/` | Training PDFs saved from the app. |
| `cnl/backups/` | Daily copy (last 14), one before every Excel import and one before every backup restore (last 5 each). |
| `cnl/<Club>.xlsx` | Optional Excel backup (*Configuración > Guardar copia Excel en Drive*). |
| localStorage | Only a **cache and mirror** (fast start and offline use, with a queue of pending changes). Never the source of truth. Also: the owner's test Client ID and the dismissed install prompt (per-device preferences). |

### Backup (Settings > Backup)

A complete, lossless safety copy of the club in ONE file, separate from the Excel export (which stays for spreadsheets).

- **Download backup**: all sheets (including any this version does not know), the club identity and rules, and your user preferences (language, theme, calendar view). Optional **passphrase**: the file is encrypted on your device (AES-256-GCM, key derived with PBKDF2-SHA256); without the passphrase it cannot be opened and there is no recovery. The file name is `cnl-backup-<club>-YYYY-MM-DD-HHMM.json`. The panel remembers when you last downloaded one.
- **Restore from a file** (or drop it on the panel): the file is checked (format, version, integrity checksum), you see per sheet what would be new, different or removed, and you choose **Replace** (exactly the backup, recommended) or **Merge** (adds what is missing; your current values win; nothing is removed). Replace asks you to type the club name or `RESTORE`. A damaged, tampered or newer-version file is refused with a clear message and nothing changes.
- **Always safe**: before applying anything the app saves an automatic copy of your current data (`cnl/backups/<club>-restore-*.json` in Drive; in demo mode it is kept for the session and offered as a download). If that copy cannot be saved, nothing is restored. **Revert the restore** (and the Undo toast) put everything back for as long as the session lasts.
- **Backups in Drive**: lists the daily, pre-import and pre-restore copies in `cnl/backups/` and restores or deletes them. Disabled (with an explanation) in demo mode.
- A backup holds **personal data of minors**: keep it somewhere safe. Copies you download are not touched when a swimmer is erased in the app, and rows erased for good are not brought back by a restore.

The full "where each piece of data lives" table is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Changes are saved with debounce and merged per field if another device changed the file (detected with `md5Checksum`/`modifiedTime` and Drive's `version`; if someone wrote in between, their revision is fetched and merged). The Google token lives only in memory; without a network, changes wait in a queue and are uploaded when you are back online. If you already had a hand-made `cnl` folder, the app creates and uses its own (with `drive.file` it cannot see the other one): you can move your files from Drive.

Google setup (5 minutes, once): [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md).

**Calendar export and sync.** The `.ics` file (RFC 5545) covers the visible month, the season (1 Sep - 31 Aug) or the next 90 days, with an optional 30/60 minute reminder. It is a **snapshot**: a live URL subscription is impossible without a server, so export again to refresh (UIDs are stable, `<id>@cnl-plataforma`, so re-importing updates instead of duplicating). The club time zone is stored as `zonaHoraria` (default `Europe/Madrid`) and the file includes a generated `VTIMEZONE`. Google Calendar sync asks incrementally for the `calendar.events` scope, performs an idempotent upsert in your primary calendar (events marked with `extendedProperties.private.cnlId`) and reports created/updated/deleted/errors, with a *Dejar de sincronizar* option.

## Languages

The interface is available in **Spanish, English and Italian** (`js/presentation/i18n/locales/`, covered by dictionary parity tests). The language is selected in the header, stored in `cnl/preferencias.json` and mirrored in localStorage so the first paint already uses it. The exact UI strings in the screenshots are the Spanish ones, plus the English and Italian examples above.

## Accessibility and design

Own design system (no UI libraries): tokens in `css/tokens.css`, components in `css/components.css` and helpers in `js/presentation/ui.js` (`field`, `sheet`, `toast.undo`, `empty`, `fieldError`...). Light, dark or automatic theme (`js/presentation/theme.js`, saved in the Drive preferences), club colour with guaranteed AA contrast, visible focus, skip link, 44 px touch targets, inline validation with `aria-invalid`, live regions for totals and statuses, and CSP + SRI. On phones the app uses a bottom navigation bar and cards instead of wide tables. The contract and markup examples are in [docs/DESIGN.md](docs/DESIGN.md). The interface is being redesigned, so the screenshots in this README may differ slightly from the latest version until they are regenerated.

## Architecture

100% static PWA (no server, no build): JavaScript with ES modules, SheetJS for Excel, jsPDF for PDFs and hand-made SVG for the charts. The contract between modules is detailed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
index.html · manifest.webmanifest · sw.js
css/  tokens.css app.css components.css
js/main.js  (entry point)   js/composicion/ (composition root: wires adapters into services)
js/domain/ (pure logic)  js/application/ (services + ports)  js/infrastructure/ (Drive, cache, Excel, PDF...; fakeGoogle.js = test tool)
js/presentation/ (shell, ui, router, theme, i18n/ + locales/)
js/presentation/views/  acceso (start screen, wizard, configuration needed) inicio nadadores grupos entrenamientos planificacion calendario asistencia cargas marcas comunicaciones club tutorial
vendor/  xlsx.full.min.js  jspdf.umd.min.js  jspdf.plugin.autotable.min.js   (generated from npm; jsPDF is loaded lazily, only when a PDF is requested)
scripts/  serve.mjs check.mjs check-arch.mjs (layer rules) e2e.mjs capturas.mjs ...
```

## Development

```bash
npm install        # installs dependencies and copies SheetJS and jsPDF to vendor/
npm run check      # checks the syntax of the modules
npm run serve      # static server on http://localhost:4173 (or: python -m http.server 8080)
```

Connecting Drive needs a Google Client ID ([docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md)): paste it in `js/infrastructure/config.js` (`BUILTIN_CLIENT_ID`) or in the *Configuración necesaria* screen, and add your local origin to the authorised origins. Without real Google, the test tool (below) starts the app with a simulated Drive connection; the demo mode needs neither. **The demo is available only while no Google Client ID is set** (neither in `localStorage['cnl:clientId']` nor in `BUILTIN_CLIENT_ID`): once one exists the start screen offers only *Connect Google Drive* and a demo left open is closed with a notice and its data erased.

### Regenerating the screenshots

All images in `docs/screenshots/` are real captures of the app, generated by a script:

```bash
npx playwright install chromium     # first time only
npm run capturas                    # all of them (about 1-2 minutes)
npm run capturas -- --solo=inicio,asistencia            # only some (ids in ESCENARIOS, scripts/capturas.mjs)
npm run capturas -- --dispositivo=movil                 # only desktop (1366x850) or only mobile (390x844)
npm run capturas -- --concurrencia=2 --salida=docs/otra # parallel pages, other output folder
```

`scripts/capturas.mjs` starts `scripts/serve.mjs` on a free port and opens the app with Playwright using the simulated Google and the demonstration data, exactly as the E2E tests do. To make the images reproducible it fixes the clock (Wednesday 14 October 2026, 10:30), the time zone (`Europe/Madrid`) and the language, reduces motion, blocks the service worker and disables animations and the caret. Each capture runs in its own clean browser context, several in parallel. A capture is rejected (and not written) if the page logs console errors, returns 4xx/5xx responses, stays on "Cargando" or the PNG is suspiciously small, and the script exits with code 1. Files are named `<device>-<screen>.png` (`escritorio-` or `movil-`). The training PDF is generated by the app itself (its *PDF* button) and its first page is drawn with `pdfjs-dist` (dev dependency). To add a screen, add an entry to `ESCENARIOS` and reference the image from this README.

## Testing

| Level | Command | What it covers |
|---|---|---|
| Unit | `npm run test:unit` | Module logic (store, drive, auth, preferences, wizard, categories, loads, PDF...) with `node --test` and jsdom |
| Integration | `npm run test:integration` | Views and store working together on jsdom |
| E2E (Cucumber) | `npm run test:e2e` | Specifications in English Gherkin (`features/*.feature`) run with Playwright/Chromium on desktop and then on mobile (Pixel 5, `VIEWPORT=mobile`) |

**Tests without real Google.** `js/infrastructure/fakeGoogle.js` is an in-memory adapter that implements the same interfaces as `js/infrastructure/driveConnection.js` and `drive.js` (simulated connection, `cnl` folder, club file, `preferencias.json`, file upload) and demonstration data through `store.seedDemo`. It is a **test tool**, invisible to the user: it is only loaded with `localStorage['cnl:test'] = '1'` (or `window.__CNL_TEST__`). Options (JSON in `localStorage['cnl:test:opts']` or an object in `__CNL_TEST__`): `conectado` (start with Drive connected; old alias `sesion`), `demo` (simulated Drive that already holds a club with demonstration data; not the product demo mode), `sinClientId` (*Configuración necesaria* screen), `errorConexion` (old alias `errorLogin`) and `fallos` (forced errors). There is no user option: the app has no identity. `window.__CNL_FAKE__` lets you inspect the simulated Drive (`clubs()`, `prefs()`, `archivos()`). Unit and integration tests install it with `instalarFakeGoogle({conexion, drive, opciones})` (see `tests/helpers/app.js`); the E2E tests use the steps `Given a club with demo data` or `Given the app has just been opened without Drive connected`.

The E2E tests start the static server on a free port by themselves, begin from a clean browser with a simulated Drive connection (club with demonstration data or empty, depending on the scenario) and fail on console errors or 4xx/5xx responses. First time: `npx playwright install chromium`. Reports go to `reports/` (HTML, JUnit and screenshots of failures). Scenarios tagged `@google @pending` (they need a real Google account) are documented but excluded; `npx cucumber-js --tags @smoke` runs only the essential ones.

## Deployment

Every push to `main` runs [the workflow](.github/workflows/pages.yml) (`npm ci`, checks and deployment to GitHub Pages). It requires enabling *Settings > Pages > Source: GitHub Actions*.

## Dependencies

Managed with npm and updated weekly by [Dependabot](.github/dependabot.yml) (npm and GitHub Actions).

| Package | Use |
|---|---|
| `@e965/xlsx` (SheetJS) | Excel export, import and backup (copied to `vendor/`) |
| `jspdf`, `jspdf-autotable` | Training PDFs (copied to `vendor/`, loaded lazily) |
| `playwright` (dev) | E2E tests and the screenshot script |
| `@cucumber/cucumber` (dev) | Gherkin E2E specifications |
| `jsdom` (dev) | Unit and integration tests |
| `pdfjs-dist` (dev) | Draws the first page of the generated PDF for the README screenshot |

## Project status

First functional version. Pending: test the whole flow with a real Google account in production and keep refining the design module by module.
