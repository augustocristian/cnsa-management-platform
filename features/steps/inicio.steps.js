// Steps of the home panel (features/inicio.feature).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const card = (world, title) => world.view.locator('section.card').filter({ has: world.page.getByRole('heading', { name: title, level: 2 }) });

Then('the panel banner shows the club name {string}', async function (name) {
  await this.expectVisible(this.view.locator('.ini-banner').getByRole('heading', { level: 1, name }), `The banner does not show "${name}"`);
});

Then('the panel banner summarises the sessions of today', async function () {
  await this.eventually(async () => {
    const txt = (await this.view.locator('.ini-headline').innerText()).trim();
    assert.match(txt, /^(Hoy: \d+ (sesión|sesiones) · \d+ (nadador|nadadores) (esperado|esperados)|Hoy no hay sesiones)/);
  });
});

When('I press the quick action {string}', async function (name) {
  await this.view.locator('#ini-acciones').getByRole('link', { name }).click();
});

Then('the card {string} offers {string}', async function (title, action) {
  const t = card(this, title);
  await this.expectVisible(t.getByRole('link', { name: action }), `The card "${title}" does not offer "${action}"`);
});

When('I hide the first steps', async function () {
  await this.view.getByRole('button', { name: 'Ocultar primeros pasos' }).click();
});

// Desktop: the cards form complete rows (no empty cell at the end of a row).
Then('the panel cards fill each row without gaps', async function () {
  await this.expectVisible(this.view.locator('.ini-grid > .ini-card').first());
  await this.eventually(async () => {
    const r = await this.page.evaluate(() => {
      const grid = document.querySelector('.ini-grid').getBoundingClientRect();
      const rows = new Map();
      for (const c of document.querySelectorAll('.ini-grid > .ini-card')) {
        const b = c.getBoundingClientRect();
        const key = Math.round(b.top);
        rows.set(key, (rows.get(key) || 0) + b.width);
      }
      return { width: grid.width, rows: [...rows.values()] };
    });
    assert.ok(r.rows.length >= 2 && r.rows.length <= 4, `rows: ${r.rows.length}`);
    for (const w of r.rows) assert.ok(w >= r.width * 0.85, `incomplete row: ${Math.round(w)} of ${Math.round(r.width)}`);
  });
});

Then('the panel has no horizontal scroll', async function () {
  await this.expectVisible(this.view.locator('.ini-grid').first());
  const r = await this.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  assert.ok(r.scroll <= r.width + 1, `The page overflows: ${r.scroll} > ${r.width}`);
});

Then('the weekly chart texts are at least {int} pixels', async function (min) {
  await this.expectVisible(this.view.locator('#ini-grafico svg.ini-svg'));
  const r = await this.page.evaluate(() => {
    const svg = document.querySelector('#ini-grafico svg.ini-svg');
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return [...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale);
  });
  assert.ok(r.length > 0);
  for (const px of r) assert.ok(px >= min - 0.01, `Text of ${px.toFixed(1)} px in the chart`);
});

Then('the weekly chart has a table as an alternative', async function () {
  const svg = this.view.locator('#ini-grafico svg.ini-svg');
  assert.equal(await svg.getAttribute('role'), 'img');
  assert.equal(await this.view.locator('#ini-grafico table tbody tr').count(), 7);
});

Then('every load alert of the panel has an icon and text', async function () {
  await this.expectVisible(this.view.locator('#ini-alertas .alert').first());
  const n = await this.view.locator('#ini-alertas .alert').count();
  for (let i = 0; i < n; i++) {
    const a = this.view.locator('#ini-alertas .alert').nth(i);
    assert.equal(await a.locator('svg.icon').count(), 1);
    assert.match((await a.innerText()).trim(), /(Faltan|Exceso de) [\d.]+ m|Todas las cargas|Aún no hay cargas/);
  }
});
