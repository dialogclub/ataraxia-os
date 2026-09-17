import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { StimulusGate, StimulusSession } from '../core/engines/stimulusGate.mjs';

const passport = JSON.parse(readFileSync(new URL('./stimulusGate.harness.json', import.meta.url), 'utf8'));
const run = (input) => new StimulusGate('wellness').decide(input);

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ flicker_hz: 20, spl_db: 60 }, {}, { flicker_hz: 10, spl_db: 90, hour_local: 3 }]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.allowed === true && o.flicker_hz.badge === '⛔', 'без параметров — разрешено, числа ⛔') },
    { name: 'band-edges', input: { flicker_hz: 15 }, expect: (o, a) => a(o.allowed === false && run({ flicker_hz: 25 }).allowed === false && run({ flicker_hz: 14.99 }).allowed === true && run({ flicker_hz: 25.01 }).allowed === true, 'границы 15/25 включительно') },
    { name: 'nan', input: { flicker_hz: Number.NaN }, expect: (o, a) => a(o.allowed === false, 'NaN частота → блок') },
    { name: 'negative', input: { flicker_hz: -5 }, expect: (o, a) => a(o.allowed === false, 'отрицательная частота → блок') },
    { name: 'night', input: { flicker_hz: 8, spl_db: 50, hour_local: 3 }, expect: (o, a) => a(o.allowed === true && o.warnings.length === 1, 'ночь — предупреждение, не блок') }
  ]),
  Harness.custom('предел громкости 85 дБ', () => {
    if (run({ spl_db: 85 }).allowed !== true) throw new Error('85 дБ должно быть разрешено');
    if (run({ spl_db: 85.1 }).allowed !== false) throw new Error('85,1 дБ должно быть заблокировано');
    if (run({ spl_db: 80 }).warnings.length !== 1) throw new Error('80 дБ — предупреждение');
    return '85 ✓ · 85,1 ✗ · 80 ⚠';
  }),
  Harness.custom('гейт непроходим программно', () => {
    const gate = new StimulusGate('pro');
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(gate)).concat(Object.keys(gate));
    const bad = names.filter((n) => /override|bypass|force|unsafe|disable/i.test(n));
    if (bad.length > 0) throw new Error(`методы обхода: ${bad.join(', ')}`);
    if (!Object.isFrozen(gate) || !Object.isFrozen(StimulusGate.rules())) throw new Error('гейт или правила не заморожены');
    if (new StimulusGate('pro').decide({ flicker_hz: 20, override: true }).allowed) throw new Error('флаг override обошёл гейт');
    return 'нет методов обхода; правила заморожены; режим pro блокирует 15–25 Гц';
  }),
  Harness.stress((input) => {
    const out = run(input);
    if (input.flicker_hz >= 15 && input.flicker_hz <= 25 && out.allowed) throw new Error(`${input.flicker_hz} Гц пропущено`);
    return out;
  }, (rng) => ({ flicker_hz: rng.between(0, 60), spl_db: rng.between(0, 120), hour_local: Math.floor(rng.between(0, 24)) }), 2000, 2, 11),
  Harness.custom('аварийный стоп < 100 мс (×100)', () => {
    let worst = 0;
    for (let i = 0; i < 100; i += 1) {
      const s = new StimulusSession(() => performance.now());
      if (!s.running()) throw new Error('сессия не запущена');
      const lat = s.stop();
      if (s.running()) throw new Error('сессия не остановилась');
      worst = Math.max(worst, lat.value);
    }
    if (worst >= 100) throw new Error(`худшая латентность ${worst} мс`);
    return `100 стопов · худшая ${worst.toFixed(3)} мс < 100 мс`;
  })
]);
