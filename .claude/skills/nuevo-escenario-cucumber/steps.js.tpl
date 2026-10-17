// Steps specific to <area>. The generic ones (open module, press, fill in, see text/heading/notice, demo data...) already exist in
// features/steps/comunes.steps.js: reuse them before writing new ones. Step definitions are GLOBAL across files.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// Local date today + N days (YYYY-MM-DD): scenarios must not depend on the day they run
const localDate = (days = 0) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A "date N days from now" step already exists in temporada.steps.js ("I fill {string} with the date {int} days from now"). If you need it from another area, MOVE it to
// comunes.steps.js instead of duplicating it (Cucumber fails with "Multiple step definitions match").

Then('the <items> list has {int} rows', async function (n) {
  await this.eventually(async () => assert.equal(await this.view.locator('table tbody tr').count(), n));
});

When('I delete the <item> {string}', async function (name) {
  const row = this.view.locator('tr', { hasText: name });
  await row.getByRole('button', { name: 'Eliminar' }).click(); // 'Eliminar' = aria-label of the delete button (UI text, Spanish)
});

// To assert on what reached the simulated Drive use `await this.drive()` -> { clubs, prefs, files } (window.__CNL_FAKE__);
// print its shape once before writing assertions on stored content.
