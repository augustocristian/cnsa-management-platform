// Design system steps: accessibility (skip link, focus), light/dark theme, toasts with Undo and sheets.
// Components (sheet, toast, confirmation) are exercised in the real browser by importing js/ui.js, the same instance the app uses.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// ---------- Browser utilities ----------
// Puts the keyboard navigation starting point at the top of the document (so Tab reaches the first element).
async function reiniciarTab(page) {
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

const luminancia = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a, b) => { const la = luminancia(a), lb = luminancia(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

// Text colour and effective background (first ancestor with an opaque background) of the elements matching `selector`.
async function coloresDe(page, selector) {
  return page.evaluate((sel) => {
    const num = (s) => { // 'rgb(1, 2, 3)' | 'rgba(1, 2, 3, .5)' | 'color(srgb 0.1 0.2 0.3)'
      const m = /^rgba?\(([^)]+)\)$/.exec(s);
      if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; }
      const q = /^color\(srgb ([^)]+)\)$/.exec(s);
      if (q) { const p = q[1].split(/[ /]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3).map((v) => v * 255), a: p.length > 3 ? p[3] : 1 }; }
      return { c: [255, 255, 255], a: 1 };
    };
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll(sel)].filter(visible).map((e) => {
      const fg = num(getComputedStyle(e).color).c;
      let n = e; let bg = null;
      while (n && !bg) { const { c, a } = num(getComputedStyle(n).backgroundColor); if (a >= 0.99) bg = c; n = n.parentElement; }
      return { texto: (e.textContent || '').trim().slice(0, 30), fg, bg: bg || [255, 255, 255] };
    });
  }, selector);
}

const luminanciaFondo = (page) => page.evaluate(() => {
  const m = /([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(getComputedStyle(document.body).backgroundColor);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [255, 255, 255];
});

// ---------- Skip link ----------
When('pulso Tab una vez desde el principio de la página', async function () {
  await reiniciarTab(this.page);
  await this.page.keyboard.press('Tab');
});

Then('el foco está en el enlace {string}', async function (texto) {
  await this.eventually(async () => {
    const t = await this.page.evaluate(() => (document.activeElement?.classList.contains('skip-link') ? document.activeElement.textContent.trim() : null));
    assert.equal(t, texto);
  });
});

Then('el enlace de salto es visible', async function () {
  const caja = await this.page.locator('.skip-link').boundingBox();
  const vp = this.page.viewportSize();
  assert.ok(caja && caja.y >= 0 && caja.x >= 0 && caja.y + caja.height <= vp.height && caja.x + caja.width <= vp.width, 'The skip link is not inside the screen: ' + JSON.stringify(caja));
});

When('activo el enlace de salto con Intro', async function () {
  await this.page.keyboard.press('Enter');
});

Then('el foco está en el contenido principal', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.activeElement?.id), 'view'));
});

Then('la ruta sigue siendo {string}', async function (hash) {
  assert.equal(await this.page.evaluate(() => location.hash), hash);
});

// ---------- Visible focus ----------
When('recorro con Tab los primeros {int} elementos interactivos', async function (n) {
  await reiniciarTab(this.page);
  this.focos = [];
  for (let i = 0; i < n; i++) {
    await this.page.keyboard.press('Tab');
    this.focos.push(await this.page.evaluate(() => {
      const e = document.activeElement;
      const cs = getComputedStyle(e);
      return { el: `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''}`, estilo: cs.outlineStyle, ancho: parseFloat(cs.outlineWidth) };
    }));
  }
});

Then('cada elemento enfocado muestra un contorno visible de al menos {int} px', async function (min) {
  assert.ok(this.focos.length > 0);
  const malos = this.focos.filter((f) => f.estilo === 'none' || f.ancho < min);
  assert.deepEqual(malos, [], 'Elements without a visible focus outline');
  assert.ok(new Set(this.focos.map((f) => f.el)).size > 3, 'Tab should walk through different elements: ' + JSON.stringify(this.focos));
});

// ---------- Theme ----------
Given('que el sistema operativo prefiere el modo oscuro', async function () {
  await this.page.emulateMedia({ colorScheme: 'dark' });
});

When('elijo el tema {string}', async function (nombre) {
  const sel = this.page.locator('.theme-select');
  await sel.waitFor({ timeout: this.timeout });
  await sel.selectOption({ label: nombre });
});

