import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { maskPii } from '../core/pii.mjs';

const passport = JSON.parse(readFileSync(new URL('./maskPii.harness.json', import.meta.url), 'utf8'));
const run = (i) => maskPii(i.text, i.options);
const pool = ['Иван', 'тел.', '+380 67 123 45 67', 'a.b@x.ua', 'https://x.y/z?q=1', 'UA213223130000026007233566001', '4111 1111 1111 1111', '[10:02]', 'К.:', 'устал', '2026', '10:02:33', '—', ''];

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ text: 'Иван звонил +380 67 123 45 67', options: { knownNames: ['Иван'] } }, { text: '' }]),
  Harness.edges(run, [
    { name: 'empty', input: { text: '' }, expect: (o, a) => a(o.text === '' && o.total === 0, 'пусто') },
    { name: 'email', input: { text: 'пишите a.b@mail.ua' }, expect: (o, a) => a(o.text === 'пишите [EMAIL]' && o.counts.email === 1, o.text) },
    { name: 'phone', input: { text: 'звоните +380 67 123 45 67 или (044) 123-45-67' }, expect: (o, a) => a(o.counts.phone === 2 && !/\d{3}/.test(o.text), o.text) },
    { name: 'url', input: { text: 'см. https://example.com/a?b=c.' }, expect: (o, a) => a(o.counts.url === 1 && /\[URL\]/.test(o.text), o.text) },
    { name: 'iban', input: { text: 'счёт UA213223130000026007233566001' }, expect: (o, a) => a(o.counts.iban === 1, o.text) },
    { name: 'card', input: { text: 'карта 4111 1111 1111 1111' }, expect: (o, a) => a(o.counts.card === 1 && /\[CARD\]/.test(o.text), o.text) },
    { name: 'timecode-survives', input: { text: '[10:02] К.: в 10:02:33 я пришёл' }, expect: (o, a) => a(o.text === '[10:02] К.: в 10:02:33 я пришёл' && o.total === 0, `таймкоды целы: ${o.text}`) },
    { name: 'names-list', input: { text: 'Иван и Иванов, иван', options: { knownNames: ['Иван'] } }, expect: (o, a) => a(o.text === '[ИМЯ1] и Иванов, [ИМЯ1]' && o.counts.names === 2, `${o.text} (границы слова, регистр)`) },
    { name: 'no-ner-note', input: { text: 'Пётр Петров', options: { knownNames: [] } }, expect: (o, a) => a(o.text === 'Пётр Петров' && /NER нет/.test(o.names_note), 'имена вне списка не маскируются — и об этом сказано') }
  ]),
  Harness.custom('идемпотентность: повторное маскирование ничего не меняет', () => {
    const once = maskPii('Иван, +380 67 123 45 67, a@b.ua, https://x.y', { knownNames: ['Иван'] }).text;
    const twice = maskPii(once, { knownNames: ['Иван'] }).text;
    if (once !== twice) throw new Error(`${once} ≠ ${twice}`);
    return once;
  }),
  Harness.stress(run, (rng) => ({ text: Array.from({ length: Math.floor(rng.between(0, 8)) }, () => rng.pick(pool)).join(' '), options: rng.next() < 0.5 ? { knownNames: ['Иван'] } : undefined }), 2000, 5, 41)
]);
