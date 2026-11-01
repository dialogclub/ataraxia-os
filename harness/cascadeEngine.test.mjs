import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { CascadeEngine } from '../core/engines/cascadeEngine.mjs';

const passport = JSON.parse(readFileSync(new URL('./cascadeEngine.harness.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../fixtures/cascade.konstantin.json', import.meta.url), 'utf8'));
const run = (input) => new CascadeEngine(input === undefined || input === null ? 'none' : input.form).run(input);

export const harness = new Harness(passport, [
  Harness.determinism(run, [golden.input, { A: 0.5, D: 0.5, C: 0.5, phi: 0.5, form: 'cbrt' }, {}]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.B.badge === '⛔', 'пустой вход должен дать ⛔') },
    { name: 'phi-zero', input: { A: 1, D: 1, C: 1, phi: 0 }, expect: (o, a) => a(o.B.value === 0, 'Φ = 0 → B = 0') },
    { name: 'all-ones', input: { A: 1, D: 1, C: 1, phi: 1 }, expect: (o, a) => a(o.B.value === 1, 'все единицы → B = 1') },
    { name: 'out-of-range', input: { A: 1.5, D: 0.5, C: 0.5, phi: 0.5 }, expect: (o, a) => a(o.status === 'missing', 'A > 1 → ⛔, не число') },
    { name: 'nan-input', input: { A: Number.NaN, D: 0.5, C: 0.5, phi: 0.5 }, expect: (o, a) => a(o.status === 'missing', 'NaN → ⛔') },
    { name: 'cbrt-form', input: { A: 0.5, D: 0.5, C: 0.5, phi: 1, form: 'cbrt' }, expect: (o, a) => a(Math.abs(o.B.value - 0.5) < 1e-9, '∛(0,125) = 0,5') }
  ]),
  Harness.custom('монотонность по каждому аргументу', () => {
    const base = { A: 0.6, D: 0.6, C: 0.6, phi: 0.6 };
    ['A', 'D', 'C', 'phi'].forEach((k) => {
      let prev = -1;
      for (let x = 0; x <= 1.0001; x += 0.05) {
        const b = run({ ...base, [k]: Math.min(1, x) }).B.value;
        if (b < prev - 1e-12) throw new Error(`${k}: B убывает при росте аргумента`);
        prev = b;
      }
    });
    return '4 аргумента × 21 шаг, неубывание';
  }),
  Harness.stress(run, (rng) => ({ A: rng.next(), D: rng.next(), C: rng.next(), phi: rng.next(), form: rng.pick(['none', 'cbrt']) }), 2000, 5, 7),
  Harness.golden(run, [{ id: golden.id, input: golden.input, pick: (o) => Number(o.B.value.toFixed(2)), expect: golden.expect.B }])
]);
