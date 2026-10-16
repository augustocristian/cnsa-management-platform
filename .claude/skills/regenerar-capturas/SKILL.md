---
name: regenerar-capturas
description: Regenerates the real application screenshots in docs/screenshots with `npm run capturas` (Playwright, simulated Google, fixed clock) and adds new screenshot scenarios to scripts/capturas.mjs. Use it after any visible UI change, when a new view needs a README screenshot, or when screenshots are stale or fail. Trigger examples - "regenerate the screenshots", "add a screenshot of the injuries view", "the README images are outdated", "capture the season view in dark mode".
---

# Regenerate screenshots

`scripts/capturas.mjs` starts `scripts/serve.mjs` on a free port, opens the app with Playwright/Chromium using the simulated Google (`js/infrastructure/fakeGoogle.js`, `localStorage['cnl:test']`) and the demo data (`store.seedDemo`), exactly like the e2e. Output: `docs/screenshots/<device>-<id>.png`, where device is `escritorio` (1366x850, scale 1) or `movil` (390x844, scale 2, touch).

Reproducibility is built in: fixed clock (Wednesday 14-Oct-2026 10:30 Madrid), time zone `Europe/Madrid`, Spanish unless the scenario says otherwise, reduced motion, no service worker, animations and caret disabled. A screenshot is **rejected and not written** if there are console errors, 4xx/5xx responses, the view is still "Cargando", or the PNG is suspiciously small (< 6000 bytes); the process exits with code 1 if any fails. Files heavier than 250 KB (`MAX_KB`) are flagged.

## Commands (verified in the script header)

```bash
npm run capturas                                  # all scenarios, desktop and mobile (4 pages in parallel)
npm run capturas -- --solo=inicio,asistencia      # only some ids (comma separated)
npm run capturas -- --dispositivo=movil           # only mobile (or escritorio)
npm run capturas -- --concurrencia=2              # fewer parallel pages (slow machines)
npm run capturas -- --salida=C:/tmp/shots         # other output folder (to compare before overwriting)
```
First time on a machine: `npx playwright install chromium`. The PDF screenshot (`entreno-pdf`) renders page 1 of the app's own PDF with `pdfjs-dist` (devDependency).

## Add a scenario for a new view

In `ESCENARIOS` of `scripts/capturas.mjs` add an entry (keep the section comments):

```js
{ id: 'lesiones', titulo: 'Lesiones: registro por nadador', opciones: DEMO, ruta: 'lesiones',
  paso: async (p) => {                                    // optional: interaction before the shot
    await boton(p, /Nueva lesión/).click();
    await p.locator(DIALOGO).last().waitFor();
  } },
```
- `opciones`: `DEMO` (club with demo data), `VACIO` (empty club, first run) or `SIN_SESION` (login screen). `ruta` is the hash route without `#/` (e.g. `nadadores/n06`, `planificacion`). `sinShell: true` for pre-shell screens (login, wizard).
- Optional `idioma` (`'en'`, `'it'`) with `locale`, `tema: 'dark'`, `dispositivos: [...]` to restrict devices (see `inicio-en`, `inicio-oscuro`).
- Helpers inside the script: `boton(p, name)`, `estable(p)` (waits for loading to end, fonts ready), `DIALOGO`, `desplazar(...)`, `abrirPlan(...)`. Prefer waiting on a visible condition to a fixed delay.
- Keep `id` stable: the file name and the README links depend on it.

## Workflow

1. Make the UI change first; run `npm run capturas -- --solo=<ids>` for the affected scenarios (fast), then open the PNGs with `Read` and judge them: nothing cut off, no loading states, no console noise, light/dark correct, no real personal data (demo data only).
2. If a capture fails, read the message: console/HTTP error = real app bug (fix the app, not the script); "Cargando" = add a wait; small PNG = blank page.
3. Update the README: a table row referencing both `docs/screenshots/escritorio-<id>.png` and `docs/screenshots/movil-<id>.png` (agent `documentacion`).
4. Before a release regenerate everything once (`npm run capturas`) and review the diff in size and appearance; keep each PNG <= 250 KB.
5. Commit only the screenshots that really changed, with explicit paths: `docs: refresh <view> screenshots`. Do not commit `reports/`.
6. Never use real swimmers' data in a screenshot.
