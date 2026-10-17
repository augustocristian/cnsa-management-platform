// Cucumber configuration. VIEWPORT=mobile runs the mobile profile (Pixel 5).
const mobile = process.env.VIEWPORT === 'mobile';
const suffix = mobile ? '-mobile' : '';
const excluded = ['@google', '@pending', mobile ? '@desktop' : null].filter(Boolean);

export default {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.js', 'features/steps/**/*.js'],
  format: [
    'progress',
    `html:reports/cucumber${suffix}.html`,
    `junit:reports/cucumber${suffix}.xml`,
  ],
  tags: excluded.map((t) => `not ${t}`).join(' and '),
  retry: process.env.CI ? 2 : 0,
  worldParameters: { viewport: mobile ? 'mobile' : 'desktop' },
};
