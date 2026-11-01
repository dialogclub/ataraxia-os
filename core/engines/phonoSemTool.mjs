// phonoSemTool (VAAL-lite 🔵): текст → 25 биполярных шкал Журавлёва, полярность, значимые признаки,
// контент-анализ (8 категорий), 8 эмоций Плутчика, типы Белянина, TTR/hapax. RU/UA/EN с автоопределением.
// КАЛИБРОВОЧНАЯ ОГОВОРКА: таблица PHON — методологическая реконструкция по опубликованным качественным
// закономерностям (сонорные — «нежные/гладкие», шипящие — «грубые/страшные», «у/ы» — «тёмные/большие»).
// Точная таблица Журавлёва / Осгуда подставляется в PHON и SCALE_MAP, не трогая логику. Все выходы — 🔵.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'phonoSemTool';
const SIGNIFICANT = 0.12;   // порог значимости текстового уровня
const D_MAX = 1.5;          // отклонение, соответствующее ±100 (калибровка: крайние тексты ≈ ±70)
const FIRST_WEIGHT = 4;     // вес первой буквы слова (ударение не учитывается — оговорка)

// 25 шкал: [левый полюс, правый полюс, полярность] — полярность +1: левый полюс «позитивен», 0: нейтральна.
export const SCALE_MAP = Object.freeze([
  ['хороший', 'плохой', 1], ['большой', 'маленький', 0], ['нежный', 'грубый', 1], ['женственный', 'мужественный', 0], ['светлый', 'тёмный', 1],
  ['активный', 'пассивный', 1], ['простой', 'сложный', 0], ['сильный', 'слабый', 1], ['горячий', 'холодный', 0], ['быстрый', 'медленный', 0],
  ['красивый', 'отталкивающий', 1], ['гладкий', 'шероховатый', 1], ['лёгкий', 'тяжёлый', 1], ['весёлый', 'грустный', 1], ['безопасный', 'страшный', 1],
  ['величественный', 'низменный', 1], ['яркий', 'тусклый', 1], ['округлый', 'угловатый', 0], ['радостный', 'печальный', 1], ['громкий', 'тихий', 0],
  ['длинный', 'короткий', 0], ['храбрый', 'трусливый', 1], ['добрый', 'злой', 1], ['могучий', 'хилый', 1], ['подвижный', 'медлительный', 0]
]);
export const POLARITY = Object.freeze(SCALE_MAP.map((s) => s[2]));

