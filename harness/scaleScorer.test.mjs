import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { ScaleScorer, SCALE_KEYS } from '../core/engines/scaleScorer.mjs';

const passport = JSON.parse(readFileSync(new URL('./scaleScorer.harness.json', import.meta.url), 'utf8'));
const run = (input) => new ScaleScorer().run(input);
const fill = (n, v) => new Array(n).fill(v);

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ scale: 'PHQ9', answers: fill(9, 1) }, {}, { scale: 'GALLUP34', ranking: ['Achiever', 'Empathy', 'Learner', 'Woo', 'Focus'] }]),
  Harness.edges(run, [
    { name: 'unknown-scale', input: { scale: 'XYZ', answers: [1] }, expect: (o, a) => a(o.status === 'missing' && /неизвестная/.test(o.reason), 'неизвестная шкала → ⛔') },
    { name: 'incomplete', input: { scale: 'PHQ-9', answers: [1, 2] }, expect: (o, a) => a(o.status === 'missing' && o.total.badge === '⛔' && /неполный/.test(o.reason), 'неполный → ⛔, не число') },
    { name: 'out-of-range', input: { scale: 'GAD7', answers: [0, 1, 2, 3, 4, 0, 0] }, expect: (o, a) => a(o.status === 'missing' && /пункты 5/.test(o.reason), 'ответ 4 при max 3 → ⛔ с номером пункта') },
    { name: 'proprietary', input: { scale: '16PF', answers: fill(185, 1) }, expect: (o, a) => a(o.status === 'missing' && /проприетар/.test(o.reason), '16PF → ⛔ честно') },
    { name: 'ranking-invalid', input: { scale: 'ROKEACH', ranking: [1, 1, 2] }, expect: (o, a) => a(o.status === 'missing', 'не перестановка → ⛔') }
  ]),
  Harness.custom('эталонные ключи и границы', () => {
    const checks = [
      ['PHQ9 нули', run({ scale: 'PHQ9', answers: fill(9, 0) }).total.value, 0], ['PHQ9 максимум', run({ scale: 'PHQ9', answers: fill(9, 3) }).total.value, 27],
      ['GAD7 максимум', run({ scale: 'GAD7', answers: fill(7, 3) }).total.value, 21], ['TAS20 все 3 (с реверсом)', run({ scale: 'TAS20', answers: fill(20, 3) }).total.value, 60],
      ['TAS20 все 5 → реверс даёт 5 обратных', run({ scale: 'TAS20', answers: fill(20, 5) }).total.value, 15 * 5 + 5 * 1],
      ['MBI EE все 3', run({ scale: 'MBI', answers: fill(22, 3) }).subscales.EE.score.value, 27], ['MBI PA все 3', run({ scale: 'MBI', answers: fill(22, 3) }).subscales.PA.score.value, 24],
      ['SCL90 GSI все 4', run({ scale: 'SCL90R', answers: fill(90, 4) }).indices.GSI.value, 4], ['SCL90 PST нули', run({ scale: 'SCL90R', answers: fill(90, 0) }).indices.PST.value, 0],
      ['IPIP E % при всех 3', run({ scale: 'IPIP50', answers: fill(50, 3) }).subscales.E.score.value, 50], ['IPIP N % при всех 5 (реверс 8 из 10)', run({ scale: 'IPIP50', answers: fill(50, 5) }).subscales.N.score.value, ((2 * 5 + 8 * 1 - 10) / 40) * 100]
    ];
    checks.forEach(([n, got, want]) => { if (Math.abs(got - want) > 1e-9) throw new Error(`${n}: ${got} ≠ ${want}`); });
    const sub = Object.keys(SCALE_KEYS.SCL90R.subscales).reduce((a, k) => a + SCALE_KEYS.SCL90R.subscales[k].length, 0);
    if (sub !== 83) throw new Error(`SCL-90-R: пунктов в 9 шкалах ${sub} ≠ 83 (7 дополнительных)`);
    return checks.map(([n, g]) => `${n}=${Number(g.toFixed(2))}`).join(' · ');
  }),
  Harness.custom('границы диапазонов и флаг кризиса', () => {
    const bands = [[4, 'минимальная'], [5, 'лёгкая'], [9, 'лёгкая'], [10, 'умеренная'], [14, 'умеренная'], [15, 'умеренно-тяжёлая'], [19, 'умеренно-тяжёлая'], [20, 'тяжёлая'], [27, 'тяжёлая']];
    bands.forEach(([total, want]) => { const answers = fill(9, 0); let left = total; for (let i = 0; i < 9 && left > 0; i += 1) { answers[i] = Math.min(3, left); left -= answers[i]; } const got = run({ scale: 'PHQ9', answers }).band; if (got !== want) throw new Error(`PHQ9=${total}: ${got} ≠ ${want}`); });
    const f = run({ scale: 'PHQ9', answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] }).flags;
    if (f.length !== 1) throw new Error('item9 > 0 не поднял флаг');
    if (run({ scale: 'GAD7', answers: [3, 3, 3, 1, 0, 0, 0] }).band !== 'умеренная') throw new Error('GAD7=10 не «умеренная»');
    return `${bands.length} границ PHQ-9 · флаг item9 · GAD-7 = 10 → умеренная`;
  }),
  Harness.custom('Gallup-34: домены из импортированного рейтинга', () => {
    const o = run({ scale: 'GALLUP34', ranking: ['Achiever', 'Empathy', 'Learner', 'Woo', 'Focus', 'Ideation'] });
    if (o.domains['Исполнение'].value !== 2 || o.domains['Отношения'].value !== 1 || o.domains['Стратегия'].value !== 1 || o.domains['Влияние'].value !== 1) throw new Error(JSON.stringify(o.domains));
    return 'топ-5: Исполнение 2 · Влияние 1 · Отношения 1 · Стратегия 1';
  }),
  Harness.stress(run, (rng) => { const id = rng.pick(Object.keys(SCALE_KEYS)); const k = SCALE_KEYS[id]; if (k.items) return { scale: id, answers: Array.from({ length: rng.next() < 0.8 ? k.items : Math.floor(rng.between(0, k.items)) }, () => Math.floor(rng.between(k.min - 1, k.max + 2))) }; return { scale: id, ranking: k.domains ? ['Achiever', 'Empathy', 'Learner', 'Woo', 'Focus'] : Array.from({ length: 18 }, (_, i) => i + 1) }; }, 1000, 5, 29),
  Harness.golden(run, [
    { id: 'phq9-zeros', input: { scale: 'PHQ9', answers: fill(9, 0) }, pick: (o) => o.total.value, expect: [0, 0] },
    { id: 'phq9-max', input: { scale: 'PHQ9', answers: fill(9, 3) }, pick: (o) => o.total.value, expect: [27, 27] },
    { id: 'tas20-all3', input: { scale: 'TAS20', answers: fill(20, 3) }, pick: (o) => o.total.value, expect: [60, 60] },
    { id: 'mbi-ee', input: { scale: 'MBI', answers: fill(22, 3) }, pick: (o) => o.subscales.EE.score.value, expect: [27, 27] },
    { id: 'scl90-gsi', input: { scale: 'SCL90R', answers: fill(90, 4) }, pick: (o) => o.indices.GSI.value, expect: [4, 4] },
    { id: 'ipip-mid', input: { scale: 'IPIP50', answers: fill(50, 3) }, pick: (o) => o.subscales.E.score.value, expect: [50, 50] }
  ])
]);
