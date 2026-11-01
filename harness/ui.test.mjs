import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Harness } from './Harness.mjs';
import { audit } from '../scripts/screenshots.mjs';

const passport = JSON.parse(readFileSync(new URL('./ui.harness.json', import.meta.url), 'utf8'));
const root = fileURLToPath(new URL('../', import.meta.url));

export const harness = new Harness(passport, [
  Harness.custom('статический сканер (node --check · скобки · запреты · id)', () => {
    const r = spawnSync(process.execPath, [`${root}scripts/check.mjs`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
    return r.stdout.trim().split('\n').slice(-1)[0];
  }),
  Harness.custom('сборка single-file', () => {
    const r = spawnSync(process.execPath, [`${root}scripts/build-single.mjs`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.trim());
    return r.stdout.trim();
  }),
  Harness.custom('рендер 440×956 · 393×852 · 1280×800 + сценарий (скриншоты в docs/screenshots)', async () => {
    const findings = await audit({ shots: true });
    const bad = findings.filter((f) => !f.ok);
    if (bad.length) throw new Error(bad.map((f) => `${f.name}${f.detail ? ` — ${f.detail}` : ''}`).join('; '));
    return `${findings.length} проверок ✓`;
  })
]);
