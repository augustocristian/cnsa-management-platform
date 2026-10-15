// Resumen Markdown de reports/*.xml (JUnit) para $GITHUB_STEP_SUMMARY.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const dir = 'reports';
const lineas = ['## Pruebas E2E (Cucumber)', '', '| Perfil | Escenarios | Fallos | Omitidos |', '|---|---|---|---|'];
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml'))) {
    const xml = readFileSync(`${dir}/${f}`, 'utf8');
    const m = /<testsuite[^>]*>/.exec(xml)?.[0] || '';
    const a = (n) => new RegExp(`${n}="(\\d+)"`).exec(m)?.[1] ?? '?';
    lineas.push(`| ${f.replace('.xml', '')} | ${a('tests')} | ${a('failures')} | ${a('skipped')} |`);
  }
}
console.log(lineas.join('\n'));
