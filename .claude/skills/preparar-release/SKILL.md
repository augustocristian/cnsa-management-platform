---
name: preparar-release
description: Milestone checklist for CNL Plataforma - full verification (check, unit, integration, e2e desktop and mobile, audit, vendor sync), service worker version, docs, small descriptive commits, push and CI/deploy watch, under the rule "never break the app". Use it before committing or pushing a finished feature or fix, when asked to "prepare the release", "commit and push", "deploy", or after a red CI.
---

# Prepare a release / milestone push

**Golden rule:** small, descriptive commits; push at every milestone; never break the application (check + unit + integration + relevant e2e before each commit, the full e2e before each push). With parallel agents work on disjoint file zones: stage **explicit paths** and never `git add -A`. The `release-ci` agent runs this skill; the orchestrator may instead say "do not run git", in which case stop after step 4 and hand back the file list and proposed messages. Commit messages and PR text are English.

## 1. Know what changed

`git status --short` and `git diff --stat`. Separate your own files from other agents' work in progress. Anything unrelated is left unstaged.

## 2. Pre-flight checks

- New `js/`/`css/` files listed in `SHELL` of `sw.js`; `VERSION` bumped if any cached file changed.
- All import paths relative; no secrets; no real minors' data in fixtures or screenshots.
- UI texts through `t()` with es/en/it parity; docs (`README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`) reflect the change; screenshots regenerated if the UI changed (skill `regenerar-capturas`).
- New runtime folder/file needed by the app? Add it to the `cp` in the `build` job of `.github/workflows/pages.yml`.

## 3. Full verification (stop at the first red)

```bash
npm run check
npm run test:unit
npm run test:integration
npm run test:e2e            # desktop + mobile, ~8-10 min: run in the background and wait for the notification
npm audit --omit=dev --audit-level=high
npm ci && git diff --exit-code -- vendor/     # only when dependencies changed (vendor in sync)
```
During development, per commit, the relevant e2e area is enough: `npx cucumber-js --tags "@<area> and not @google and not @pendiente"` (a bare feature path would run ALL scenarios, see `nuevo-escenario-cucumber`), and again with `VIEWPORT=movil` (`$env:VIEWPORT='movil'` in PowerShell) when the UI changed. Red tests are fixed at the cause, never skipped. A red e2e that cannot be explained by your change may come from another agent's unfinished work: re-run the area, inspect `reports/screenshots/`, and report it instead of committing over it.

## 4. Commits

One logical change per commit, conventional prefix, imperative English subject <= 72 chars, body explaining why when useful:
`feat(season): add phase overlap warning`, `fix(sync): keep local edit when remote row deleted`, `test(e2e): cover swimmer erasure`, `docs: document injuries sheet`, `chore: bump sw cache version`.
Stage by path: `git add js/domain/x.js tests/unit/x.test.js ...`; check `git diff --staged` and `git status` before `git commit`. Split code, tests and docs into separate commits when they are independent. Never `--no-verify`, never amend published commits.

## 5. Push the milestone

`git push` (never `--force`/`-f`). Then watch CI: `gh run list --limit 3`, `gh run watch <id>`; on failure `gh run view <id> --log-failed`, reproduce locally and fix forward in a new small commit (or `git revert <sha>`). CI order: validate -> unit + integration -> e2e -> build -> deploy (main only) -> smoke test against https://augustocristian.github.io/cnsa-management-platform/.

## 6. Post-deploy

Open the public URL, hard-reload (the service worker is cache-first: a bumped `VERSION` activates the new shell), check the login screen loads without console errors. Report: commands and results, commit shas, CI status, URL status, and any residual risk.

## Dependabot PRs

Weekly, grouped. Merge only after the same verification; check `vendor/` and `vendor/integrity.json` change coherently for jspdf, jspdf-autotable and SheetJS; test majors of Playwright, Cucumber, jsdom and jsPDF separately.
