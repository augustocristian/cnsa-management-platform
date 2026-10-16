import { setWorldConstructor, World } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

export const MODULOS = {
  'Inicio': 'inicio', 'Nadadores': 'nadadores', 'Grupos': 'grupos',
  'Entrenamientos': 'entrenamientos', 'Asistencia': 'asistencia', 'Cargas': 'cargas', 'Marcas': 'marcas',
  'Avisos y notas': 'comunicaciones', 'Configuración': 'club',
  'Planificación': 'planificacion', 'Calendario': 'calendario', 'Tutorial': 'tutorial',
};
export const DIALOGO = '.nad-modal, .grp-modal, .ent-modal, .modal';
const TIMEOUT = 8000;

export const ruta = (modulo) => {
  const r = MODULOS[modulo];
  assert.ok(r, `Módulo desconocido: ${modulo}`);
  return r;
};
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Regex que exige que aparezcan todas las palabras (en cualquier orden)
export const todasLasPalabras = (texto) =>
  new RegExp(texto.trim().split(/\s+/).map((p) => `(?=.*${esc(p)})`).join(''), 's');
export const regexTexto = (t) => new RegExp(esc(t));

class MundoCNL extends World {
  constructor(opts) {
    super(opts);
    this.errores = [];
    this.timeout = TIMEOUT;
  }

  get vista() { return this.page.locator('#view'); }

  // Diálogo abierto si lo hay; si no, la vista actual
  async ambito() {
    const d = this.page.locator(DIALOGO);
    if (await d.count()) return d.last();
    return (await this.vista.count()) ? this.vista : this.page;
  }

  // Abre la app con el adaptador de pruebas de Google (js/infrastructure/fakeGoogle.js, activado por localStorage['cnl:test']).
  // opciones: {sesion, demo, sinClientId, usuario, errorLogin, fallos}. Los indicadores se escriben una sola vez por pestaña:
  // las recargas posteriores conservan el "Drive" simulado (espejo en localStorage) y la sesión.
  async abrirApp(opciones = {}) {
    await this.page.addInitScript((o) => {
      try {
        if (!sessionStorage.getItem('e2e-init')) {
          localStorage.setItem('cnl:test', '1');
          localStorage.setItem('cnl:test:opts', JSON.stringify(o));
          localStorage.setItem('cnl:lang', 'es');
          sessionStorage.setItem('e2e-init', '1');
        }
      } catch (e) { /* ignorar */ }
    }, opciones);
    await this.page.goto('/');
  }

  // Sesión simulada ya iniciada y un club (con datos de demostración o vacío) en el Drive simulado.
  async entrarConClub({ demo = true } = {}) {
    await this.abrirApp({ sesion: true, demo });
    await this.esperarShell();
  }

  async esperarShell() { await this.page.locator('.topbar .brand-name').waitFor({ timeout: this.timeout }); }

  // Estado del Drive simulado (clubs, prefs, archivos) tal como lo ve la página.
  async drive() { return this.page.evaluate(() => ({ clubs: window.__CNL_FAKE__.clubs(), prefs: window.__CNL_FAKE__.prefs(), archivos: window.__CNL_FAKE__.archivos() })); }

  async irA(r) {
    await this.page.evaluate((x) => { location.hash = '#/' + x; }, r);
    await this.esperarRutaActiva(r);
    await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  }

  // The nav item of the route is current. On mobile only 4 routes sit in the bottom bar, but every route keeps its (hidden)
  // .nav-item, so this works for both layouts; "More" also becomes active when the route lives in its sheet.
  async esperarRutaActiva(r) {
    await this.page.locator(`.nav-item[data-route="${r}"].active[aria-current="page"]`).waitFor({ state: 'attached', timeout: this.timeout });
  }

  async esMovil() { return (this.page.viewportSize()?.width ?? 1280) <= 820; }

  // Clicks a module in the navigation the way a person does: directly if it is visible, otherwise through the "More" sheet.
  async pulsarEnMenu(r) {
    const item = this.page.locator(`.nav-item[data-route="${r}"]`);
    if (await item.isVisible()) { await item.click(); return; }
    await this.page.locator('.nav-more').click();
    await this.page.locator(`.sheet .mas-item[data-route="${r}"]`).click();
    await this.page.locator('.sheet-overlay').waitFor({ state: 'detached', timeout: this.timeout });
  }

  // Settings and connection menu (header): language, theme, Drive status, disconnect / demo actions.
  async abrirMenuCuenta() {
    const panel = this.page.locator('.account-panel');
    if (!(await panel.isVisible())) await this.page.locator('.account-btn').click();
    await panel.waitFor({ state: 'visible', timeout: this.timeout });
    return panel;
  }

  // "Disconnect Drive" from the menu, confirming the dialog.
  async desconectarDrive() {
    const panel = await this.abrirMenuCuenta();
    await panel.getByRole('button', { name: 'Desconectar Drive' }).click();
    await this.page.locator('.sheet').getByRole('button', { name: 'Desconectar Drive' }).click();
  }

  // Reintenta una aserción hasta que se cumple o vence el tiempo
  async eventually(fn, mensaje = 'La condición no se cumplió') {
    const fin = Date.now() + this.timeout;
    let ultimo;
    for (;;) {
      try { await fn(); return; } catch (e) { ultimo = e; }
      if (Date.now() > fin) throw new Error(`${mensaje}: ${ultimo?.message ?? ultimo}`);
      await this.page.waitForTimeout(100);
    }
  }

  async verVisible(locator, mensaje) {
    try { await locator.first().waitFor({ state: 'visible', timeout: this.timeout }); }
    catch (e) { throw new Error(`${mensaje || 'No se ve el elemento esperado'}\n${e.message.split('\n')[0]}`); }
  }

  async noVer(locator, mensaje) {
    try { await locator.first().waitFor({ state: 'hidden', timeout: this.timeout }); }
    catch (e) { throw new Error(`${mensaje || 'El elemento no debería verse'}\n${e.message.split('\n')[0]}`); }
  }

  async rellenar(ambito, etiqueta, valor) {
    const campo = ambito.getByLabel(etiqueta).first();
    await campo.waitFor({ timeout: this.timeout });
    const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      // etiqueta exacta o, si no existe, la primera opción que la contenga (p. ej. sesiones con fecha delante)
      const opciones = (await campo.locator('option').allInnerTexts()).map((o) => o.trim());
      await campo.selectOption({ label: opciones.find((o) => o === valor) ?? opciones.find((o) => o.includes(valor)) ?? valor });
    }
    else await campo.fill(valor);
  }

  async rellenarTabla(ambito, tabla) {
    for (const [campo, valor] of tabla.raw()) await this.rellenar(ambito, campo, valor);
  }
}

setWorldConstructor(MundoCNL);
