# Design system

Contract for every view. Files: `css/tokens.css` (variables), `css/app.css` (shell), `css/components.css` (components), `js/presentation/ui.js` (helpers that generate the markup), `js/presentation/theme.js` (light/dark), `js/domain/tema.js` (club colour and contrast, pure logic).

Load order: `tokens.css` → `app.css` → `components.css`.

## Rules

1. **One `<h1>` per view**, inside `.page-head` (actions on the right). Blocks use `h2`/`h3`.
2. **Do not inject `<style>` in views.** Everything you need comes from the tokens and components; if something reusable is missing, add it to `components.css`. Old views with `<style>` keep working; block 11 of `components.css` (`!important`, temporary) keeps them readable in dark mode and will be deleted once none is left.
3. **No hard-coded colours** (`#fff`, `#1a73e8`...): use `var(--surface)`, `var(--text)`, `var(--c-accent)`... so dark mode and the club colour work on their own.
4. **Inline validation**: `fieldError(input, msg)` next to the field (red border, message with icon, `aria-invalid`, focus). Never `alert()` or native bubbles (`formFields().validate()` already does this).
5. **Tables** in `.table-wrap > .table`; on mobile use `.table--cards` with `data-label` on every `td`. Numbers with `class="num"` (right-aligned, tabular figures).
6. **Delete with Undo**: delete, then `toast.undo('… deleted', restore)` (6 s). For deletions that cannot be restored use `confirmDialog(msg, { danger: true })` (button «Delete», focus on Cancel).
7. **Empty states with a CTA**: `empty({ icon, title, text, action })`; never a blank screen or a loose paragraph.
8. **Forms and dialogs in `sheet()`** (bottom sheet on mobile). Visible labels on every field (`field()`/`formFields()`).
9. **Status = colour + icon or dot + text** (`badge`, `alert`); never colour alone.
10. **No emojis**: icons from `js/presentation/icons.js` (`icon('name')`, `currentColor`).
11. **44 px** touch targets on mobile (the components already comply); text never below 12 px.
12. All UI text through `t('key')` (es/en/it). Code, comments and docs are in English.

## Tokens

