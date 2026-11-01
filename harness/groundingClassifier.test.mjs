import { readFileSync } from 'node:fs';
import { Harness, Rng } from './Harness.mjs';
import { GroundingClassifier } from '../core/engines/groundingClassifier.mjs';

const passport = JSON.parse(readFileSync(new URL('./groundingClassifier.harness.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../fixtures/czi8.golden.json', import.meta.url), 'utf8'));
const c = new GroundingClassifier();
const run = (input) => c.run(input);
const ALL = { statements: golden.items.map((i) => i[1]) };
const pool = golden.items.map((i) => i[1]).concat(['просто так', 'да', 'не знаю', '…']);

export const harness = new Harness(passport, [
  Harness.determinism(run, [ALL, {}, { statements: ['да'] }]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.levels.K1.badge === '⛔' && o.gap === '', 'пусто → ⛔') },
    { name: 'unclassifiable', input: { statements: ['да', 'ну', '…'] }, expect: (o, a) => a(o.status === 'ok' && o.classified === 0 && o.levels.K1.badge === '⛔', 'нет маркеров → доли ⛔, без NaN') },
    { name: 'single', input: { statements: ['Мне страшно.'] }, expect: (o, a) => a(o.levels.K2.value === 1 && o.gap === 'K1' && o.liberty_mode === 'А', 'одно K2 → разрыв K1, модус А') },
    { name: 'all-levels', input: ALL, expect: (o, a) => a(o.gap === '' && o.liberty_mode === '', 'все контуры заполнены → разрыва нет') }
  ]),
  Harness.custom('golden 8 × 10: точность ≥ 90 %', () => {
    const hits = golden.items.filter(([k, text]) => c.classify(text).level === k);
    const acc = hits.length / golden.items.length;
    const miss = golden.items.filter(([k, text]) => c.classify(text).level !== k).map(([k, text]) => `${k}≠${c.classify(text).level || '∅'}: «${text}»`);
    if (acc < 0.9) throw new Error(`точность ${(acc * 100).toFixed(0)} %: ${miss.slice(0, 5).join('; ')}`);
    return `${hits.length}/${golden.items.length} = ${(acc * 100).toFixed(0)} %${miss.length ? ` · промахи: ${miss.join('; ')}` : ''}`;
  }),
  Harness.custom('монотонность: добавление K3-высказываний не уменьшает долю K3', () => {
    const base = golden.items.slice(0, 40).map((i) => i[1]);
    const k3 = golden.items.filter((i) => i[0] === 'K3').map((i) => i[1]);
    let prev = -1;
    for (let n = 0; n <= 10; n += 1) { const share = run({ statements: base.concat(k3.slice(0, n)) }).levels.K3.value; if (share < prev - 1e-12) throw new Error(`доля K3 упала при n=${n}`); prev = share; }
    return `K3 растёт с 0 до ${prev.toFixed(2)}`;
  }),
  Harness.custom('устойчивость к перестановке', () => {
    const rng = new Rng(5);
    const shuffled = ALL.statements.slice().sort(() => rng.next() - 0.5);
    const a = run(ALL); const b = run({ statements: shuffled });
    if (JSON.stringify(a.levels) !== JSON.stringify(b.levels) || a.gap !== b.gap) throw new Error('профиль зависит от порядка');
    return 'профиль и разрыв инвариантны';
  }),
  Harness.stress(run, (rng) => ({ statements: Array.from({ length: Math.floor(rng.between(0, 12)) }, () => rng.pick(pool)) }), 1000, 20, 23)
]);
