---
name: nuevo-idioma
description: Adds a new UI language (besides es/en/it) to CNL Plataforma - dictionaries, selector, date and number formats, stored preference, PDF, service worker and parity tests. Use it when asked "add French/Catalan/Galician/Portuguese" or any new language, or to audit that a language is complete.
---

# New language

Example with `fr` (Français, `fr-FR`). Structure reference: `js/i18n.js`. Hand quality translation work to the `i18n` agent. Only the app's UI strings are translated; code comments, docs and commits stay in English, and stored values stay Spanish.

## 1. Dictionary inventory (each one needs its `fr`)

```bash
ls js/locales/*.es.js js/locales/es.js
```
Today: `es/en/it.js` (base), `vistas-a|b|c`, `planificacion`, `calendario`, `entreno`, `cargas-tipos`, `acceso`, `diseno`, `temporada`, `categorias`, `datos`. For every `X.en.js` create `X.fr.js` (`export default {...}`) with **exactly the same keys** as `X.es.js` and the same `{variables}`. The base `en.js` -> `fr.js`. Start by copying `en` and translate; leave no text in another language or empty (the test rejects it).

## 2. Code

1. `js/i18n.js`: import `fr` from every file; add the `fr: { ...fr, ...vistasAfr, ... }` branch in `DICTS` (same spread order as `es`); `LANGS.push({ code: 'fr', label: 'Français' })`; `INTL.fr = 'fr-FR'`.
2. `js/domain/preferencias.js`: `IDIOMAS = ['es', 'en', 'it', 'fr']` (otherwise the language preference saved in Drive is discarded as invalid).
3. `sw.js`: all the new `*.fr.js` files in `SHELL` and `VERSION` bumped.
4. `js/infrastructure/pdfEntreno.js` and `js/domain/calendario.js` receive texts/language by parameter from `entreno.fr.js`/`calendario.fr.js`: no new code, but check with a PDF and an `.ics` generated in `fr`.
5. `manifest.webmanifest` and `index.html` keep `lang: es` (JS changes `document.documentElement.lang`).

## 3. Translatable content names

`tc.<key>.nombre|desc` (content catalogue), `cat.*`, `estado.*`, `tipo.*`, `nav.*`: respect swimming terminology (see the `i18n` agent). **Never translate stored values** (they stay Spanish: 'Alevín', 'planificado'); only their display. Content aliases (AeL, Tope...) are not translated.

## 4. Tests

- `tests/unit/i18n.test.js`: extend the `for (const [name, d] of [['en', en], ['it', it]])` loops with `fr` (keys equal to `es`, variables equal) and the check that `LANGS` contains the expected languages.
- Per-module parity: `tests/unit/temporada-i18n.test.js`, the "vistas-a/b" and "cargas-tipos" blocks of `i18n.test.js`, `tests/unit/pdfEntreno.test.js` (entreno.*): include `fr`.
- `tDate('2026-10-15','long')` and `tNum(1234.5)` in `fr` (`Intl` format).
- Preferences: `tests/unit/preferencias.test.js` accepts `idioma: 'fr'`.
- Run `node --test tests/unit/i18n.test.js` and `npm run test:unit && npm run test:integration`.

## 5. e2e and screenshots

A minimal scenario: switch language with the `.lang-select` selector and check a translated heading (look at `features/acceso.feature`, `features/diseno-movil.feature` and `features/steps/diseno-pwa.steps.js` for existing language steps; write it with the `nuevo-escenario-cucumber` skill and run it by tag, e.g. `npx cucumber-js --tags "@smoke"`). Screenshot in French: scenario `{ id: 'inicio-fr', idioma: 'fr', locale: 'fr-FR', ... }` in `ESCENARIOS` of `scripts/capturas.mjs` (like `inicio-en`) and `npm run capturas -- --solo=inicio-fr`. Check overflow of longer texts on mobile (`ux-a11y` agent).

## 6. Docs

README (available languages), `docs/ARCHITECTURE.md` if the mechanism changes. Small commits: `feat(i18n): fr dictionaries`, `feat(i18n): register fr`, `test(i18n): fr parity`. Golden rule: check + unit + integration + relevant e2e before each commit; push when the milestone is done.
