// Design system steps: accessibility (skip link, focus), light/dark theme, toasts with Undo and sheets.
// Components (sheet, toast, confirmation) are exercised in the real browser by importing js/presentation/ui.js, the same instance the app uses.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// ---------- Browser utilities ----------
// Puts the keyboard navigation starting point at the top of the document (so Tab reaches the first element).
async function resetTab(page) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    const sel = getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStart(document.body, 0);
    r.collapse(true);
    sel.addRange(r);
  });
}

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// Text colour and effective background (first ancestor with an opaque background) of the elements matching `selector`.
async function colorsOf(page, selector) {
  return page.evaluate((sel) => {
    const num = (s) => {
      // 'rgb(1, 2, 3)' | 'rgba(1, 2, 3, .5)' | 'color(srgb 0.1 0.2 0.3)'
      const m = /^rgba?\(([^)]+)\)$/.exec(s);
      if (m) {
        const p = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(Number);
        return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
      }
      const q = /^color\(srgb ([^)]+)\)$/.exec(s);
      if (q) {
        const p = q[1].split(/[ /]+/).filter(Boolean).map(Number);
        return { c: p.slice(0, 3).map((v) => v * 255), a: p.length > 3 ? p[3] : 1 };
      }
      return { c: [255, 255, 255], a: 1 };
    };
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return [...document.querySelectorAll(sel)].filter(visible).map((e) => {
      const fg = num(getComputedStyle(e).color).c;
      let n = e;
      let bg = null;
      while (n && !bg) {
        const { c, a } = num(getComputedStyle(n).backgroundColor);
        if (a >= 0.99) bg = c;
        n = n.parentElement;
      }
      return { text: (e.textContent || '').trim().slice(0, 30), fg, bg: bg || [255, 255, 255] };
    });
  }, selector);
}

const backgroundLuminance = (page) =>
  page.evaluate(() => {
    const m = /([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(getComputedStyle(document.body).backgroundColor);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [255, 255, 255];
  });

// ---------- Skip link ----------
When('I press Tab once from the start of the page', async function () {
  await resetTab(this.page);
  await this.page.keyboard.press('Tab');
});

Then('the focus is on the link {string}', async function (text) {
  await this.eventually(async () => {
    const t = await this.page.evaluate(() =>
      document.activeElement?.classList.contains('skip-link') ? document.activeElement.textContent.trim() : null,
    );
    assert.equal(t, text);
  });
});

Then('the skip link is visible', async function () {
  const box = await this.page.locator('.skip-link').boundingBox();
  const vp = this.page.viewportSize();
  assert.ok(
    box && box.y >= 0 && box.x >= 0 && box.y + box.height <= vp.height && box.x + box.width <= vp.width,
    'The skip link is not inside the screen: ' + JSON.stringify(box),
  );
});

When('I activate the skip link with Enter', async function () {
  await this.page.keyboard.press('Enter');
});

Then('the focus is on the main content', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.activeElement?.id), 'view'));
});

Then('the route is still {string}', async function (hash) {
  assert.equal(await this.page.evaluate(() => location.hash), hash);
});

// ---------- Visible focus ----------
When('I Tab through the first {int} interactive elements', async function (n) {
  await resetTab(this.page);
  this.focuses = [];
  for (let i = 0; i < n; i++) {
    await this.page.keyboard.press('Tab');
    this.focuses.push(
      await this.page.evaluate(() => {
        const e = document.activeElement;
        const cs = getComputedStyle(e);
        return {
          el: `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`,
          style: cs.outlineStyle,
          width: parseFloat(cs.outlineWidth),
        };
      }),
    );
  }
});

Then('every focused element shows a visible outline of at least {int} px', async function (min) {
  assert.ok(this.focuses.length > 0);
  const bad = this.focuses.filter((f) => f.style === 'none' || f.width < min);
  assert.deepEqual(bad, [], 'Elements without a visible focus outline');
  assert.ok(
    new Set(this.focuses.map((f) => f.el)).size > 3,
    'Tab should walk through different elements: ' + JSON.stringify(this.focuses),
  );
});

// ---------- Theme ----------
Given('the operating system prefers dark mode', async function () {
  await this.page.emulateMedia({ colorScheme: 'dark' });
});

When('I choose the theme {string}', async function (name) {
  await this.openAccountMenu();
  const sel = this.page.locator('.theme-select');
  await sel.waitFor({ timeout: this.timeout });
  await sel.selectOption({ label: name });
});

