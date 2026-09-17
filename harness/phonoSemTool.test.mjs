import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { PhonoSemTool, SCALE_MAP, PHON } from '../core/engines/phonoSemTool.mjs';

const passport = JSON.parse(readFileSync(new URL('./phonoSemTool.harness.json', import.meta.url), 'utf8'));
const run = (input) => new PhonoSemTool().run(input);
const SOFT = { text: 'мама милая, лилия нежная, мелодия ласковая, ласковый лунный луг' };
const ROUGH = { text: 'хрящ щетка шершавый скрежет, грохот, храп, шорох, чащоба' };
const words = ['мама', 'хрящ', 'сонце', 'дім', 'love', 'thunder', 'радость', 'страх', 'ми', 'we', 'зло', 'а', 'щ', '123', '—'];

export const harness = new Harness(passport, [
  Harness.determinism(run, [SOFT, ROUGH, { text: '' }]),
  Harness.edges(run, [
    { name: 'empty', input: { text: '' }, expect: (o, a) => a(o.status === 'missing' && o.polarity.badge === '⛔' && o.scales.length === 25, 'пусто → 25 шкал ⛔') },
    { name: 'digits-only', input: { text: '2026 09 04' }, expect: (o, a) => a(o.status === 'missing', 'цифры → ⛔') },
    { name: 'ru', input: { text: 'Сегодня я думаю о смысле и радуюсь.' }, expect: (o, a) => a(o.lang === 'ru' && o.scales.every((s) => s.value.badge === '🔵'), 'RU, все шкалы 🔵') },
    { name: 'uk', input: { text: 'Сьогодні я думаю про сенс і радію життю.' }, expect: (o, a) => a(o.lang === 'uk', `UA автоопределение: ${o.lang}`) },
    { name: 'en', input: { text: 'Today I think about meaning and feel joy.' }, expect: (o, a) => a(o.lang === 'en' && o.plutchik.joy.value === 1, 'EN, Плутчик joy') },
    { name: 'single-letter', input: { text: 'а' }, expect: (o, a) => a(o.status === 'ok' && o.words === 1, 'одна буква считается') }
  ]),
  Harness.custom('таблица PHON: 33 RU + 26 EN + 4 UA букв × 25 шкал, значения в [−2, 2]', () => {
    const letters = Object.keys(PHON);
    const bad = letters.filter((ch) => PHON[ch].length !== SCALE_MAP.length || PHON[ch].some((v) => v < -2 || v > 2));
    if (bad.length) throw new Error(`дефектные буквы: ${bad.join(',')}`);
    if (letters.length < 63) throw new Error(`букв ${letters.length} < 63`);
    return `${letters.length} букв × ${SCALE_MAP.length} шкал`;
  }),
  Harness.custom('«мягкий» vs «грубый» различаются по шкале нежный–грубый и по полярности', () => {
    const s = run(SOFT); const r = run(ROUGH);
    const i = SCALE_MAP.findIndex((x) => x[0] === 'нежный');
    if (!(s.scales[i].value.value > r.scales[i].value.value + 20)) throw new Error(`нежный–грубый: мягкий ${s.scales[i].value.value} vs грубый ${r.scales[i].value.value}`);
    if (!(s.polarity.value > r.polarity.value)) throw new Error('полярность не различает');
    if (!s.significant.includes('нежный') || !r.significant.includes('грубый')) throw new Error('значимые признаки не отмечены');
    return `нежный–грубый: ${s.scales[i].value.value.toFixed(0)} vs ${r.scales[i].value.value.toFixed(0)} · полярность ${s.polarity.value.toFixed(0)} vs ${r.polarity.value.toFixed(0)}`;
  }),
  Harness.stress(run, (rng) => ({ text: Array.from({ length: Math.floor(rng.between(0, 30)) }, () => rng.pick(words)).join(' ') }), 1000, 20, 17)
]);
