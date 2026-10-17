// ESLint flat config. `npm run lint` fails on any error and on more warnings than the baseline in package.json
// (--max-warnings), so the warning count can only go down. Layer rules live in scripts/check-arch.mjs.
import js from '@eslint/js';
import globals from 'globals';

const NODE_FILES = ['scripts/**/*.mjs', 'tests/**/*.js', 'features/**/*.js', 'cucumber.js', 'eslint.config.js'];

export default [
  { ignores: ['node_modules/', 'vendor/', 'docs/screenshots/', 'reports/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-shadow': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'error',
      'no-throw-literal': 'error',
      'require-await': 'off',
      'no-duplicate-imports': 'error',
      complexity: ['warn', 20],
      'max-depth': ['warn', 5],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 450, skipBlankLines: true, skipComments: true }],
    },
  },
  // Application code runs in the browser (and, for the pure layers, anywhere).
  { files: ['js/**/*.js'], languageOptions: { globals: { ...globals.browser, XLSX: 'readonly', jspdf: 'readonly' } } },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } } },
  // Tooling and tests run in Node; Playwright callbacks and jsdom tests also touch browser globals.
  {
    files: NODE_FILES,
    languageOptions: { globals: { ...globals.node, ...globals.browser, XLSX: 'readonly', jspdf: 'readonly' } },
  },
  // Test suites are long by nature (one callback per suite); size limits apply to product code and tooling.
  {
    files: ['tests/**/*.js', 'features/**/*.js'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
];