Then('la aplicación usa el modo oscuro', async function () {
  await this.eventually(async () => {
    const lum = luminancia(await luminanciaFondo(this.page));
    assert.ok(lum < 0.05, `The background is not dark (luminance ${lum.toFixed(3)})`);
    assert.notEqual(await this.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  });
});

Then('la aplicación usa el modo claro', async function () {
  await this.eventually(async () => {
    const lum = luminancia(await luminanciaFondo(this.page));
    assert.ok(lum > 0.8, `The background is not light (luminance ${lum.toFixed(3)})`);
  });
});

Then('las preferencias locales guardan el tema {string}', async function (tema) {
  await this.eventually(async () => {
    const v = await this.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('cnl:prefs')).prefs.valores.tema; } catch (e) { return null; } });
    assert.equal(v, tema);
    assert.equal(await this.page.evaluate(() => localStorage.getItem('cnl:tema')), tema, 'mirror for the pre-paint script');
  });
});

Then('las preferencias del Drive acaban guardando el tema {string}', async function (tema) {
  await this.eventually(async () => assert.equal((await this.drive()).prefs?.valores?.tema, tema), 'The theme never reached the Drive preferences');
});

Then('el selector de tema muestra {string}', async function (nombre) {
  await this.eventually(async () => {
    const txt = await this.page.locator('.theme-select').evaluate((s) => s.options[s.selectedIndex].textContent);
    assert.equal(txt, nombre);
  });
});

When('recargo la aplicación observando el orden de pintado', async function () {
  await this.page.addInitScript(() => {
    window.__orden = [];
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') window.__orden.push('tema:' + m.target.getAttribute('data-theme'));
        for (const n of m.addedNodes || []) if (n.nodeType === 1 && (n.matches?.('.topbar') || n.querySelector?.('.topbar'))) window.__orden.push('shell');
      }
    }).observe(document, { attributes: true, subtree: true, childList: true });
  });
  await this.page.reload();
  await this.esperarShell();
});

Then('el tema oscuro se aplicó antes de pintar la aplicación', async function () {
  const orden = await this.page.evaluate(() => window.__orden);
  assert.equal(orden[0], 'tema:dark', 'The first thing to happen must be setting the theme: ' + JSON.stringify(orden));
  assert.ok(orden.includes('shell') && orden.indexOf('shell') > 0, 'The header is painted afterwards: ' + JSON.stringify(orden));
});

Then('el título, el nombre del club y el menú tienen un contraste de al menos {float}', async function (min) {
  await this.eventually(async () => {
    const elementos = [...await coloresDe(this.page, '#view h1, #view h2'), ...await coloresDe(this.page, '.brand-name'), ...await coloresDe(this.page, '.nav-item:not(.active)')];
    assert.ok(elementos.length >= 3, 'The elements to check were not found');
    const malos = elementos.map((e) => ({ ...e, ratio: contraste(e.fg, e.bg) })).filter((e) => e.ratio < min);
    assert.deepEqual(malos.map((m) => `${m.texto}: ${m.ratio.toFixed(2)}`), [], 'Insufficient contrast');
  });
});

Then('el texto sobre el color del club es {string}', async function (hex) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-on-primary').trim()), hex));
});

Then('la opción activa del menú tiene un contraste de al menos {float}', async function (min) {
  const [e] = await coloresDe(this.page, '.nav-item.active');
  assert.ok(e, 'There is no active option');
  assert.ok(contraste(e.fg, e.bg) >= min, `Contrast ${contraste(e.fg, e.bg).toFixed(2)} (${e.fg} sobre ${e.bg})`);
});

// ---------- Toasts ----------
When('se muestra el aviso {string} con la acción Deshacer', async function (msg) {
  await this.page.evaluate(async (m) => {
    const ui = await import('/js/ui.js');
    window.__deshechos = 0;
    ui.toast.undo(m, () => { window.__deshechos++; });
  }, msg);
});

When('se muestra un aviso de error {string}', async function (msg) {
  await this.page.evaluate(async (m) => { (await import('/js/ui.js')).toast.error(m); }, msg);
});

const aviso = (mundo, msg) => mundo.page.locator('#toasts .toast').filter({ hasText: msg });

Then('el aviso {string} es accesible con role {string}', async function (msg, rol) {
  await this.verVisible(this.page.locator(`#toasts .toast[role="${rol}"]`).filter({ hasText: msg }), `There is no toast "${msg}" with role=${rol}`);
});

