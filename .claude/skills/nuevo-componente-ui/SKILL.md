---
name: nuevo-componente-ui
description: Adds a reusable UI component to the CNL Plataforma design system (tokens, css/components.css, js/presentation/ui.js helper, docs/DESIGN.md, tests, service worker) keeping WCAG 2.2 AA, mobile-first and dark mode. Use it when a view needs a visual piece that is not yet in the system, e.g. "a timeline component", "a stepper", "a stat card with a sparkline", or when migrating a view's private <style> into shared components.
---

# New UI component

Contract: `docs/DESIGN.md` (read it first). Load order: `css/tokens.css` -> `css/app.css` -> `css/components.css`. Helpers that generate markup live in `js/presentation/ui.js`; icons in `js/presentation/icons.js`. Class names, tokens and file names stay as in the code; docs and comments are English; UI texts go through `t()` (es/en/it).

## 0. Do you really need a new one?

Look first at the existing components: `.btn` (+ `--primary --secondary --ghost --danger`, `.btn-sm .btn-lg .btn-icon`), `.field`/`field()`, `.filters`, `.badge`, `.chip`, `.alert`, `.card`, `.page-head`, `.stat`, `.avatar`, `.progress`, `.table-wrap > .table(--cards)`, `.empty`/`empty()`, `.tabs`, `.segmented`, `sheet()`/`modal()`, `toast`/`toast.undo`, `.skip-link`. If one fits with a modifier, extend it instead of creating another. Ask the `ux-a11y` agent when unsure.

## 1. Design the contract

Write down: purpose, markup (semantic HTML first: `button`, `ul`, `table`, `dl`...), variants/modifiers (BEM-like `component--variant`), states (hover, focus-visible, active, disabled, `aria-*`, loading `aria-busy`, error), responsive behaviour (mobile 390 px first; desktop 1366 px), and keyboard behaviour.

## 2. Tokens

Use only `var(--...)` from `css/tokens.css`: surfaces (`--surface`, `--surface-2`, `--text`, `--muted`, `--border`, `--field-border`), semantic (`--ok --warn --danger --info --neutral` + `-bg`), brand (`--c-action` + `--c-on-primary` for fills, `--c-accent`/`--c-heading` for text; never `--c-primary` as text), spacing `--sp-1..6`, radii `--r-sm|md|lg|pill`, shadows `--shadow-1..3`, type `--fs-*`, control sizes `--control-h`, `--touch`. **No hard-coded colours** and no `!important`. If a genuinely new token is needed, define it in **both** the light block and the dark blocks of `tokens.css` (`:root[data-theme="dark"]` and the `prefers-color-scheme` auto block; `tests/unit/diseno-estatico.test.js` requires the auto-dark block to repeat the dark values exactly and checks contrast ratios).

## 3. CSS

Add it to `css/components.css` as a new numbered block **before** block 10/11 (mobile touch targets and the temporary dark-mode fixes), with a header comment that documents the markup, in the style of the existing blocks. Requirements: visible `:focus-visible`, touch targets >= 44 px on mobile (block 10 handles standard controls), text >= 12 px, works in dark mode with only tokens, respects `prefers-reduced-motion`, no `<style>` injected from JS.

## 4. JS helper (only if it avoids repeating non-trivial markup)

In `js/presentation/ui.js`: `export function <name>({ ... } = {})` returning a node built with `h()`; never `innerHTML` with data; accept already-translated strings (the caller uses `t()`); wire `aria-*` ids with the existing id helper pattern used in `field()`; add JSDoc-style comment of the options. Keep it free of business logic.

## 5. Docs

`docs/DESIGN.md`: the markup example in the "Components" section and a row in the "Helpers of `js/presentation/ui.js`" table; new tokens in the tokens table.

## 6. Tests

- Unit (`tests/unit/ui-diseno.test.js` pattern, jsdom): the helper produces the right roles/attributes, escapes text (`<img onerror>` stays text), wires `aria-describedby`.
- `tests/unit/diseno-estatico.test.js` stays green (token contrast). If you add colour tokens, add their contrast assertions there.
- e2e if there is interaction: `features/diseno-sistema.feature` pattern (steps in `features/steps/diseno-sistema.steps.js`); run it by tag: `npx cucumber-js --tags "@design and not @google and not @pending"` and with `VIEWPORT=mobile`.

## 7. Verify visually

Use the `ux-a11y` agent: screenshots at 390x844 and 1366x850, light and dark, with keyboard-only navigation. Add a scenario to `scripts/capturas.mjs` if the component is user-visible (skill `regenerar-capturas`).

## 8. Service worker and wrap-up

If you created a new CSS/JS file add it to `SHELL` in `sw.js`; bump `VERSION` whenever any cached file changed (CSS counts). Then `npm run check && npm run test:unit && npm run test:integration`, the design e2e area, and a small commit `feat(ui): <component> component`. Migrating a view off its private `<style>`: do one view per commit and delete the matching rules from block 11 only when no view needs them.
