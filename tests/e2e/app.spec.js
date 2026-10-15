import { test, expect } from '@playwright/test';
import { entrarLocal, irA } from './helpers.js';

const MODULOS = ['inicio', 'nadadores', 'grupos', 'entrenamientos', 'asistencia', 'cargas', 'marcas', 'banador', 'comunicaciones', 'club'];

test('login: muestra pantalla y entra en modo local', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CNL Plataforma' })).toBeVisible();
  await page.getByRole('button', { name: 'Probar en modo local' }).click();
  await expect(page.locator('.role-box strong')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();
});

test('navegación por todos los módulos sin errores', async ({ page }) => {
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('response', (r) => { if (r.url().startsWith('http://localhost:4173') && r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  await entrarLocal(page);
  for (const ruta of MODULOS) {
    await irA(page, ruta);
    await expect(page.locator('#view .loading')).toHaveCount(0);
    await expect(page.getByText('Error al mostrar la vista')).toHaveCount(0);
    await expect(page.getByText('Próximamente')).toHaveCount(0);
    await expect(page.locator('#view')).not.toBeEmpty();
  }
  expect(errores).toEqual([]);
});

test('dashboard muestra las tarjetas', async ({ page }) => {
  await entrarLocal(page);
  for (const t of ['Acceso rápido', 'Control de cargas semanal del club', 'Alertas de cargas', 'Próxima sesión', 'Asistencia hoy', 'Comunicaciones recientes']) {
    await expect(page.getByRole('heading', { name: t })).toBeVisible();
  }
});

test('alta de nadador aparece en listado y ficha', async ({ page }) => {
  await entrarLocal(page);
  await irA(page, 'nadadores');
  await page.getByRole('button', { name: 'Nuevo nadador' }).click();
  await page.getByLabel('Nombre *').fill('Zacarías');
  await page.getByLabel('Apellidos *').fill('Testeo Prueba');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Testeo Prueba, Zacarías/ });
  await expect(fila).toBeVisible();
  await fila.click();
  await expect(page.getByRole('heading', { name: 'Zacarías Testeo Prueba' })).toBeVisible();
});

test('crear entrenamiento y pasar lista', async ({ page }) => {
  await entrarLocal(page);
  await irA(page, 'entrenamientos');
  await page.getByRole('button', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Título').fill('Sesión E2E');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Sesión E2E')).toBeVisible();

  await irA(page, 'asistencia');
  await page.getByRole('button', { name: 'Pasar lista' }).click();
  await page.locator('#view select').first().selectOption({ label: await page.locator('#view select option', { hasText: 'Sesión E2E' }).first().innerText() });
  await expect(page.getByText('Presentes: 0')).toBeVisible();
  const primero = page.locator('.asi-sw').first();
  await expect(primero).toBeVisible();
  await primero.click();
  await expect(page.getByText('Presentes: 1')).toBeVisible();
  await expect(page.locator('.asi-sw').first()).toContainText('Presente');
});

test('registrar carga y marca', async ({ page }) => {
  await entrarLocal(page);
  await irA(page, 'cargas');
  const formC = page.locator('form.cg-form');
  await formC.getByLabel('Nadador').selectOption({ index: 1 });
  await formC.getByLabel('Metros').fill('3250');
  await formC.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Carga registrada')).toBeVisible();

  await irA(page, 'marcas');
  const formM = page.locator('form').filter({ has: page.getByLabel('Tiempo (mm:ss.cc)') });
  await formM.getByLabel('Nadador').selectOption({ index: 1 });
  await formM.getByLabel('Tiempo (mm:ss.cc)').fill('01:02.45');
  await formM.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Marca registrada')).toBeVisible();
});

test('cambio de rol a Nadador oculta menús', async ({ page }) => {
  await entrarLocal(page);
  await expect(page.locator('.nav-item[data-route="nadadores"]')).toBeAttached();
  await page.locator('#role-select').selectOption('nadador');
  await expect(page.locator('.role-box strong')).toHaveText('Nadador');
  await expect(page.locator('.nav-item[data-route="mi-espacio"]')).toBeAttached();
  for (const r of ['nadadores', 'grupos', 'entrenamientos', 'asistencia', 'cargas', 'marcas', 'banador', 'club']) {
    await expect(page.locator(`.nav-item[data-route="${r}"]`)).toHaveCount(0);
  }
  await expect(page.locator('.nav-item[data-route="comunicaciones"]')).toBeAttached();
});

test('los datos persisten tras recargar', async ({ page }) => {
  await entrarLocal(page);
  await irA(page, 'nadadores');
  await page.getByRole('button', { name: 'Nuevo nadador' }).click();
  await page.getByLabel('Nombre *').fill('Persistente');
  await page.getByLabel('Apellidos *').fill('Recarga');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('row', { name: /Recarga, Persistente/ })).toBeVisible();
  await page.reload();
  await irA(page, 'nadadores');
  await expect(page.getByRole('row', { name: /Recarga, Persistente/ })).toBeVisible();
});

test('manifest válido y service worker registrado', async ({ page, request }) => {
  await entrarLocal(page);
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBeTruthy();
  expect(m.start_url).toBeTruthy();
  expect(m.display).toBe('standalone');
  expect(m.icons.length).toBeGreaterThan(0);
  for (const ic of m.icons) expect((await request.get('/' + ic.src)).ok()).toBeTruthy();
  const activo = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  expect(activo).toBe(true);
});

test('layout móvil sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await entrarLocal(page);
  for (const ruta of ['inicio', 'nadadores', 'entrenamientos', 'cargas', 'marcas']) {
    await irA(page, ruta);
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(0);
  }
});
