import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { LexisTool } from '../core/engines/lexisTool.mjs';

const passport = JSON.parse(readFileSync(new URL('./lexisTool.harness.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('../fixtures/lexis.golden.json', import.meta.url), 'utf8'));
const run = (input) => new LexisTool().run(input);
const G = { lines: golden.lines, focus: golden.focus };
const words = ['я', 'мы', 'они', 'должен', 'можно', 'раньше', 'плохо', 'хочу', 'буду', 'треба', 'ми', 'зараз', 'i', 'we', 'must', 'всё', 'равно', 'дом', 'work', '—'];

export const harness = new Harness(passport, [
  Harness.determinism(run, [G, {}, { lines: [{ speaker: 'A', text: 'Ми повинні. Я втомився.' }] }]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.pronouns.i.badge === '⛔' && o.heatmap.badge === '⛔', 'пусто → нули с ⛔') },
    { name: 'no-speakers', input: { lines: [{ text: 'я устал' }] }, expect: (o, a) => a(o.balance['?'] !== undefined && o.pronouns.i.value === 100, 'спикер «?» и я = 100 %') },
    { name: 'mixed-ru-ua', input: { lines: [{ speaker: 'К.', text: 'Я втомився, мені погано. Ми повинні щось змінити.' }] }, expect: (o, a) => a(o.pronouns.counts.i === 2 && o.pronouns.counts.we === 1 && o.modality.counts.must === 1 && o.lang.uk === 1, `UA: я=2, ми=1, повинні=1, lang=${JSON.stringify(o.lang)}`) },
    { name: 'en', input: { lines: [{ speaker: 'C', text: 'I must go. We can talk later.' }] }, expect: (o, a) => a(o.pronouns.counts.i === 1 && o.pronouns.counts.we === 1 && o.modality.counts.must === 1 && o.modality.counts.can === 1 && o.lang.en === 1, 'EN считается') },
    { name: 'no-timestamps', input: { lines: [{ speaker: 'К.', text: 'я', t: '#1' }] }, expect: (o, a) => a(o.heatmap.badge === '⛔' && o.heatmap.stamped === 0, 'без меток → тепловая карта ⛔') },
    { name: 'punctuation-only', input: { lines: [{ speaker: 'К.', text: '… — ?!' }] }, expect: (o, a) => a(o.status === 'ok' && o.pronouns.i.badge === '⛔' && o.scope_words === 0, 'нет слов → доли ⛔, без NaN') }
  ]),
  Harness.custom('golden: доли посчитаны вручную', () => {
    const o = run(G); const e = golden.expect;
    const checks = [['я %', o.pronouns.i.value, e.pronouns.i], ['они %', o.pronouns.they.value, e.pronouns.they], ['мы %', o.pronouns.we.value, e.pronouns.we], ['доля К.', o.balance['К.'].share.value, e.share_K], ['доля Т.', o.balance['Т.'].share.value, e.share_T], ['вопросы Т.', o.balance['Т.'].questions.value, e.questions_T], ['час 10', o.heatmap.hours[10], e.hours['10']], ['час 22', o.heatmap.hours[22], e.hours['22']]];
    checks.forEach(([name, got, want]) => { if (Math.abs(got - want) > 1e-9) throw new Error(`${name}: ${got} ≠ ${want}`); });
    if (Math.abs(o.modality.must.value - e.must_per_1000) > 0.01) throw new Error(`должен ‰: ${o.modality.must.value}`);
    return checks.map(([n, g]) => `${n}=${g}`).join(' · ');
  }),
  Harness.custom('устойчивость к перестановке реплик', () => {
    const a = run(G); const b = run({ lines: G.lines.slice().reverse(), focus: G.focus });
    if (JSON.stringify(a.pronouns) !== JSON.stringify(b.pronouns) || JSON.stringify(a.heatmap) !== JSON.stringify(b.heatmap)) throw new Error('результат зависит от порядка');
    return 'местоимения и карта не зависят от порядка';
  }),
  Harness.stress(run, (rng) => ({ lines: Array.from({ length: Math.floor(rng.between(0, 6)) }, () => ({ speaker: rng.pick(['К.', 'Т.', '']), text: Array.from({ length: Math.floor(rng.between(0, 12)) }, () => rng.pick(words)).join(' '), t: rng.pick(['[10:15]', '#3', '2026-09-04T22:10:00Z', '']) })), focus: rng.pick(['К.', 'нет', '']) }), 1000, 20, 13),
  Harness.golden(run, [{ id: 'i', input: G, pick: (o) => o.pronouns.i.value, expect: [80, 80] }, { id: 'they', input: G, pick: (o) => o.pronouns.they.value, expect: [20, 20] }, { id: 'must', input: G, pick: (o) => o.modality.must.value, expect: [71, 72] }])
]);
