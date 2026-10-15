import { expect } from '@playwright/test';

// Entra en modo local (siembra datos demo en el primer arranque).
// El flag solo se fija una vez por pestaña para no pisar el estado tras recargar.
export async function entrarLocal(page) {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('e2e-init')) {
        localStorage.setItem('cnl:local', '1');
        sessionStorage.setItem('e2e-init', '1');
      }
    } catch (e) { /* ignorar */ }
  });
  await page.goto('/');
  await expect(page.locator('.role-box strong')).toBeVisible();
}

// Navega por hash (el menú es lateral en escritorio y barra inferior en móvil: ambos son <a data-route>)
export async function irA(page, ruta) {
  await page.evaluate((r) => { location.hash = '#/' + r; }, ruta);
  await expect(page.locator(`.nav-item[data-route="${ruta}"]`)).toHaveClass(/active/);
}
