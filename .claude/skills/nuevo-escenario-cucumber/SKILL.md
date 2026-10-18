---
name: nuevo-escenario-cucumber
description: Writes and runs end-to-end Cucumber scenarios (English Gherkin, Playwright, simulated Google) for CNL Plataforma - feature files, step definitions, tags, mobile profile and failure diagnosis. Use it when a flow needs e2e coverage, e.g. "add scenarios for deleting a swimmer", "e2e for the new injuries view", "write a @smoke for the calendar export".
---

# New Cucumber scenario

The e2e suite lives in `features/*.feature` (Gherkin), `features/steps/*.steps.js` (steps) and `features/support/{world,hooks}.js` (browser world). Gherkin is written in **English** (`# language: en`, `Feature`, `Background`, `Scenario`, `Scenario Outline`, `Given/When/And/Then`). The strings the scenarios type or assert are the app's **UI texts** (Spanish by default in tests: `localStorage['cnl:lang']='es'`), so quoted values such as `"Nuevo nadador"` or `"Guardar"` stay in the UI language while the step sentence is English.

## 1. Check what already exists

```bash
grep -hn "^\(Given\|When\|Then\)(" features/steps/*.js | cut -c1-140
```

Reuse the common steps (`features/steps/comunes.steps.js`: club with demo data / empty club / Drive not connected (more starts in `conexion.steps.js`: `a club with Drive connected and demo data`, `an empty club with Drive connected`, `the app has just been opened without Drive connected`; the older wordings `the app has just been opened without a session` and `the app is open without a Google Client ID` also exist and are widely used), open a module, press a button, fill a field, choose in a select, see text/heading/toast, accept confirmation...) **using their exact current wording** (copy the sentence from the step file, do not guess). Step definitions are global across files: a second definition with the same text makes Cucumber fail with "Multiple step definitions match" - if you need a step that already exists elsewhere, move it to `comunes.steps.js` instead of duplicating it.

## 2. Write the feature (template `feature.tpl`)

- First lines: `# language: en`, then the **area tag** (`@<area>`, English: `@season`, `@swimmers`, `@training-pdf`...), then `Feature:`. The area tag is what lets you run only this area (see 4); give new features one, e.g. `@injuries`. Tags in use: `@home @swimmers @attendance @loads @times @club @communications @season @planning @calendar @categories @swimsuits @training @training-pdf @training-contents @training-demo @trainings @backup @data-integrity @single-user @demo @access @tutorial @pwa @navigation @theme @design @accessibility @toasts @sheet`.
- `Background:` with `Given a club with demo data` (or the empty-club Given for first-run flows).
- One `@smoke` scenario per area with the happy path; further scenarios for validation, deletion with Undo, empty state, and mobile-specific behaviour. Tag desktop-only scenarios `@desktop` (excluded from the mobile profile); scenarios needing a real Google account `@google @pending` (documented but excluded by `cucumber.js`; none exist today).
- Each scenario independent and **date-independent**: use relative-date steps (e.g. the "date N days from now" step defined in `features/steps/temporada.steps.js`, helper `localDate`) and the demo data, which is seeded relative to today. Never hard-code a calendar date whose meaning changes with the season.
- One business behaviour per scenario; Gherkin describes behaviour from the coach's point of view, not CSS selectors.

## 3. Write the steps (template `steps.js.tpl`)

- File `features/steps/<area>.steps.js`; import `{ Given, When, Then } from '@cucumber/cucumber'` and `assert from 'node:assert/strict'`.
- Use the world helpers from `features/support/world.js`: `this.page` (Playwright page), `this.view` (the `#view` locator), `this.goTo(route)`, `this.eventually(async () => assert...)` (retry until true), `this.expectVisible(locator, msg)`, `this.expectHidden(...)`, `this.fill(scope, label, value)`, `this.fillTable(...)`, `this.scope()` (open dialog or the view), `this.drive()` (inspect the simulated Drive), `this.openApp(options)` / `this.enterClub({ demo })`.
- Prefer accessible locators (`getByRole`, `getByLabel`, `getByText`). Never `waitForTimeout`. Menu labels map to routes in `MODULES` of `features/support/world.js`: add the new module there.
- A scenario fails automatically on console errors or 4xx/5xx responses (hooks); so a green scenario also proves a clean console.

## 4. Run

`npm run test:e2e` runs everything (desktop then mobile, 8-10 min: background it). To run only your area **use its tag** (a bare feature path, even `file.feature:12`, is merged with `cucumber.js` `paths` and still runs ALL scenarios; `--tags` replaces the configured exclusions, which only matter if you add `@google`/`@pending` scenarios):

```bash
npx cucumber-js --tags @lesiones
VIEWPORT=mobile npx cucumber-js --tags "@lesiones and not @desktop"   # PowerShell: $env:VIEWPORT='mobile'; npx cucumber-js ...
npx cucumber-js --tags @lesiones --dry-run                           # parse check / count, runs nothing
npx cucumber-js --tags @smoke                                        # all essential scenarios (62)
npx cucumber-js --name "part of a scenario name"                     # by name
```

First time on a machine: `npx playwright install chromium`. Reports in `reports/` (`cucumber.html`, `cucumber.xml`, `reports/screenshots/*.png` for failures). `npm run e2e:resumen` prints a Markdown summary of the JUnit files.

## 5. Diagnose

Read the failing step message, the screenshot in `reports/screenshots/`, and run the scenario in mobile too. Classify: product bug / brittle step (selector, timing, date) / changed demo data / ambiguous step / parallel work-in-progress of another agent. Fix the cause; do not add `retry` or relax assertions.

## 6. Finish

`npm run check`, the area in both viewports, the unit + integration suites, then commit `test(<area>): e2e scenarios for ...`. Update the "Tests" section of the README only if the way of running changed.
