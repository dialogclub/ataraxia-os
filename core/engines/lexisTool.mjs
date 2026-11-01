// lexisTool (ЛЕКСИС): транскрипт со спикерами → местоимения (я/мы/ты/они), модальность (долженствование/возможность),
// Zimbardo-прокси 🔵, спикер-баланс, инициативность, тепловая карта 24 ч. Счётчики — 🟢; лексические прокси — 🔵.
// Калибровочная оговорка: словари маркеров RU/UA/EN — методологическая реконструкция, расширяются без изменения логики.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'lexisTool';

const LEX = Object.freeze({
  i: ['я', 'меня', 'мне', 'мной', 'мною', 'мой', 'моя', 'моё', 'мое', 'мои', 'моего', 'моей', 'моих', 'моим', 'моими', 'мою', 'мене', 'мені', 'мій', 'моє', 'мої', 'мого', 'моєї', 'моїх', 'моїм', 'моїми', 'i', 'me', 'my', 'mine', 'myself'],
  we: ['мы', 'нас', 'нам', 'нами', 'наш', 'наша', 'наше', 'наши', 'нашего', 'нашей', 'наших', 'нашим', 'нашими', 'нашу', 'ми', 'наші', 'нашого', 'нашої', 'we', 'us', 'our', 'ours', 'ourselves'],
  you: ['ты', 'тебя', 'тебе', 'тобой', 'тобою', 'твой', 'твоя', 'твоё', 'твое', 'твои', 'твоего', 'твоей', 'твоих', 'твоим', 'твою', 'вы', 'вас', 'вам', 'вами', 'ваш', 'ваша', 'ваше', 'ваши', 'вашего', 'вашей', 'ваших', 'вашим', 'вашу', 'ти', 'тобі', 'твій', 'твоє', 'твої', 'твого', 'твоєї', 'твоїх', 'твоїм', 'ви', 'ваші', 'вашого', 'вашої', 'you', 'your', 'yours', 'yourself'],
  they: ['они', 'их', 'им', 'ими', 'них', 'ним', 'ними', 'вони', 'їх', 'їм', 'їхній', 'їхня', 'їхнє', 'їхні', 'they', 'them', 'their', 'theirs', 'themselves'],
  must: ['должен', 'должна', 'должны', 'должно', 'надо', 'нужно', 'нужен', 'нужна', 'обязан', 'обязана', 'обязаны', 'следует', 'придётся', 'придется', 'необходимо', 'вынужден', 'вынуждена', 'повинен', 'повинна', 'повинні', 'треба', 'потрібно', 'мушу', 'мусиш', 'мусить', 'мусимо', 'доведеться', 'необхідно', 'змушений', 'змушена', 'must', 'should', 'ought', 'need', 'obliged'],
  can: ['могу', 'можешь', 'может', 'можем', 'можете', 'могут', 'можно', 'возможно', 'мог', 'могла', 'могли', 'смогу', 'сможет', 'сможем', 'вправе', 'можу', 'можеш', 'може', 'можемо', 'можете', 'можуть', 'можна', 'можливо', 'міг', 'зможу', 'зможе', 'зможемо', 'can', 'could', 'may', 'might', 'able', 'possible'],
  past: ['раньше', 'тогда', 'было', 'был', 'была', 'были', 'прошлом', 'детстве', 'когда-то', 'давно', 'вспоминаю', 'помню', 'раніше', 'тоді', 'було', 'був', 'була', 'були', 'минулому', 'дитинстві', 'колись', 'згадую', 'пам’ятаю', "пам'ятаю", 'before', 'then', 'was', 'were', 'ago', 'remember', 'childhood'],
  future: ['буду', 'будет', 'будем', 'будешь', 'будете', 'завтра', 'потом', 'планирую', 'собираюсь', 'скоро', 'надеюсь', 'цель', 'буде', 'будемо', 'будеш', 'потім', 'планую', 'збираюся', 'сподіваюся', 'мета', 'will', 'tomorrow', 'later', 'plan', 'soon', 'hope', 'goal'],
  hedonistic: ['хочу', 'нравится', 'кайф', 'удовольствие', 'приятно', 'наслаждаться', 'весело', 'хочется', 'подобається', 'задоволення', 'приємно', 'насолоджуватися', 'want', 'enjoy', 'pleasure', 'fun', 'like'],
  fatalistic: ['бесполезно', 'судьба', 'бессмысленно', 'неизбежно', 'марно', 'доля', 'безглуздо', 'неминуче', 'useless', 'fate', 'pointless', 'inevitable', 'whatever'],
  negative: ['плохо', 'тяжело', 'страшно', 'больно', 'устал', 'устала', 'ужасно', 'боюсь', 'виноват', 'виновата', 'стыдно', 'зря', 'погано', 'важко', 'боляче', 'втомився', 'втомилася', 'жахливо', 'боюся', 'винен', 'винна', 'соромно', 'дарма', 'bad', 'hard', 'scary', 'painful', 'tired', 'awful', 'afraid', 'guilty', 'ashamed'],
  positive: ['хорошо', 'рад', 'рада', 'счастлив', 'счастлива', 'здорово', 'любил', 'любила', 'тепло', 'спокойно', 'гордость', 'добре', 'радий', 'щасливий', 'щаслива', 'чудово', 'любив', 'любила', 'спокійно', 'good', 'glad', 'happy', 'great', 'loved', 'warm', 'calm', 'proud']
});
const PHRASES = Object.freeze({ fatalistic: ['всё равно', 'все равно', 'ничего не изменить', 'не зависит от меня', 'смысла нет', 'нет смысла', 'все одно', 'нічого не змінити', 'не залежить від мене', 'сенсу немає', 'немає сенсу', 'no point', "doesn't matter"] });