| Group | Variables |
|---|---|
| Surfaces | `--bg` `--surface` `--surface-2` `--text` `--muted` `--border` (decorative) `--field-border` (controls, ≥ 3:1) `--overlay` |
| Semantic | `--ok` `--warn` `--danger` `--info` `--neutral` and their tinted backgrounds `--ok-bg`… (color-mix); `--on-danger` |
| Brand (club) | `--c-primary` `--c-secondary` (the chosen ones; lightened in dark mode), `--c-action` + `--c-on-primary` (primary button: white or #111 text with ≥ 4.5:1), `--c-accent` (text/link/focus), `--c-heading`, and derived `--c-primary-soft/-mid/-dark` |
| Spacing | `--sp-1..6` = 4 / 8 / 12 / 16 / 24 / 32 px |
| Radii | `--r-sm` 8, `--r-md` 12, `--r-lg` 16, `--r-pill` |
| Shadows | `--shadow-1/2/3` |
| Typography | `--fs-h1` 1.5rem/700, `--fs-h2` 1.125rem/650, `--fs-h3` 1rem/600, body 1rem, `--fs-sm` .875rem, `--fs-xs` .75rem (minimum). Figures: `.num` / `font-variant-numeric: tabular-nums` |
| Control | `--control-h` 40 px (44 px on mobile or touch pointers), `--touch` 44 px |

**Theme.** Light by default; `[data-theme="dark"]` forces dark and `prefers-color-scheme: dark` enables it unless `[data-theme="light"]`. `setTheme('auto'|'light'|'dark')` (`js/presentation/theme.js`) sets the attribute, mirrors it in `localStorage['cnl:tema']` (read by `js/presentation/theme-boot.js` before first paint: no flash) and stores it in the Drive preferences (key `tema`). `themeSelect()` is the ready-made selector. `onThemeChange(fn)` also fires when the system theme changes.

**Club colour.** `aplicarTema()` (`js/presentation/shell/themeApply.js`) calls `variablesTema({primario, secundario}, mode)`: it validates (only `#rgb`/`#rrggbb`; anything else falls back to the default blue), keeps the colour as chosen in light mode and guarantees ≥ 4.5:1 for the primary button, links and headings (darkening/lightening just enough). Use `--c-action`/`--c-on-primary` for brand-coloured backgrounds and `--c-accent`/`--c-heading` for text; avoid `--c-primary` as a text colour in new code.

## Components (markup)

```html
<!-- Page header -->
<header class="page-head"><h1>Swimmers</h1>
  <div class="page-head-actions"><button class="btn btn--primary">New swimmer</button></div></header>

<!-- Buttons: .btn (secondary) | --primary | --secondary | --ghost | --danger ; .btn-sm .btn-lg .btn-icon ; disabled ; aria-busy="true" = loading -->
<button class="btn btn--primary"><svg class="icon">…</svg> Save</button>
<button class="btn btn-icon btn--ghost" aria-label="Edit">…</button>

<!-- Field (field() helper) -->
<div class="field">
  <label class="field-control"><span class="field-label">Licence <span class="req" aria-hidden="true">*</span></span><input aria-describedby="f1-hint f1-err" aria-invalid="true"></label>
  <p class="hint" id="f1-hint">As on the federation card</p>
  <p class="field-error" id="f1-err"><svg class="icon">…</svg><span>Licence is missing</span></p>
</div>
<label class="check"><input type="checkbox"> Show inactive</label>

<!-- Filters: inline on desktop, 2 columns on mobile -->
<div class="filters"><div class="field grow">…</div><div class="field">…</div><label class="check">…</label></div>

<!-- Badge (automatic dot) / chip / alert -->
<span class="badge badge--ok">Present</span>   <!-- --ok --warn --danger --info --neutral -->
<button class="chip" aria-pressed="true">Under-12</button>
<div class="alert alert--warn" role="alert"><svg class="icon">…</svg><div><p class="alert-title">Volume missing</p><p>800 m below the minimum</p></div></div>

<!-- Card, stat, avatar, progress -->
<section class="card"><div class="card-head"><h2>Summary</h2><button class="btn btn-sm">See all</button></div>…</section>
<div class="stat"><span class="stat-value">12</span><span class="stat-label">Swimmers</span><span class="stat-delta stat-delta--up">+2 this month</span></div>
<span class="avatar" aria-hidden="true">MS</span>
<div class="progress progress--ok" role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100" style="--value:40%"><span></span></div>

<!-- Table: cards on mobile -->
<div class="table-wrap"><table class="table table--cards">
  <thead><tr><th>Name</th><th class="num">Age</th><th></th></tr></thead>
  <tbody><tr><td data-label="Name">Lucía</td><td data-label="Age" class="num">8</td><td class="actions">…</td></tr></tbody></table></div>

<!-- Empty state (empty() helper) -->
<div class="empty"><div class="empty-icon"><svg class="icon">…</svg></div><p class="empty-title">No swimmers yet</p><p class="empty-text">Add the first one.</p><button class="btn btn--primary">New swimmer</button></div>

<!-- Tabs and segmented control -->
<div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true">Month</button>…</div>
<div class="segmented" role="group" aria-label="View"><button aria-pressed="true">Month</button><button>Week</button></div>

<!-- Skip link (index.html) -->
<a class="skip-link" href="#view">Skip to content</a>
```

## `js/presentation/ui.js` helpers

| Function | Use |
|---|---|
| `field({label, input, hint, error, required})` | Complete field: the label wraps the control; hint and error are linked |
| `fieldError(input, msg)` / `clearFieldError(input)` | Inline error, `aria-invalid`, focus; cleared on edit |
| `formFields(def, values)` | Definition-driven form; `validate()` marks inline errors and focuses the first one |
| `sheet({title, body, actions, onClose})` | Accessible dialog (`role="dialog"`, `aria-labelledby/-describedby`), focus trap with `inert`, Escape, returns focus, locks and restores scroll even on exceptions. `actions: [{label, primary, danger, autofocus, onClick(close)}]`; `onClick` returning `false` keeps it open |
| `modal(...)` | Historical alias of `sheet` (same options; keeps `.modal`, `.modal-overlay`, `.modal-actions`) |
| `confirmDialog(msg, {danger, okLabel})` | `Promise<boolean>`; initial focus on Cancel; destructive = «Delete» |
| `toast(msg)`, `toast.error(msg)`, `toast.undo(msg, onUndo, {timeout: 6000})` | `role="status"` (errors `role="alert"`), 5–6 s, paused by pointer/focus on their buttons. Toasts never cover what is underneath: only their buttons receive pointer events |
| `empty({icon, title, text, action})` | Empty state |
| `badge(text, tone)`, `avatar(name)`, `iniciales(name)` | Small pieces |
| `parseTime(str)`, `maskTime(str)`, `timeInput(input)` | Times with a numeric mask: `10245` → `1:02.45` (still accepts `1:02.34`, `62.34`) |

## Security and PWA

- **CSP** (meta in `index.html`): `default-src 'none'`, scripts only from self + Google Identity; no `unsafe-inline` for scripts (hence `js/presentation/theme-boot.js` is a file). Injected `<style>` needs `'unsafe-inline'` for styles until the views are migrated.
- **SRI**: `scripts/vendor.mjs` generates `vendor/integrity.json` (sha384); `js/infrastructure/vendorIntegridad.js` (`integridad(name)`) applies it to `jsPDF`/`autotable` (`pdfEntreno.js`) and SheetJS (`lazy.js`). Any new `vendor/` script must be loaded the same way. Google Identity does not support SRI.
- **Icons**: `scripts/iconos.mjs` generates `apple-touch-icon.png` (180, opaque) and `icon-maskable-512.png` (motif inside the safe zone).
- When adding new CSS/JS files run `npm run build:sw` (the precache list and `VERSION` are generated from the disk; `npm run check` fails if they are stale).

## Shell (header, navigation, banners)

Files: `css/app.css`, `js/presentation/shell/*.js`. The markup uses the shared components (`.alert`, `.btn`, `.icon-btn`, `.sheet`, `.lang-switch`); only the page structure is in `app.css`.

- **Header** (`.topbar`): one 56 px row on mobile (logo, club name, notices bell, settings/connection button); on desktop it also shows the motto. There is no user identity anywhere: no name, e-mail or avatar.
- **Settings and connection menu** (`.account-btn` + `.account-panel`, a disclosure: Tab walks into the panel, Escape and outside clicks close it): language (`langSwitch`), theme (`themeSelect`), Drive status row (coloured icon + text, 44 px, press to sync) and "Disconnect Drive" (asks for confirmation). In demo mode the status reads "Demo mode" and the actions are "Connect Google Drive" and "Exit demo".
- **Navigation**: one `<nav class="sidebar">`. Desktop: Home + three groups with headers (People, Training, Club). Mobile (<= 820 px): bottom bar with Home, Training, Attendance, Calendar and **More**, which opens a bottom `sheet` with the same three groups minus what the bar already shows. Model in `navModel.js`. Active item = soft background + 3 px bar (left in the sidebar and in the sheet, top in the bottom bar), `aria-current="page"`; never a solid block. Routes that moved keep working (`#/banador` -> `#/marcas`).
- **Banners** (`#cnl-avisos`, under the header, `.alert` component): demo mode (persistent, with its two buttons), new version available ("Reload"), offline (navigator.onLine) and the data-integrity notices. They are only repainted when their content changes.
- **Route change accessibility**: `document.title` = "View · Club", focus moves to the view's `h1` (or `#view`) unless the view already focused a control, a polite live region (`#route-announcer`) announces the title, the skip link focuses `#view`.
- **Footer** (`footer.footer`): only at the end of Settings.
- **Service worker**: see `docs/ARCHITECTURE.md` (Shell and PWA).

## Pending for other work

- **Views**: migrate their `<style>` blocks to the components and remove block 11 of `components.css`.
