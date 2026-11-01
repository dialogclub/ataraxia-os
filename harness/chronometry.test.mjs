import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { Chronometry } from '../core/engines/chronometry.mjs';

const passport = JSON.parse(readFileSync(new URL('./chronometry.harness.json', import.meta.url), 'utf8'));
const run = (input) => new Chronometry().run(input);

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ game_minutes: 240 }, {}, { game_minutes: 0 }]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.years.badge === '⛔', '⛔ без входа') },
    { name: 'zero', input: { game_minutes: 0 }, expect: (o, a) => a(o.days.value === 0, '0 мин → 0 дней') },
    { name: 'negative', input: { game_minutes: -1 }, expect: (o, a) => a(o.status === 'missing', 'отрицательное → ⛔') },
    { name: 'nan', input: { game_minutes: Number.NaN }, expect: (o, a) => a(o.status === 'missing', 'NaN → ⛔') }
  ]),
  Harness.custom('обратимость минуты ↔ годы', () => {
    const c = new Chronometry();
    const years = c.run({ game_minutes: 120 }).years.value;
    const back = c.minutesFor(years).value;
    if (Math.abs(back - 120) > 1e-9) throw new Error(`120 → ${years} лет → ${back} мин`);
    return `120 мин → ${years.toFixed(2)} лет → ${back.toFixed(6)} мин`;
  }),
  Harness.stress(run, (rng) => ({ game_minutes: rng.between(0, 600) }), 1000, 1, 3),
  Harness.golden(run, [{ id: '240min', input: { game_minutes: 240 }, pick: (o) => Number(o.years.value.toFixed(2)), expect: [39, 41] }])
]);
