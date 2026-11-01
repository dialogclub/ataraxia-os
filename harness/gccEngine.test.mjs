import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { GccEngine } from '../core/engines/gccEngine.mjs';

const passport = JSON.parse(readFileSync(new URL('./gccEngine.harness.json', import.meta.url), 'utf8'));
const team = JSON.parse(readFileSync(new URL('../fixtures/smfk100.team.json', import.meta.url), 'utf8'));
const run = (input) => new GccEngine().run(input);
const member = (Cr, Sr, Of) => ({ id: 'x', name: 'x', Cr, Sr, Of, Sc: 0.5 });

export const harness = new Harness(passport, [
  Harness.determinism(run, [team, { members: [] }, { members: [member(1, 1, 1), member(0, 0, 0), member(0.5, 0.5, 0.5)] }]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.Gcc.badge === '⛔', 'пусто → ⛔') },
    { name: 'single', input: { members: [member(0.9, 0.9, 0.9)] }, expect: (o, a) => a(o.status === 'missing', 'один участник → ⛔') },
    { name: 'two', input: { members: [member(0.9, 0.9, 0.9), member(0.8, 0.8, 0.8)] }, expect: (o, a) => a(o.status === 'missing' && /fail-closed/.test(o.reason), 'два участника → fail-closed ⛔ (как в Python)') },
    { name: 'identical', input: { members: [member(0.8, 0.5, 0.7), member(0.8, 0.5, 0.7), member(0.8, 0.5, 0.7)] }, expect: (o, a) => a(Math.abs(o.Gcc.value - 0.4) < 1e-6, 'одинаковые: Gcc = Cr·Sr = 0,4') },
    { name: 'one-invalid', input: { members: [member(0.8, 0.5, 0.7), member(1.2, 0.5, 0.7)] }, expect: (o, a) => a(o.status === 'missing', 'Cr > 1 → ⛔') },
    { name: 'extremes', input: { members: [member(0, 0, 0), member(1, 1, 1), member(1, 1, 1)] }, expect: (o, a) => a(o.Gcc.value === 0, 'нулевой участник → Gcc = 0') }
  ]),
  Harness.custom('фикстура: Gcc_formula совпадает с claimed-разрывом', () => {
    const out = run(team);
    if (out.Gcc.value !== team.metrics.Gcc_formula) throw new Error(`движок ${out.Gcc.value} ≠ фикстура ${team.metrics.Gcc_formula}`);
    if (out.geometric_mean_CrSr.value !== team.metrics.geometric_mean_CrSr) throw new Error('geo-mean расходится');
    if (out.sigma2_Of.value !== team.metrics.sigma2_Of) throw new Error('дисперсия расходится');
    return `Gcc = ${out.Gcc.value} 🟢 · заявлено артефактом ${team.metrics.Gcc_artifact_claimed} 🔵 (расхождение задокументировано, не усредняется)`;
  }),
  Harness.stress(run, (rng) => ({ members: Array.from({ length: 1 + Math.floor(rng.between(0, 10)) }, () => member(rng.next(), rng.next(), rng.next())) }), 1000, 2, 5),
  Harness.golden(run, [{ id: team.id, input: team, pick: (o) => o.Gcc.value, expect: [0.842491, 0.842491] }])
]);