// Признаковые профили (значения −2…+2 по 25 шкалам) — строятся из фонетических классов. Индексы шкал как в SCALE_MAP.
const PROFILE = Object.freeze({
  open_vowel:   { 0: 1.5, 1: 1.5, 4: 1.5, 10: 1, 12: 0.5, 13: 1, 15: 1, 16: 1.5, 17: 1, 18: 1, 19: 1, 22: 1 },
  front_vowel:  { 0: 0.5, 1: -1.5, 2: 1.5, 3: 1, 4: 1.5, 5: 1, 9: 1.5, 10: 1, 11: 1, 12: 1.5, 13: 1, 16: 1, 20: -1, 24: 1.5 },
  back_vowel:   { 0: -0.5, 1: 1.5, 2: -0.5, 3: -1, 4: -1.5, 5: -1, 7: 1.5, 8: -0.5, 9: -1.5, 12: -1.5, 13: -1, 14: -1.5, 15: 1, 16: -1, 17: 1, 18: -1, 19: 1, 20: 1.5, 23: 1.5, 24: -1.5 },
  dark_vowel:   { 0: -1.5, 2: -1.5, 4: -1.5, 10: -1.5, 11: -1.5, 13: -1, 14: -1, 16: -1.5, 17: -1, 18: -1, 22: -1 },
  sonorant:     { 0: 1, 2: 2, 3: 1, 4: 0.5, 10: 1, 11: 2, 12: 1, 13: 0.5, 14: 1, 17: 1.5, 18: 0.5, 19: -0.5, 22: 1.5, 24: 0.5 },
  trill:        { 2: -1.5, 3: -1.5, 5: 1.5, 7: 1.5, 8: 1, 9: 1, 11: -2, 14: -1, 15: 0.5, 17: -1.5, 19: 1.5, 21: 1.5, 23: 1.5, 24: 1 },
  voiced_stop:  { 1: 1, 3: -1, 5: 0.5, 7: 1.5, 12: -1, 15: 0.5, 17: -0.5, 19: 1, 23: 1.5 },
  voiceless_stop: { 1: -1, 2: -1, 5: 1, 6: 0.5, 9: 1.5, 11: -1, 12: 0.5, 17: -1.5, 19: -0.5, 20: -1.5, 24: 1 },
  hissing:      { 0: -1.5, 2: -2, 4: -1, 10: -1.5, 11: -2, 13: -1, 14: -1.5, 16: -0.5, 17: -1, 18: -1, 21: -0.5, 22: -1.5 },
  fricative:    { 2: -0.5, 8: -0.5, 11: -1, 12: 0.5, 19: -1 },
  labial:       { 1: 0.5, 2: 0.5, 8: 0.5, 17: 1.5, 19: 0.5 },
  neutral:      {}
});
const CLASS = Object.freeze({
  а: 'open_vowel', о: 'back_vowel', у: 'dark_vowel', ы: 'dark_vowel', э: 'front_vowel', я: 'front_vowel', ё: 'back_vowel', ю: 'dark_vowel', и: 'front_vowel', е: 'front_vowel',
  і: 'front_vowel', ї: 'front_vowel', є: 'front_vowel',
  л: 'sonorant', м: 'sonorant', н: 'sonorant', й: 'sonorant', р: 'trill',
  б: 'voiced_stop', г: 'voiced_stop', д: 'voiced_stop', ґ: 'voiced_stop', в: 'labial', з: 'fricative', ж: 'hissing',
  п: 'voiceless_stop', т: 'voiceless_stop', к: 'voiceless_stop', ф: 'fricative', с: 'fricative', х: 'hissing', ц: 'voiceless_stop', ч: 'hissing', ш: 'hissing', щ: 'hissing',
  ь: 'neutral', ъ: 'neutral',
  a: 'open_vowel', e: 'front_vowel', i: 'front_vowel', o: 'back_vowel', u: 'dark_vowel', y: 'front_vowel',
  l: 'sonorant', m: 'sonorant', n: 'sonorant', r: 'trill', w: 'labial', v: 'labial',
  b: 'voiced_stop', d: 'voiced_stop', g: 'voiced_stop', p: 'voiceless_stop', t: 'voiceless_stop', k: 'voiceless_stop', c: 'voiceless_stop', q: 'voiceless_stop',
  f: 'fricative', s: 'fricative', z: 'fricative', h: 'hissing', j: 'hissing', x: 'hissing'
});
// PHON: буква → 25 значений. Заменяемая точной таблицей без изменения логики.
export const PHON = Object.freeze(Object.fromEntries(Object.keys(CLASS).map((ch) => [ch, Object.freeze(SCALE_MAP.map((_, i) => (PROFILE[CLASS[ch]][i] === undefined ? 0 : PROFILE[CLASS[ch]][i])))])));

// Частоты букв (нормы языка, доли).
const FREQ = Object.freeze({
  ru: { о: 0.1097, е: 0.0845, а: 0.0801, и: 0.0735, н: 0.067, т: 0.0626, с: 0.0547, р: 0.0473, в: 0.0454, л: 0.044, к: 0.0349, м: 0.0321, д: 0.0298, п: 0.0281, у: 0.0262, я: 0.0201, ы: 0.019, ь: 0.0174, г: 0.017, з: 0.0165, б: 0.0159, ч: 0.0144, й: 0.0121, х: 0.0097, ж: 0.0094, ш: 0.0073, ю: 0.0064, ц: 0.0048, щ: 0.0036, э: 0.0032, ф: 0.0026, ъ: 0.0004, ё: 0.0004 },
  uk: { о: 0.094, а: 0.08, н: 0.065, и: 0.062, і: 0.057, в: 0.054, т: 0.053, е: 0.049, р: 0.047, с: 0.041, л: 0.036, к: 0.035, у: 0.033, м: 0.031, п: 0.029, д: 0.027, з: 0.023, я: 0.02, ь: 0.018, б: 0.017, г: 0.016, ч: 0.012, й: 0.012, х: 0.012, ж: 0.009, ш: 0.006, ц: 0.006, ї: 0.006, ю: 0.005, є: 0.005, щ: 0.003, ф: 0.002, ґ: 0.0003 },
  en: { e: 0.127, t: 0.091, a: 0.082, o: 0.075, i: 0.07, n: 0.067, s: 0.063, h: 0.061, r: 0.06, d: 0.043, l: 0.04, c: 0.028, u: 0.028, m: 0.024, w: 0.024, f: 0.022, g: 0.02, y: 0.02, p: 0.019, b: 0.015, v: 0.01, k: 0.008, j: 0.0015, x: 0.0015, q: 0.001, z: 0.0007 }
});

