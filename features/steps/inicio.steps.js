// Pasos del panel de inicio (features/inicio.feature).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const tarjeta = (mundo, titulo) => mundo.vista.locator('section.card').filter({ has: mundo.page.getByRole('heading', { name: titulo, level: 2 }) });

Then('el banner del panel muestra el nombre del club {string}', async function (nombre) {
  await this.verVisible(this.vista.locator('.ini-banner').getByRole('heading', { level: 1, name: nombre }), `El banner no muestra "${nombre}"`);
});

Then('el banner del panel resume las sesiones de hoy', async function () {
  await this.eventually(async () => {
    const txt = (await this.vista.locator('.ini-headline').innerText()).trim();
    assert.match(txt, /^(Hoy: \d+ (sesión|sesiones) · \d+ (nadador|nadadores) (esperado|esperados)|Hoy no hay sesiones)/);
  });
});

When('pulso la acción rápida {string}', async function (nombre) {
  await this.vista.locator('#ini-acciones').getByRole('link', { name: nombre }).click();
});

Then('la tarjeta {string} ofrece {string}', async function (titulo, accion) {
  const t = tarjeta(this, titulo);
  await this.verVisible(t.getByRole('link', { name: accion }), `La tarjeta "${titulo}" no ofrece "${accion}"`);
});

When('oculto los primeros pasos', async function () {
  await this.vista.getByRole('button', { name: 'Ocultar primeros pasos' }).click();
});

// Desktop: the cards form complete rows (no empty cell at the end of a row).
Then('las tarjetas del panel llenan cada fila sin huecos', async function () {
  await this.verVisible(this.vista.locator('.ini-grid > .ini-card').first());
  await this.eventually(async () => {
    const r = await this.page.evaluate(() => {
      const grid = document.querySelector('.ini-grid').getBoundingClientRect();
      const filas = new Map();
      for (const c of document.querySelectorAll('.ini-grid > .ini-card')) {
        const b = c.getBoundingClientRect();
        const clave = Math.round(b.top);
        filas.set(clave, (filas.get(clave) || 0) + b.width);
      }
      return { ancho: grid.width, filas: [...filas.values()] };
    });
    assert.ok(r.filas.length >= 2 && r.filas.length <= 4, `filas: ${r.filas.length}`);
    for (const w of r.filas) assert.ok(w >= r.ancho * 0.85, `fila incompleta: ${Math.round(w)} de ${Math.round(r.ancho)}`);
  });
});

Then('el panel no tiene desplazamiento horizontal', async function () {
  await this.verVisible(this.vista.locator('.ini-grid').first());
  const r = await this.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: window.innerWidth }));
  assert.ok(r.scroll <= r.ancho + 1, `La página se desborda: ${r.scroll} > ${r.ancho}`);
});

Then('los textos del gráfico semanal miden al menos {int} píxeles', async function (minimo) {
  await this.verVisible(this.vista.locator('#ini-grafico svg.ini-svg'));
  const r = await this.page.evaluate(() => {
    const svg = document.querySelector('#ini-grafico svg.ini-svg');
    const escala = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return [...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * escala);
  });
  assert.ok(r.length > 0);
  for (const px of r) assert.ok(px >= minimo - 0.01, `Texto de ${px.toFixed(1)} px en el gráfico`);
});

Then('el gráfico semanal tiene una tabla como alternativa', async function () {
  const svg = this.vista.locator('#ini-grafico svg.ini-svg');
  assert.equal(await svg.getAttribute('role'), 'img');
  assert.equal(await this.vista.locator('#ini-grafico table tbody tr').count(), 7);
});

Then('cada alerta de cargas del panel tiene icono y texto', async function () {
  await this.verVisible(this.vista.locator('#ini-alertas .alert').first());
  const n = await this.vista.locator('#ini-alertas .alert').count();
  for (let i = 0; i < n; i++) {
    const a = this.vista.locator('#ini-alertas .alert').nth(i);
    assert.equal(await a.locator('svg.icon').count(), 1);
    assert.match((await a.innerText()).trim(), /(Faltan|Exceso de) [\d.]+ m|Todas las cargas|Aún no hay cargas/);
  }
});