const UA_LETTERS = /[іїєґ]/;
const RU_LETTERS = /[ыэёъ]/;

export function tokens(text) {
  return String(text).toLowerCase().replace(/ё/g, 'ё').match(/[a-zа-яёіїєґ’'-]+/g) || [];
}

function lang(text) {
  const t = String(text).toLowerCase();
  const cyr = (t.match(/[а-яёіїєґ]/g) || []).length; const lat = (t.match(/[a-z]/g) || []).length;
  if (cyr === 0 && lat === 0) return 'none';
  if (lat > cyr) return 'en';
  if (UA_LETTERS.test(t) && !RU_LETTERS.test(t)) return 'uk';
  if (UA_LETTERS.test(t) && RU_LETTERS.test(t)) return 'mixed';
  return 'ru';
}

const P = (v, unit, range, note) => (Number.isFinite(v) ? Param.measured(Math.min(range[1], Math.max(range[0], v)), unit, range, TOOL, VERSION, note === undefined ? '' : note).json() : Param.missing(unit, range, TOOL, VERSION, note === undefined ? 'нет данных' : note).json());
const H = (v, unit, range, note) => (Number.isFinite(v) ? Param.hypothesis(Math.min(range[1], Math.max(range[0], v)), unit, range, TOOL, VERSION, note).json() : Param.missing(unit, range, TOOL, VERSION, note).json());

function hourOf(t) {
  if (typeof t !== 'string') return -1;
  const iso = t.match(/T(\d{2}):/); if (iso) return Number(iso[1]);
  const hm = t.match(/^\[?(\d{1,2}):(\d{2})/); if (hm && Number(hm[1]) < 24) return Number(hm[1]);
  return -1;
}

export class LexisTool {
  constructor(lexicon) {
    this.lex = lexicon === undefined ? LEX : lexicon;
    Object.freeze(this);
  }

  static lexicon() {
    return LEX;
  }

  // Вход: { lines: [{ speaker, text, t? }], focus? }. Выход: счётчики 🟢, прокси 🔵, тепловая карта.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const lines = Array.isArray(src.lines) ? src.lines.filter((l) => l && typeof l.text === 'string' && l.text.trim() !== '') : [];
    if (lines.length === 0) return this.missing('пустой транскрипт');
    const speakers = {};
    let total = 0;
    lines.forEach((l) => {
      const name = typeof l.speaker === 'string' && l.speaker !== '' ? l.speaker : '?';
      const toks = tokens(l.text);
      if (speakers[name] === undefined) speakers[name] = { words: 0, turns: 0, questions: 0, toks: [], texts: [] };
      speakers[name].words += toks.length; speakers[name].turns += 1; speakers[name].questions += /\?/.test(l.text) ? 1 : 0;
      speakers[name].toks.push(...toks); speakers[name].texts.push(l.text.toLowerCase());
      total += toks.length;
    });
    const focus = typeof src.focus === 'string' && speakers[src.focus] !== undefined ? src.focus : '';
    const scopeToks = focus === '' ? Object.values(speakers).flatMap((s) => s.toks) : speakers[focus].toks;
    const scopeTexts = focus === '' ? lines.map((l) => l.text.toLowerCase()) : speakers[focus].texts;
    const n = scopeToks.length;
    const count = (key) => scopeToks.filter((t) => this.lex[key].includes(t)).length;
    const phrases = (key) => scopeTexts.reduce((acc, text) => acc + (PHRASES[key] || []).reduce((a, ph) => a + (text.includes(ph) ? 1 : 0), 0), 0);
    const pr = { i: count('i'), we: count('we'), you: count('you'), they: count('they') };
    const prTotal = pr.i + pr.we + pr.you + pr.they;
    const per1000 = (c) => (n > 0 ? (c / n) * 1000 : Number.NaN);
    const must = count('must'); const can = count('can');
    // Zimbardo-прокси: прошлое ± валентность в одной реплике, гедонизм/фатализм/будущее — маркеры.
    let pastNeg = 0; let pastPos = 0;
    scopeTexts.forEach((text) => {
      const tk = tokens(text);
      const past = tk.filter((t) => this.lex.past.includes(t)).length;
      const neg = tk.filter((t) => this.lex.negative.includes(t)).length;
      const pos = tk.filter((t) => this.lex.positive.includes(t)).length;
      pastNeg += Math.min(past, neg); pastPos += Math.min(past, pos);
    });
    const z = { past_negative: pastNeg, past_positive: pastPos, present_hedonistic: count('hedonistic'), present_fatalistic: count('fatalistic') + phrases('fatalistic'), future: count('future') };
    const zTotal = Object.values(z).reduce((a, b) => a + b, 0);
    const zimbardo = {};
    Object.keys(z).forEach((k) => { zimbardo[k] = zTotal > 0 ? H(z[k] / zTotal, 'share', [0, 1], `лексический прокси; маркеров ${z[k]} из ${zTotal}`) : Param.missing('share', [0, 1], TOOL, VERSION, 'маркеров временной перспективы нет').json(); });
    const hours = new Array(24).fill(0);
    let stamped = 0;
    lines.forEach((l) => { const h = hourOf(l.t); if (h >= 0) { hours[h] += 1; stamped += 1; } });
    const balance = {};
    Object.keys(speakers).forEach((name) => {
      const s = speakers[name];
      balance[name] = { words: s.words, turns: s.turns, share: P(total > 0 ? (s.words / total) * 100 : Number.NaN, '%', [0, 100]), questions: P(s.questions, 'n', [0, 9999]),
        initiative: H(s.turns > 0 ? s.questions / s.turns : Number.NaN, 'ratio', [0, 1], 'прокси: доля реплик-вопросов') };
    });
    const langs = lines.map((l) => lang(l.text));
    const langShare = {};
    ['ru', 'uk', 'en', 'mixed', 'none'].forEach((k) => { const c = langs.filter((x) => x === k).length; if (c > 0) langShare[k] = Number((c / langs.length).toFixed(3)); });
    return Object.freeze({
      status: 'ok', reason: '', version: VERSION, focus, scope_words: n, words_total: total, turns_total: lines.length, lang: langShare,
      pronouns: {
        i: P(prTotal > 0 ? (pr.i / prTotal) * 100 : Number.NaN, '%', [0, 100], `${pr.i} из ${prTotal} местоимений`),
        we: P(prTotal > 0 ? (pr.we / prTotal) * 100 : Number.NaN, '%', [0, 100], `${pr.we} из ${prTotal}`),
        you: P(prTotal > 0 ? (pr.you / prTotal) * 100 : Number.NaN, '%', [0, 100], `${pr.you} из ${prTotal}`),
        they: P(prTotal > 0 ? (pr.they / prTotal) * 100 : Number.NaN, '%', [0, 100], `${pr.they} из ${prTotal}`),
        per_1000: { i: P(per1000(pr.i), '‰', [0, 1000]), we: P(per1000(pr.we), '‰', [0, 1000]), you: P(per1000(pr.you), '‰', [0, 1000]), they: P(per1000(pr.they), '‰', [0, 1000]) },
        counts: pr
      },
      modality: { must: P(per1000(must), '‰', [0, 1000], `${must} маркеров долженствования`), can: P(per1000(can), '‰', [0, 1000], `${can} маркеров возможности`),
        ratio: must + can > 0 ? P(must / (must + can), 'ratio', [0, 1], 'доля долженствования среди модальных') : Param.missing('ratio', [0, 1], TOOL, VERSION, 'модальных маркеров нет').json(), counts: { must, can } },
      zimbardo,
      balance,
      heatmap: { hours, stamped, badge: stamped > 0 ? '🟢' : '⛔', reason: stamped > 0 ? '' : 'нет временных меток (формат [HH:MM] или ISO)' }
    });
  }

  missing(reason) {
    const m = (unit, range) => Param.missing(unit, range, TOOL, VERSION, reason).json();
    const zero = { i: m('%', [0, 100]), we: m('%', [0, 100]), you: m('%', [0, 100]), they: m('%', [0, 100]), per_1000: { i: m('‰', [0, 1000]), we: m('‰', [0, 1000]), you: m('‰', [0, 1000]), they: m('‰', [0, 1000]) }, counts: { i: 0, we: 0, you: 0, they: 0 } };
    const zimbardo = {};
    ['past_negative', 'past_positive', 'present_hedonistic', 'present_fatalistic', 'future'].forEach((k) => { zimbardo[k] = m('share', [0, 1]); });
    return Object.freeze({ status: 'missing', reason, version: VERSION, focus: '', scope_words: 0, words_total: 0, turns_total: 0, lang: {}, pronouns: zero,
      modality: { must: m('‰', [0, 1000]), can: m('‰', [0, 1000]), ratio: m('ratio', [0, 1]), counts: { must: 0, can: 0 } }, zimbardo, balance: {}, heatmap: { hours: new Array(24).fill(0), stamped: 0, badge: '⛔', reason } });
  }
}
