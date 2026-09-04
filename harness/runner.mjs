// Раннер харнессов: `npm run harness -- <fn>` или `npm run harness:all`.
// Читает паспорта harness/*.harness.json, импортирует harness/<fn>.test.mjs, пишет report.json + report.md.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] === undefined ? 'all' : process.argv[2];

// UI-харнесс идёт последним: перед ним пишется промежуточный отчёт, чтобы оболочка на скриншотах видела актуальные статусы.
const passports = readdirSync(here)
  .filter((f) => f.endsWith('.harness.json'))
  .map((f) => JSON.parse(readFileSync(join(here, f), 'utf8')))
  .filter((p) => target === 'all' || p.fn === target)
  .sort((a, b) => (a.type === 'ui') - (b.type === 'ui') || a.fn.localeCompare(b.fn));

const writeReport = (list, partial) => {
  const summary = { generated: new Date().toISOString(), system: 'ATMARAKSI OS', partial, green: list.filter((r) => r.status === 'green').length, red: list.filter((r) => r.status === 'red').length, functions: list };
  writeFileSync(join(here, 'report.json'), JSON.stringify(summary, null, 2));
  return summary;
};

if (passports.length === 0) {
  console.error(`Паспорт для «${target}» не найден`);
  process.exit(2);
}

const reports = [];
for (const passport of passports) {
  if (target === 'all' && passport.type === 'ui') writeReport(reports, true);
  const mod = await import(pathToFileURL(join(here, `${passport.fn}.test.mjs`)).href);
  const report = await mod.harness.run();
  reports.push(report);
  console.log(`\n${report.status === 'green' ? '🟢' : '🔴'} ${report.fn} · ${report.type} · ${report.layer} · v${report.version} · ${report.total_ms} мс`);
  report.checks.forEach((c) => console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail} (${c.ms} мс)`));
}

const summary = target === 'all' ? writeReport(reports, false) : { green: reports.filter((r) => r.status === 'green').length, red: reports.filter((r) => r.status === 'red').length, generated: new Date().toISOString(), functions: reports };

if (target === 'all') {
  const md = [`# Отчёт харнессов · ${summary.generated}`, '', `Зелёных: ${summary.green} · Красных: ${summary.red}`, '']
    .concat(reports.flatMap((r) => [`## ${r.status === 'green' ? '🟢' : '🔴'} ${r.fn} (${r.type}, ${r.layer}, v${r.version})`, '']
      .concat(r.checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail} (${c.ms} мс)`)).concat([''])));
  writeFileSync(join(here, 'report.md'), md.join('\n'));
}

console.log(`\nИтого: 🟢 ${summary.green} · 🔴 ${summary.red}`);
process.exit(summary.red === 0 ? 0 : 1);