// Контент-анализ (8 категорий, реконструкция): основы слов RU/UA/EN, норма ‰ и σ — калибровочные.
export const CATEGORIES = Object.freeze([
  ['агрессивность', ['зл', 'гнев', 'гнів', 'ярост', 'лют', 'бить', 'бил', 'удар', 'ненави', 'враг', 'ворог', 'убь', 'angry', 'rage', 'hate', 'fight', 'kill'], 4, 3],
  ['тревожность', ['тревог', 'тривог', 'бо', 'страх', 'страш', 'паник', 'волну', 'хвилю', 'нервн', 'anxi', 'fear', 'afraid', 'worr', 'panic'], 6, 4],
  ['депрессивность', ['груст', 'сум', 'печал', 'тоск', 'устал', 'втом', 'пуст', 'бессмысл', 'безглузд', 'плак', 'sad', 'tired', 'empty', 'hopeless', 'cry'], 6, 4],
  ['демонстративность', ['я сам', 'лучш', 'кращ', 'все смотр', 'внимани', 'уваг', 'признан', 'визнан', 'достоин', 'гідн', 'best', 'attention', 'admire', 'deserve'], 3, 2],
  ['рациональность', ['потому', 'тому', 'значит', 'отже', 'логич', 'логіч', 'анализ', 'аналіз', 'причин', 'следств', 'наслід', 'план', 'because', 'therefore', 'logic', 'reason', 'plan'], 8, 5],
  ['эмоциональность', ['чувств', 'відчу', 'очень', 'дуже', 'ужасн', 'жахлив', 'обожа', 'ненави', 'сердц', 'серц', 'душ', 'feel', 'very', 'love', 'heart', 'soul'], 10, 6],
  ['социальность', ['мы', 'ми', 'вместе', 'разом', 'друз', 'друж', 'семь', 'сім', 'люди', 'общ', 'спіль', 'we', 'together', 'friend', 'family', 'people'], 12, 7],
  ['витальность', ['жив', 'сил', 'энерг', 'енерг', 'здоров', 'хочу', 'могу', 'можу', 'делаю', 'роблю', 'иду', 'йду', 'alive', 'energy', 'strong', 'can', 'do'], 10, 6]
]);
export const PLUTCHIK = Object.freeze({
  joy: ['радост', 'радіс', 'счаст', 'щаст', 'весел', 'рад', 'смех', 'сміх', 'улыб', 'посміх', 'joy', 'happy', 'glad', 'laugh'],
  trust: ['довер', 'довір', 'надёж', 'надійн', 'верю', 'вірю', 'уверен', 'впевнен', 'trust', 'rely', 'confiden'],
  fear: ['страх', 'страш', 'боюсь', 'боюся', 'бояться', 'тревог', 'тривог', 'ужас', 'жах', 'паник', 'fear', 'afraid', 'scar', 'panic'],
  surprise: ['удив', 'здивув', 'вдруг', 'раптом', 'неожидан', 'несподіван', 'surpris', 'sudden', 'unexpect'],
  sadness: ['груст', 'печал', 'сум', 'тоск', 'плак', 'плач', 'слёз', 'сльоз', 'горе', 'sad', 'cry', 'grief', 'tear'],
  disgust: ['отвра', 'огид', 'против', 'гадк', 'мерз', 'тошн', 'нуд', 'disgust', 'gross', 'sick'],
  anger: ['зл', 'гнев', 'гнів', 'ярост', 'лют', 'бес', 'раздраж', 'дратує', 'angr', 'rage', 'furious', 'irritat'],
  anticipation: ['жду', 'ждать', 'чека', 'ожид', 'очіку', 'надежд', 'надії', 'сподіва', 'предвку', 'anticipat', 'expect', 'hope', 'await']
});
export const BELYANIN = Object.freeze({
  светлый: ['ясн', 'чест', 'добр', 'свет', 'світл', 'чист', 'искрен', 'щир', 'honest', 'clear', 'kind', 'light'],
  тёмный: ['тьм', 'тёмн', 'темн', 'зл', 'враг', 'ворог', 'груб', 'сил', 'власт', 'влад', 'dark', 'enemy', 'power', 'rough'],
  весёлый: ['весел', 'смех', 'сміх', 'шут', 'жарт', 'игр', 'гра', 'праздн', 'свят', 'fun', 'laugh', 'joke', 'play'],
  печальный: ['груст', 'печал', 'сум', 'тоск', 'одиноч', 'самот', 'смерт', 'прощ', 'sad', 'lonely', 'death', 'farewell'],
  красивый: ['красив', 'гарн', 'прекрас', 'изящ', 'витонч', 'роскош', 'розкіш', 'beaut', 'elegant', 'luxur'],
  сложный: ['сложн', 'складн', 'мысл', 'дума', 'понима', 'розум', 'анализ', 'аналіз', 'систем', 'структур', 'complex', 'think', 'analy', 'system']
});

