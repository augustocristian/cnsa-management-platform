// Configuración de Cucumber. VIEWPORT=movil ejecuta el perfil móvil (Pixel 5).
const movil = process.env.VIEWPORT === 'movil';
const sufijo = movil ? '-movil' : '';
const excluidos = ['@google', '@pendiente', movil ? '@escritorio' : null].filter(Boolean);

export default {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.js', 'features/steps/**/*.js'],
  format: [
    'progress',
    `html:reports/cucumber${sufijo}.html`,
    `junit:reports/cucumber${sufijo}.xml`,
  ],
  tags: excluidos.map((t) => `not ${t}`).join(' and '),
  retry: process.env.CI ? 2 : 0,
  worldParameters: { viewport: movil ? 'movil' : 'escritorio' },
};