Then('the app uses dark mode', async function () {
  await this.eventually(async () => {
    const lum = luminance(await backgroundLuminance(this.page));
    assert.ok(lum < 0.05, `The background is not dark (luminance ${lum.toFixed(3)})`);
    assert.notEqual(await this.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  });
});

Then('the app uses light mode', async function () {
  await this.eventually(async () => {
    const lum = luminance(await backgroundLuminance(this.page));
    assert.ok(lum > 0.8, `The background is not light (luminance ${lum.toFixed(3)})`);
  });
});

Then('the local preferences store the theme {string}', async function (theme) {
  await this.eventually(async () => {
    const v = await this.page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('cnl:prefs')).prefs.valores.tema;
      } catch (e) {
        return null;
      }
    });
    assert.equal(v, theme);
    assert.equal(
      await this.page.evaluate(() => localStorage.getItem('cnl:tema')),
      theme,
      'mirror for the pre-paint script',
    );
  });
});

Then('the Drive preferences end up storing the theme {string}', async function (theme) {
  await this.eventually(
    async () => assert.equal((await this.drive()).prefs?.valores?.tema, theme),
    'The theme never reached the Drive preferences',
  );
});

Then('the theme selector shows {string}', async function (name) {
  await this.openAccountMenu();
  await this.eventually(async () => {
    const txt = await this.page.locator('.theme-select').evaluate((s) => s.options[s.selectedIndex].textContent);
    assert.equal(txt, name);
  });
});

When('I reload the app watching the paint order', async function () {
  await this.page.addInitScript(() => {
    window.__order = [];
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme')
          window.__order.push('theme:' + m.target.getAttribute('data-theme'));
        for (const n of m.addedNodes || [])
          if (n.nodeType === 1 && (n.matches?.('.topbar') || n.querySelector?.('.topbar')))
            window.__order.push('shell');
      }
    }).observe(document, { attributes: true, subtree: true, childList: true });
  });
  await this.page.reload();
  await this.waitForShell();
});

Then('the dark theme was applied before painting the app', async function () {
  const order = await this.page.evaluate(() => window.__order);
  assert.equal(order[0], 'theme:dark', 'The first thing to happen must be setting the theme: ' + JSON.stringify(order));
  assert.ok(
    order.includes('shell') && order.indexOf('shell') > 0,
    'The header is painted afterwards: ' + JSON.stringify(order),
  );
});

Then('the title, the club name and the menu have a contrast of at least {float}', async function (min) {
  await this.eventually(async () => {
    const elements = [
      ...(await colorsOf(this.page, '#view h1, #view h2')),
      ...(await colorsOf(this.page, '.brand-name')),
      ...(await colorsOf(this.page, '.nav-item:not(.active)')),
    ];
    assert.ok(elements.length >= 3, 'The elements to check were not found');
    const bad = elements.map((e) => ({ ...e, ratio: contrast(e.fg, e.bg) })).filter((e) => e.ratio < min);
    assert.deepEqual(
      bad.map((m) => `${m.text}: ${m.ratio.toFixed(2)}`),
      [],
      'Insufficient contrast',
    );
  });
});

Then('the text on the club colour is {string}', async function (hex) {
  await this.eventually(async () =>
    assert.equal(
      await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-on-primary').trim()),
      hex,
    ),
  );
});

Then('the active menu option has a contrast of at least {float}', async function (min) {
  const [e] = await colorsOf(this.page, '.nav-item.active');
  assert.ok(e, 'There is no active option');
  assert.ok(contrast(e.fg, e.bg) >= min, `Contrast ${contrast(e.fg, e.bg).toFixed(2)} (${e.fg} on ${e.bg})`);
});

// ---------- Toasts ----------
When('the toast {string} is shown with the Undo action', async function (msg) {
  await this.page.evaluate(async (m) => {
    const ui = await import('/js/presentation/ui.js');
    window.__undone = 0;
    ui.toast.undo(m, () => {
      window.__undone++;
    });
  }, msg);
});

When('an error toast {string} is shown', async function (msg) {
  await this.page.evaluate(async (m) => {
    (await import('/js/presentation/ui.js')).toast.error(m);
  }, msg);
});

const toast = (world, msg) => world.page.locator('#toasts .toast').filter({ hasText: msg });

Then('the toast {string} is accessible with role {string}', async function (msg, role) {
  await this.expectVisible(
    this.page.locator(`#toasts .toast[role="${role}"]`).filter({ hasText: msg }),
    `There is no toast "${msg}" with role=${role}`,
  );
});

Then('the toast has the button {string}', async function (text) {
  await this.expectVisible(this.page.locator('#toasts .toast').getByRole('button', { name: text }));
});

