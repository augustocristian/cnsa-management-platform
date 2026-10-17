// Markdown summary of reports/*.xml (JUnit) for $GITHUB_STEP_SUMMARY.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const dir = 'reports';
const lines = ['## E2E tests (Cucumber)', '', '| Profile | Scenarios | Failures | Skipped |', '|---|---|---|---|'];
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml'))) {
    const xml = readFileSync(`${dir}/${f}`, 'utf8');
    const m = /<testsuite[^>]*>/.exec(xml)?.[0] || '';
    const a = (n) => new RegExp(`${n}="(\\d+)"`).exec(m)?.[1] ?? '?';
    lines.push(`| ${f.replace('.xml', '')} | ${a('tests')} | ${a('failures')} | ${a('skipped')} |`);
  }
}
console.log(lines.join('\n'));