function detect(text) {
  const t = text.toLowerCase();
  const cyr = (t.match(/[а-яёіїєґ]/g) || []).length; const lat = (t.match(/[a-z]/g) || []).length;
  if (cyr === 0 && lat === 0) return 'none';
  if (lat > cyr) return 'en';
  return /[іїєґ]/.test(t) && !/[ыэъё]/.test(t) ? 'uk' : 'ru';
}

const H = (v, unit, range, note) => (Number.isFinite(v) ? Param.hypothesis(Math.min(range[1], Math.max(range[0], v)), unit, range, TOOL, VERSION, note === undefined ? '' : note).json() : Param.missing(unit, range, TOOL, VERSION, note === undefined ? 'нет данных' : note).json());

export class PhonoSemTool {
  constructor(phon, freq) {
    this.phon = phon === undefined ? PHON : phon;
    this.freq = freq === undefined ? FREQ : freq;
    Object.freeze(this);
  }

  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const text = typeof src.text === 'string' ? src.text : (typeof src === 'string' ? src : '');
    const language = ['ru', 'uk', 'en'].includes(src.lang) ? src.lang : detect(text);
    const words = text.toLowerCase().match(/[a-zа-яёіїєґ]+/g) || [];
    if (words.length === 0 || language === 'none') return this.missing('нет букв в тексте');
    const freq = this.freq[language];
    // Взвешенные частоты букв текста: первая буква слова ×4.
    const p = {}; let weightSum = 0;
    words.forEach((w) => { for (let i = 0; i < w.length; i += 1) { const ch = w[i]; if (this.phon[ch] === undefined) continue; const k = i === 0 ? FIRST_WEIGHT : 1; p[ch] = (p[ch] === undefined ? 0 : p[ch]) + k; weightSum += k; } });
    if (weightSum === 0) return this.missing('нет букв в таблице');
    const letters = Object.keys(freq);
    const qSum = letters.reduce((a, ch) => a + freq[ch], 0);
    const scales = SCALE_MAP.map(([left, right, polarity], j) => {
      let f = 0; Object.keys(p).forEach((ch) => { f += this.phon[ch][j] * p[ch]; }); f /= weightSum;
      let mu = 0; letters.forEach((ch) => { if (this.phon[ch] !== undefined) mu += this.phon[ch][j] * (freq[ch] / qSum); });
      let varL = 0; letters.forEach((ch) => { if (this.phon[ch] !== undefined) varL += (freq[ch] / qSum) * (this.phon[ch][j] - mu) * (this.phon[ch][j] - mu); });
      const d = f - mu;
      const z = varL > 0 ? d / (Math.sqrt(varL) / Math.sqrt(weightSum)) : 0;
      const value = Math.max(-100, Math.min(100, (100 * d) / D_MAX));
      return { id: j, left, right, polarity, deviation: Number(d.toFixed(4)), z: Number(z.toFixed(3)), significant: Math.abs(d) > SIGNIFICANT || Math.abs(z) > 1,
        value: H(value, 'score', [-100, 100], `отклонение ${d.toFixed(3)} от нормы ${language}; z=${z.toFixed(2)}`), pole: d >= 0 ? left : right };
    });
    const significant = scales.filter((s) => s.significant);
    const blocks = { positive: significant.filter((s) => s.polarity !== 0 && s.deviation * s.polarity > 0).map((s) => s.pole), negative: significant.filter((s) => s.polarity !== 0 && s.deviation * s.polarity < 0).map((s) => s.pole), neutral: significant.filter((s) => s.polarity === 0).map((s) => s.pole) };
    const polar = scales.filter((s) => s.polarity !== 0);
    const polarity = polar.length ? polar.reduce((a, s) => a + s.value.value * s.polarity, 0) / polar.length : Number.NaN;
    // Лексические слои.
    const n = words.length;
    const stemCount = (stems) => words.filter((w) => stems.some((st) => w.startsWith(st))).length;
    const categories = {};
    CATEGORIES.forEach(([name, stems, norm, sd]) => { const per = (stemCount(stems) / n) * 1000; categories[name] = { per_1000: H(per, '‰', [0, 1000]), z: H((per - norm) / sd, 'z', [-10, 10], `норма ${norm} ‰ ± ${sd} (реконструкция)`) }; });
    const plutchik = {};
    const plTotal = Object.keys(PLUTCHIK).reduce((a, k) => a + stemCount(PLUTCHIK[k]), 0);
    Object.keys(PLUTCHIK).forEach((k) => { const c = stemCount(PLUTCHIK[k]); plutchik[k] = plTotal > 0 ? H(c / plTotal, 'share', [0, 1], `${c} из ${plTotal} эмотивов`) : Param.missing('share', [0, 1], TOOL, VERSION, 'эмотивов нет').json(); });
    const belyanin = {};
    const beTotal = Object.keys(BELYANIN).reduce((a, k) => a + stemCount(BELYANIN[k]), 0);
    Object.keys(BELYANIN).forEach((k) => { const c = stemCount(BELYANIN[k]); belyanin[k] = beTotal > 0 ? H(c / beTotal, 'share', [0, 1], `${c} из ${beTotal}`) : Param.missing('share', [0, 1], TOOL, VERSION, 'маркеров нет').json(); });
    const counts = {}; words.forEach((w) => { counts[w] = (counts[w] === undefined ? 0 : counts[w]) + 1; });
    const types = Object.keys(counts).length; const hapax = Object.values(counts).filter((c) => c === 1).length;
    return Object.freeze({
      status: 'ok', reason: '', version: VERSION, lang: language, words: n, letters: weightSum,
      scales, significant: significant.map((s) => s.pole), blocks,
      polarity: H(polarity, 'score', [-100, 100], 'среднее по полярным шкалам'),
      categories, plutchik, belyanin,
      ttr: Param.measured(types / n, 'ratio', [0, 1], TOOL, VERSION, `${types} типов / ${n} токенов`).json(),
      hapax: Param.measured(types > 0 ? hapax / types : 0, 'ratio', [0, 1], TOOL, VERSION, `${hapax} hapax legomena`).json()
    });
  }

  missing(reason) {
    const m = (unit, range) => Param.missing(unit, range, TOOL, VERSION, reason).json();
    const categories = {}; CATEGORIES.forEach(([name]) => { categories[name] = { per_1000: m('‰', [0, 1000]), z: m('z', [-10, 10]) }; });
    const plutchik = {}; Object.keys(PLUTCHIK).forEach((k) => { plutchik[k] = m('share', [0, 1]); });
    const belyanin = {}; Object.keys(BELYANIN).forEach((k) => { belyanin[k] = m('share', [0, 1]); });
    return Object.freeze({ status: 'missing', reason, version: VERSION, lang: 'none', words: 0, letters: 0,
      scales: SCALE_MAP.map(([left, right, polarity], j) => ({ id: j, left, right, polarity, deviation: 0, z: 0, significant: false, value: m('score', [-100, 100]), pole: '' })),
      significant: [], blocks: { positive: [], negative: [], neutral: [] }, polarity: m('score', [-100, 100]), categories, plutchik, belyanin, ttr: m('ratio', [0, 1]), hapax: m('ratio', [0, 1]) });
  }
}
