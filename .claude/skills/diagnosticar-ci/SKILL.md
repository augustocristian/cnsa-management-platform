---
name: diagnosticar-ci
description: Diagnoses a red GitHub Actions run of CNL Plataforma - finds the failing job with gh, reads only the failed log, reproduces the failure locally with Node 22 and TZ=UTC as CI does, and checks the known CI-only causes (unref timers, fonts and heights, line endings, stale service worker, vendor drift, Pages source). Use it when CI fails after a push, when a test passes locally but not in CI, or when the deployed site does not update. Trigger examples - "CI is red", "the e2e job fails only on GitHub", "unit tests hang in CI", "gh run shows Static validation failed", "the deploy job was skipped".
---

# Diagnose a red CI

Workflow: `.github/workflows/pages.yml`. Jobs: `validate` ("Static validation": `npm run verify`, `npm run check:arch`, `npm audit`, vendor sync) -> `unit` + `integration` -> `e2e` (desktop + mobile, 2 retries, uploads `reports/`) -> `build` -> `deploy` (main only) -> `smoke`. A red job blocks the later ones, so fix the **first** red job.

## 1. Find the failure (read only the failed part)

```bash
gh run list --limit 5                       # status and conclusion per run (most recent first)
gh run view <run-id>                        # jobs and steps with their result
gh run view <run-id> --log-failed | tail -150   # only the failed steps; read the FIRST error, not the last
gh run watch <run-id>                       # follow a run in progress
gh run download <run-id> -n e2e-reports -D <scratch-dir>   # cucumber html/xml + failure screenshots (e2e job)
```

Use a scratch directory outside the repo for downloads. For the e2e job the job summary (from `scripts/resumen-e2e.mjs`) lists failed scenarios and their errors.

## 2. Reproduce with CI's runtime

CI uses Ubuntu, **Node 22**, `TZ=UTC` (runner default) and `npm ci`. Locally the project is developed on Windows with Node 24 in `Europe/Madrid`.

```bash
npm run verify                                       # static job: check + Prettier + ESLint (+ check:arch)
TZ=UTC npx -y node@22 --test tests/unit              # PowerShell: $env:TZ='UTC'; npx -y node@22 --test tests/unit
TZ=UTC npx -y node@22 --test tests/integration
TZ=UTC npx -y node@22 --test tests/unit/<file>.test.js          # a single file
npx cucumber-js --tags @<area>                       # the failing area, desktop
VIEWPORT=mobile npx cucumber-js --tags "@<area> and not @desktop"   # PowerShell: $env:VIEWPORT='mobile'; ...
```

A `.feature` path argument runs the WHOLE suite (the config merges its `paths`): select by `--tags` or `--name`. e2e in CI retries twice, so a scenario that needed retries is flaky even when the job is green: treat the retry notes in the summary as bugs.

## 3. Known CI-only causes (check in this order)

| Symptom                                                                  | Likely cause                                                                                                                  | Fix                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Static validation` fails on `check` with a `sw.js` report               | Stale service worker list / `VERSION` (a file under `js/ css/ icons/ vendor/` or `index.html` changed)                        | `npm run build:sw`, commit `sw.js`                                                                               |
| `format:check` fails                                                     | Unformatted file (or Windows CRLF working tree vs LF repo: files you edited must be formatted)                                | `npm run format`, commit only your files                                                                         |
| `lint` fails with "too many warnings"                                    | A new ESLint warning raised the count above `--max-warnings=92`                                                               | Fix the warning (complexity, function/file length, unused var); never raise the cap                              |
| Architecture check fails                                                 | New import breaks a layer rule, a cycle, an import without `.js`, a `<style>` in a view                                       | `node scripts/check-arch.mjs --all`; fix the dependency (inject, move, expose through `composicion/contexto.js`) |
| `git diff --exit-code -- vendor/` fails                                  | `vendor/` differs from what `npm ci` produces (npm updated, or CRLF rewrote vendor files)                                     | `npm run vendor` and commit exactly its output (`.gitattributes` keeps vendor byte-exact)                        |
| `npm audit` fails                                                        | A high advisory in a production dependency (`@e965/xlsx`, `jspdf`, `jspdf-autotable`)                                         | Update the package, regenerate `vendor/`, run the full suite                                                     |
| Unit test **hangs** or the job times out                                 | A ref'd `setTimeout`/`setInterval` left running                                                                               | Background timers go through `TimersPort` and are `unref`'d; clear intervals in the test                         |
| Unit test **cancelled** / "Promise resolution is still pending"          | An `unref`'d timer that the test awaits (a deadline): Node exits before it fires                                              | Awaited deadlines use `{ unref: false }` (see `clubStore.js`)                                                    |
| Test passes locally, fails in CI on dates (off by one day, season label) | Timezone or current date dependence                                                                                           | Inject `ahora`/dates; run with `TZ=UTC`; never `new Date()` in tested code paths                                 |
| e2e fails only in CI: element cut off, overlapping, scroll position off  | Different fonts (Linux has no Windows fonts) change heights and wrapping; headless viewport                                   | Assert on roles/text, not pixel positions; scroll into view; avoid fixed offsets; check `reports/screenshots/`   |
| e2e fails only on mobile                                                 | Layout differs (bottom bar, "More" sheet, `.table--cards`); `@desktop` scenario not tagged                                    | Tag desktop-only scenarios `@desktop`; use the module opener steps that handle the "More" sheet                  |
| e2e fails in CI after a UI change but not locally                        | Locally the service worker served stale files; CI starts clean                                                                | Hard-reload locally / `npm run build:sw`; real run: `npx cucumber-js --tags @<area>`                             |
| Console error or 4xx/5xx makes a passing scenario fail                   | `hooks.js` fails scenarios with console errors or HTTP errors (often a missing file in `SHELL`/a typo in a path)              | Open the scenario screenshot/log; fix the request or the missing file                                            |
| Test reading a file with `\r\n` or hashing text differently              | Line endings: Windows working tree is CRLF, CI is LF                                                                          | Normalise to LF in the test (`replace(/\r\n/g, '\n')`); `generate-sw.mjs` already normalises                     |
| Port already in use / server not reachable                               | Hard-coded port                                                                                                               | Harnesses pick a free port; never hard-code one                                                                  |
| `deploy` skipped or the site shows the old version                       | Run was a PR/manual run (deploy is `main` only), Pages source not "GitHub Actions", or the old worker still controls the page | Settings > Pages > Source: GitHub Actions; after deploy hard-reload and click "Reload" in the update banner      |
| `build` ok but a file is 404 on the site                                 | New top-level runtime folder missing from the `cp -r` list of the `build` job                                                 | Add it to the workflow `Prepare site` step                                                                       |

## 4. Fix and verify

1. Fix the cause at the lowest level (never skip, delete or loosen a test; never `--no-verify`; never force-push).
2. Re-run locally what failed (section 2) plus `npm run verify`, `npm run test:unit`, `npm run test:integration` and the e2e area on desktop and mobile.
3. Commit small and descriptive (`fix:`/`test:`/`ci:`), stage by name, push, then `gh run watch <id>` until `deploy` and `smoke` are green.
4. If main is red and the fix is not quick, `git revert <sha>` (new commit) and push; do not rewrite published history.
5. Report: failing job and step, root cause, why it only appeared in CI, fix commit, final run URL/status.
