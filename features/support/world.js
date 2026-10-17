import { setWorldConstructor, World } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// Module name as shown in the (Spanish) UI -> route.
export const MODULES = {
  Inicio: 'inicio',
  Nadadores: 'nadadores',
  Grupos: 'grupos',
  Entrenamientos: 'entrenamientos',
  Asistencia: 'asistencia',
  Cargas: 'cargas',
  Marcas: 'marcas',
  'Avisos y notas': 'comunicaciones',
  Configuración: 'club',
  Planificación: 'planificacion',
  Calendario: 'calendario',
  Tutorial: 'tutorial',
};
export const DIALOG = '.nad-modal, .grp-modal, .ent-modal, .modal';
const TIMEOUT = 8000;

export const route = (module) => {
  const r = MODULES[module];
  assert.ok(r, `Unknown module: ${module}`);
  return r;
};
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Regex that requires all the words to appear (in any order)
export const allWords = (text) =>
  new RegExp(
    text
      .trim()
      .split(/\s+/)
      .map((p) => `(?=.*${esc(p)})`)
      .join(''),
    's',
  );
export const textRegex = (t) => new RegExp(esc(t));

class CnlWorld extends World {
  constructor(opts) {
    super(opts);
    this.errors = [];
    this.timeout = TIMEOUT;
  }

  get view() {
    return this.page.locator('#view');
  }

  // Open dialog if there is one; otherwise the current view
  async scope() {
    const d = this.page.locator(DIALOG);
    if (await d.count()) return d.last();
    return (await this.view.count()) ? this.view : this.page;
  }

  // Opens the app with the Google test adapter (js/infrastructure/fakeGoogle.js, enabled by localStorage['cnl:test']).
  // options: {session, demo, noClientId, user, loginError, failures, connected, connectionError} (translated to the keys of the fake). The flags are written only once per tab:
  // later reloads keep the simulated "Drive" (mirrored in localStorage) and the session.
  async openApp(options = {}) {
    const KEYS = {
      session: 'sesion',
      noClientId: 'sinClientId',
      user: 'usuario',
      loginError: 'errorLogin',
      failures: 'fallos',
      connected: 'conectado',
      connectionError: 'errorConexion',
    };
    const fakeOptions = {};
    for (const [k, v] of Object.entries(options)) if (v !== undefined) fakeOptions[KEYS[k] ?? k] = v;
    await this.page.addInitScript((o) => {
      try {
        if (!sessionStorage.getItem('e2e-init')) {
          localStorage.setItem('cnl:test', '1');
          localStorage.setItem('cnl:test:opts', JSON.stringify(o));
          localStorage.setItem('cnl:lang', 'es');
          sessionStorage.setItem('e2e-init', '1');
        }
      } catch (e) {
        /* ignore */
      }
    }, fakeOptions);
    await this.page.goto('/');
  }

  // Simulated session already signed in and a club (with demo data or empty) in the simulated Drive.
  async enterClub({ demo = true } = {}) {
    await this.openApp({ session: true, demo });
    await this.waitForShell();
  }

  async waitForShell() {
    await this.page.locator('.topbar .brand-name').waitFor({ timeout: this.timeout });
  }

  // State of the simulated Drive (clubs, prefs, files) as the page sees it.
  async drive() {
    return this.page.evaluate(() => ({
      clubs: window.__CNL_FAKE__.clubs(),
      prefs: window.__CNL_FAKE__.prefs(),
      files: window.__CNL_FAKE__.archivos(),
    }));
  }

  async goTo(r) {
    await this.page.evaluate((x) => {
      location.hash = '#/' + x;
    }, r);
    await this.waitForActiveRoute(r);
    await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  }

  // The nav item of the route is current. On mobile only 4 routes sit in the bottom bar, but every route keeps its (hidden)
  // .nav-item, so this works for both layouts; "More" also becomes active when the route lives in its sheet.
  async waitForActiveRoute(r) {
    await this.page
      .locator(`.nav-item[data-route="${r}"].active[aria-current="page"]`)
      .waitFor({ state: 'attached', timeout: this.timeout });
  }

  async isMobile() {
    return (this.page.viewportSize()?.width ?? 1280) <= 820;
  }

  // Clicks a module in the navigation the way a person does: directly if it is visible, otherwise through the "More" sheet.
  async clickInMenu(r) {
    const item = this.page.locator(`.nav-item[data-route="${r}"]`);
    if (await item.isVisible()) {
      await item.click();
      return;
    }
    await this.page.locator('.nav-more').click();
    await this.page.locator(`.sheet .mas-item[data-route="${r}"]`).click();
    await this.page.locator('.sheet-overlay').waitFor({ state: 'detached', timeout: this.timeout });
  }

  // Settings and connection menu (header): language, theme, Drive status, disconnect / demo actions.
  async openAccountMenu() {
    const panel = this.page.locator('.account-panel');
    if (!(await panel.isVisible())) await this.page.locator('.account-btn').click();
    await panel.waitFor({ state: 'visible', timeout: this.timeout });
    return panel;
  }

  // "Disconnect Drive" from the menu, confirming the dialog.
  async disconnectDrive() {
    const panel = await this.openAccountMenu();
    await panel.getByRole('button', { name: 'Desconectar Drive' }).click();
    await this.page.locator('.sheet').getByRole('button', { name: 'Desconectar Drive' }).click();
  }

  // Retries an assertion until it holds or the time runs out
  async eventually(fn, message = 'The condition was not met') {
    const end = Date.now() + this.timeout;
    let last;
    for (;;) {
      try {
        await fn();
        return;
      } catch (e) {
        last = e;
      }
      if (Date.now() > end) throw new Error(`${message}: ${last?.message ?? last}`);
      await this.page.waitForTimeout(100);
    }
  }

  async expectVisible(locator, message) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout: this.timeout });
    } catch (e) {
      throw new Error(`${message || 'The expected element is not visible'}\n${e.message.split('\n')[0]}`, { cause: e });
    }
  }

  async expectHidden(locator, message) {
    try {
      await locator.first().waitFor({ state: 'hidden', timeout: this.timeout });
    } catch (e) {
      throw new Error(`${message || 'The element should not be visible'}\n${e.message.split('\n')[0]}`, { cause: e });
    }
  }

  async fill(scope, label, value) {
    const field = scope.getByLabel(label).first();
    await field.waitFor({ timeout: this.timeout });
    const tag = await field.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      // exact label or, if there is none, the first option that contains it (e.g. sessions with the date in front)
      const options = (await field.locator('option').allInnerTexts()).map((o) => o.trim());
      await field.selectOption({
        label: options.find((o) => o === value) ?? options.find((o) => o.includes(value)) ?? value,
      });
    } else await field.fill(value);
  }

  async fillTable(scope, table) {
    for (const [field, value] of table.raw()) await this.fill(scope, field, value);
  }
}

setWorldConstructor(CnlWorld);
