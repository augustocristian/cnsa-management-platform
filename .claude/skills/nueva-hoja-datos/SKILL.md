---
name: nueva-hoja-datos
description: Adds a new sheet (entity) or new columns to the CNL Plataforma data model without breaking existing files - schema.js, normalisation, compatible migration, cross-device merge, demo data, xlsx export/import, GDPR and tests. Use it when a feature needs to store new data, e.g. "store injuries per swimmer", "add field X to Nadadores", "new Objetivos sheet".
---

# New data sheet (or new columns)

Data lives in `cnl/<Club>.json` in the user's Drive: `{ version, club, hojas: { <Sheet>: [row...] } }`. Sheets are also the tabs of the exportable Excel. **An old file must keep opening and a new file must not be lost by an older app version.** Consult the `datos-drive` agent when in doubt about compatibility. Sheet and column names are Spanish and stay Spanish (`Lesiones`, `nadadorId`); explain them in English in comments and docs.

## Decide first

- New column in an existing sheet? -> append it **at the end** of the array in `SHEETS`; never rename, reorder or remove columns (old clubs read them as empty; an old app version keeps them in `extra`).
- New sheet? -> new key in `SHEETS` (PascalCase, no accents, Spanish: `Lesiones`). Stored values are **neutral, Spanish, all text** (`'true'|'false'`, dates `YYYY-MM-DD`, times `HH:MM`, JSON as a string).
- Does the format change so that the previous version cannot read it? -> only then bump `DOC_VERSION` in `js/sheetdata.js` and handle compatibility (almost never needed).

## Steps

1. **`js/schema.js`** - `SHEETS`: `Lesiones: ['id', 'nadadorId', 'fecha', 'zona', 'gravedad', 'notas']` with a comment describing each column's format. `ENTITY_SHEETS` is derived. Closed-value constants (`GRAVEDADES = ['leve','moderada','grave']`) next to the others. `id` is always a unique string (`newId()` = UUID).
2. **Normalisation** - `js/sheetdata.js`: add the columns to `COLS_TEXTO`/`COLS_FECHA`/`COLS_HORA` if not already covered (columns ending in `Id` are already text). Excel and other editors convert dates/numbers: `normalizarValor` returns them to text.
3. **Domain** - `js/domain/<module>.js` (pure): `normalizar`, `aFila`, `validar` (skill `nueva-funcionalidad`, template `dominio.js.tpl`). Numbers coming from JSON may arrive as text.
4. **Relations and GDPR** - if the sheet hangs off another (e.g. `nadadorId`), add the tuple to `RELACIONES` in `js/sheetdata.js`: `['Lesiones', 'nadadorId', 'Nadadores']`. That cleans orphans after merging and the rows enter **automatically** `store.datosNadador`, `exportNadador` and `purgarNadador` (right of access/erasure). If it stores minors' personal data, tell `seguridad-rgpd`.
5. **Compatible migration** (only if old data must be transformed) - in `js/store.js` next to `ensureCatalog()` (runs on open, sync, import and clear): idempotent, deterministic (no clock or randomness), does not rewrite anything the user should not see changed, leaves the old column/sheet as LEGACY and says so in a comment in `schema.js`. Existing example: `ObjetivosCarga` -> `TiposCarga.minSemanalM/maxSemanalM` (`migrarHeredados` in `js/domain/cargas.js`).
6. **Cross-device merge** - `mergeData` is already generic per sheet/`id`/field; just check: rows have an `id`; deletions leave tombstones (use `store.remove`, never touch `db` directly); JSON fields merge as text (a conflict on the same field is resolved by the most recent stamp). If two devices can create "the same" logical row (e.g. one per swimmer and day), use a **deterministic id** (`sp-<season>-<monday>` in `SemanasPlan`) instead of `newId()`.
7. **Demo** - `buildDemo()` in `js/store.js`: fill `out.<Sheet>` with coherent fictitious data **relative to today** (`addDays(today, n)`), never real minors' data. `seedDemo` returns the count per `ENTITY_SHEETS`.
8. **Excel** - `exportXlsx/importXlsx` iterate `SHEETS`: no code needed, but `tests/integration/xlsx.test.js` requires tabs = `SHEETS`; run it. Check importing a workbook with a missing sheet (old clubs) and with extra columns.
9. **Service and view** - skill `nueva-funcionalidad` (the service receives the `store` as repository: `list/get/upsert/remove`).
10. **Tests** (templates in `.claude/skills/nueva-funcionalidad/`):
    - `tests/unit/schema.test.js` (columns and sheet registered), `tests/unit/store.test.js` (CRUD, demo), `tests/unit/integridad-datos.test.js`/`integridad-store.test.js` (merge, orphans, GDPR): add cases for the new sheet.
    - **Round trip with an old file**: document without the sheet/column -> `docToData` -> does not fail, empty sheet; document with unknown columns -> kept in `extra` and rewritten.
    - Merge: two "devices" edit different fields of the same row (both kept) and delete vs edit (the edit wins).
    - When you use `fakeGoogle.editarClubExterno` to simulate the other device, check that `store.sync()` merges.
11. **Docs** - sheets table in `docs/ARCHITECTURE.md` (columns, formats, what is LEGACY) and the README if relevant.
12. **Verification** - `npm run check && npm run test:unit && npm run test:integration` and the data e2e areas (`npx cucumber-js --tags "(@single-user or @data-integrity) and not @google and not @pending"`; a bare feature path would run the whole suite - see `nuevo-escenario-cucumber`); commit `feat(data): <Sheet> sheet`.

## Do not

Rename or reorder columns; store translated text; store typed numbers/booleans (everything is text); use `localStorage` as source of truth; write straight into `db` bypassing `store`; delete legacy sheets without migrating; use auto-increment ids (they collide across devices).
