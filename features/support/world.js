import { setWorldConstructor, World } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

export const MODULOS = {
  'Inicio': 'inicio', 'Mi espacio': 'mi-espacio', 'Nadadores': 'nadadores', 'Grupos': 'grupos',
  'Entrenamientos': 'entrenamientos', 'Asistencia': 'asistencia', 'Cargas': 'cargas', 'Marcas': 'marcas',
  'Bañador': 'banador', 'Comunicaciones': 'comunicaciones', 'Configuración': 'club',
  'Planificación': 'planificacion', 'Calendario': 'calendario',
};
export const ROLES = { 'Administrador': 'admin', 'Entrenador': 'entrenador', 'Nadador': 'nadador' };
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

  async entrarLocal() {
    await this.page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('e2e-init')) {
          localStorage.setItem('cnl:local', '1');
          localStorage.setItem('cnl:lang', 'es');
          sessionStorage.setItem('e2e-init', '1');
        }
      } catch (e) { /* ignorar */ }
    });
    await this.page.goto('/');
    await this.page.locator('.role-box strong').waitFor({ timeout: this.timeout });
  }

  async irA(r) {
    await this.page.evaluate((x) => { location.hash = '#/' + x; }, r);
    await this.page.locator(`.nav-item[data-route="${r}"].active`).waitFor({ timeout: this.timeout });
    await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
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
    if (tag === 'select') await campo.selectOption({ label: valor });
    else await campo.fill(valor);
  }

  async rellenarTabla(ambito, tabla) {
    for (const [campo, valor] of tabla.raw()) await this.rellenar(ambito, campo, valor);
  }
}

setWorldConstructor(MundoCNL);