When('I press the button {string} of the toast', async function (text) {
  await this.page.locator('#toasts .toast').getByRole('button', { name: text }).click();
});

Then('the undo action ran once', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => window.__undone), 1));
});

Then('the toast {string} disappears', async function (msg) {
  await this.expectHidden(toast(this, msg), `The toast "${msg}" is still visible`);
});

When('I hover over the toast {string}', async function (msg) {
  // only its buttons receive the pointer (the toast does not cover what is below): hovering them pauses it
  await toast(this, msg).first().locator('button').first().hover();
});

When('{int} seconds pass', async function (s) {
  await this.page.waitForTimeout(s * 1000);
});

Then('the toast {string} is still visible', async function (msg) {
  await this.expectVisible(toast(this, msg));
});

// ---------- Sheets and confirmations ----------
When('I open a test sheet from the button {string}', async function (text) {
  await this.page.evaluate(async (t) => {
    const ui = await import('/js/presentation/ui.js');
    // outside #view/#app: views repaint on their own and would take the button away
    const b = ui.h(
      'button',
      {
        type: 'button',
        id: 'e2e-open',
        class: 'btn',
        style: { position: 'fixed', top: '4px', left: '4px', zIndex: '50' },
      },
      t,
    );
    b.addEventListener('click', () => {
      window.__sheet = ui.sheet({
        title: 'Hoja de prueba',
        body: ui.h(
          'div',
          null,
          ui.field({ label: 'Nombre', input: ui.h('input') }),
          ui.field({ label: 'Licencia', input: ui.h('input') }),
        ),
        actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }],
      });
    });
    document.body.appendChild(b);
  }, text);
  await this.page.locator('#e2e-open').click();
  await this.expectVisible(this.page.locator('.sheet'));
});

Then('the focus is inside the sheet', async function () {
  await this.eventually(async () =>
    assert.equal(await this.page.evaluate(() => !!document.activeElement?.closest('.sheet')), true),
  );
});

Then('the background page is inert and does not scroll', async function () {
  const r = await this.page.evaluate(() => ({
    inert: document.getElementById('app').inert,
    overflow: getComputedStyle(document.body).overflow,
  }));
  assert.equal(r.inert, true, '#app should be inert');
  assert.equal(r.overflow, 'hidden');
});

When('I press Tab {int} times', async function (n) {
  for (let i = 0; i < n; i++) await this.page.keyboard.press('Tab');
});

Then('the focus stays inside the sheet', async function () {
  assert.equal(
    await this.page.evaluate(() => !!document.activeElement?.closest('.sheet')),
    true,
    'Focus left the sheet',
  );
});

When('I press Escape', async function () {
  await this.page.keyboard.press('Escape');
});

Then('the sheet closes', async function () {
  await this.expectHidden(this.page.locator('.sheet'), 'The sheet is still open');
});

Then('the focus returns to the button {string}', async function (text) {
  await this.eventually(async () =>
    assert.equal(await this.page.evaluate(() => document.activeElement?.textContent?.trim()), text),
  );
});

Then('the background page is active again', async function () {
  const r = await this.page.evaluate(() => ({
    inert: document.getElementById('app').inert,
    overflow: document.body.style.overflow,
  }));
  assert.equal(r.inert, false);
  assert.equal(r.overflow, '');
});

Then('the sheet is anchored to the bottom edge of the screen', async function () {
  const vp = this.page.viewportSize();
  await this.eventually(async () => {
    // wait for the entry animation to finish
    const box = await this.page.locator('.sheet').boundingBox();
    assert.ok(
      Math.abs(box.y + box.height - vp.height) <= 2,
      `The sheet does not touch the bottom edge: ${JSON.stringify(box)} in ${JSON.stringify(vp)}`,
    );
    assert.ok(box.width >= vp.width - 2, 'The sheet does not take the full width');
  });
});

When('I open a destructive confirmation dialog', async function () {
  await this.page.evaluate(async () => {
    const ui = await import('/js/presentation/ui.js');
    window.__confirm = ui.confirmDialog('¿Eliminar a Lucía Fernández?', { danger: true });
  });
  await this.expectVisible(this.page.locator('.sheet'));
});

Then('the focus is on the button {string}', async function (text) {
  await this.eventually(async () =>
    assert.equal(await this.page.evaluate(() => document.activeElement?.textContent?.trim()), text),
  );
});

Then('the destructive button is called {string}', async function (text) {
  await this.expectVisible(this.page.locator('.sheet .btn--danger', { hasText: new RegExp(`^${text}$`) }));
});