Then('el aviso tiene el botón {string}', async function (texto) {
  await this.verVisible(this.page.locator('#toasts .toast').getByRole('button', { name: texto }));
});

When('pulso el botón {string} del aviso', async function (texto) {
  await this.page.locator('#toasts .toast').getByRole('button', { name: texto }).click();
});

Then('la acción de deshacer se ejecutó una vez', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => window.__deshechos), 1));
});

Then('el aviso {string} desaparece', async function (msg) {
  await this.noVer(aviso(this, msg), `The toast "${msg}" is still visible`);
});

When('paso el ratón sobre el aviso {string}', async function (msg) {
  // only its buttons receive the pointer (the toast does not cover what is below): hovering them pauses it
  await aviso(this, msg).first().locator('button').first().hover();
});

When('pasan {int} segundos', async function (s) {
  await this.page.waitForTimeout(s * 1000);
});

Then('el aviso {string} sigue visible', async function (msg) {
  await this.verVisible(aviso(this, msg));
});

// ---------- Sheets and confirmations ----------
When('abro una hoja de prueba desde el botón {string}', async function (texto) {
  await this.page.evaluate(async (t) => {
    const ui = await import('/js/ui.js');
    // outside #view/#app: views repaint on their own and would take the button away
    const b = ui.h('button', { type: 'button', id: 'e2e-abrir', class: 'btn', style: { position: 'fixed', top: '4px', left: '4px', zIndex: '50' } }, t);
    b.addEventListener('click', () => {
      window.__hoja = ui.sheet({
        title: 'Hoja de prueba',
        body: ui.h('div', null, ui.field({ label: 'Nombre', input: ui.h('input') }), ui.field({ label: 'Licencia', input: ui.h('input') })),
        actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }],
      });
    });
    document.body.appendChild(b);
  }, texto);
  await this.page.locator('#e2e-abrir').click();
  await this.verVisible(this.page.locator('.sheet'));
});

Then('el foco está dentro de la hoja', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => !!document.activeElement?.closest('.sheet')), true));
});

Then('la página de fondo está inerte y sin scroll', async function () {
  const r = await this.page.evaluate(() => ({ inert: document.getElementById('app').inert, overflow: getComputedStyle(document.body).overflow }));
  assert.equal(r.inert, true, '#app should be inert');
  assert.equal(r.overflow, 'hidden');
});

When('pulso Tab {int} veces', async function (n) {
  for (let i = 0; i < n; i++) await this.page.keyboard.press('Tab');
});

Then('el foco sigue dentro de la hoja', async function () {
  assert.equal(await this.page.evaluate(() => !!document.activeElement?.closest('.sheet')), true, 'Focus left the sheet');
});

When('pulso Escape', async function () {
  await this.page.keyboard.press('Escape');
});

Then('la hoja se cierra', async function () {
  await this.noVer(this.page.locator('.sheet'), 'The sheet is still open');
});

Then('el foco vuelve al botón {string}', async function (texto) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.activeElement?.textContent?.trim()), texto));
});

Then('la página de fondo vuelve a estar activa', async function () {
  const r = await this.page.evaluate(() => ({ inert: document.getElementById('app').inert, overflow: document.body.style.overflow }));
  assert.equal(r.inert, false);
  assert.equal(r.overflow, '');
});

Then('la hoja está anclada al borde inferior de la pantalla', async function () {
  const vp = this.page.viewportSize();
  await this.eventually(async () => { // wait for the entry animation to finish
    const caja = await this.page.locator('.sheet').boundingBox();
    assert.ok(Math.abs(caja.y + caja.height - vp.height) <= 2, `The sheet does not touch the bottom edge: ${JSON.stringify(caja)} en ${JSON.stringify(vp)}`);
    assert.ok(caja.width >= vp.width - 2, 'The sheet does not take the full width');
  });
});

When('abro un diálogo de confirmación destructivo', async function () {
  await this.page.evaluate(async () => {
    const ui = await import('/js/ui.js');
    window.__confirm = ui.confirmDialog('¿Eliminar a Lucía Fernández?', { danger: true });
  });
  await this.verVisible(this.page.locator('.sheet'));
});

Then('el foco está en el botón {string}', async function (texto) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.activeElement?.textContent?.trim()), texto));
});

Then('el botón destructivo se llama {string}', async function (texto) {
  await this.verVisible(this.page.locator('.sheet .btn--danger', { hasText: new RegExp(`^${texto}$`) }));
});
