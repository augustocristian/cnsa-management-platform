// Shell navigation steps: bottom bar + "More" sheet, sidebar groups, route-change accessibility (title, focus, aria-current),
// footer in Settings only, offline banner and the settings/connection menu.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const list = (txt) => txt.split(',').map((x) => x.trim()).filter(Boolean);

// ---- Bottom bar and "More" sheet (mobile) ----
Then('the bottom bar shows the shortcuts {string}', async function (expected) {
  await this.eventually(async () => {
    const texts = await this.page.locator('nav.sidebar .nav-item').evaluateAll((els) => els
      .filter((e) => e.getBoundingClientRect().height > 0)
      // the visible label (the short one when there is one), not the hidden full label
      .map((e) => {
        const short = e.querySelector('.nav-label-short');
        const visible = short && getComputedStyle(short).display !== 'none' ? short : e.querySelector('.nav-label');
        return visible.textContent.trim();
      }));
    assert.deepEqual(texts, list(expected));
  });
});

When('I open the {string} sheet of the menu', async function (name) {
  await this.page.locator('nav.sidebar .nav-more').click();
  await this.page.locator('.sheet').waitFor({ timeout: this.timeout });
  assert.equal(name, 'Más', 'Only the "Más" sheet exists');
});

Then('the menu sheet has the group {string} with {string}', async function (group, items) {
  const sheet = this.page.locator('.sheet');
  await this.expectVisible(sheet.locator('.nav-group-title', { hasText: new RegExp(`^${group}$`) }), `The sheet has no group "${group}"`);
  const listed = await sheet.locator('.mas-group').filter({ has: this.page.locator('.nav-group-title', { hasText: new RegExp(`^${group}$`) }) })
    .locator('.mas-item').allInnerTexts();
  assert.deepEqual(listed.map((x) => x.trim()), list(items));
});

Then('the menu sheet does not offer {string}', async function (name) {
  assert.equal(await this.page.locator('.sheet .mas-item', { hasText: name }).count(), 0, `The sheet offers "${name}"`);
});

Then('the More button is marked as active', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('nav.sidebar .nav-more').getAttribute('class'), /\bactive\b/));
});

// ---- Sidebar (desktop) ----
Then('the side menu has the headings {string}', async function (expected) {
  const texts = await this.page.locator('nav.sidebar .nav-group-title').allInnerTexts();
  assert.deepEqual(texts.map((x) => x.trim().toLowerCase()), list(expected).map((x) => x.toLowerCase()));
});

// ---- Route change accessibility ----
Then('the document title starts with {string}', async function (text) {
  await this.eventually(async () => assert.ok((await this.page.title()).startsWith(text), `Title: ${await this.page.title()}`));
});

Then('the focus is on the heading of the screen', async function () {
  await this.eventually(async () => {
    const f = await this.page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, inView: !!a?.closest('#view'), id: a?.id }; });
    assert.ok(f.tag === 'H1' && f.inView, `Focus is on ${JSON.stringify(f)}`);
  });
});

Then('the current menu item is {string}', async function (name) {
  await this.eventually(async () => {
    const current = await this.page.locator('nav.sidebar a.nav-item[aria-current="page"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    assert.equal(current.length, 1, `aria-current items: ${current}`);
    assert.match(current[0], new RegExp(name));
  });
});

// ---- Footer ----
Then('there is no footer', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('footer.footer').count(), 0));
});

Then('there is a footer', async function () {
  await this.expectVisible(this.page.locator('footer.footer'), 'The footer is missing in Settings');
});

// ---- Offline banner ----
Then('I see the offline banner', async function () {
  await this.expectVisible(this.page.locator('#cnl-avisos [data-aviso="sin-conexion"]'), 'No offline banner');
});

Then('the offline banner disappears', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('#cnl-avisos [data-aviso="sin-conexion"]').count(), 0));
});

// ---- Settings and connection menu ----
When('I open the settings and connection menu', async function () {
  await this.openAccountMenu();
});

Then('the settings menu offers the language, the theme, the Drive status and the button {string}', async function (button) {
  const panel = this.page.locator('.account-panel');
  await this.expectVisible(panel.locator('.lang-switch'), 'No language switch in the menu');
  await this.expectVisible(panel.locator('.theme-select'), 'No theme selector in the menu');
  await this.expectVisible(panel.locator('.status-row .status-text'), 'No Drive status in the menu');
  await this.expectVisible(panel.getByRole('button', { name: button }), `No "${button}" button`);
});

Then('the settings menu shows no user identity', async function () {
  const panel = this.page.locator('.account-panel');
  const txt = await panel.innerText();
  assert.ok(!/@/.test(txt), 'An e-mail address is shown in the menu');
  assert.equal(await this.page.locator('#user-box, .account-panel .avatar, .account-btn .avatar').count(), 0);
});
