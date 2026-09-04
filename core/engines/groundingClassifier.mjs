// groundingClassifier (ЦЗИ-8): высказывания → уровень K1–K8, профиль, разрыв контура, модус свободы воли А/Б/В/Г.
// КАЛИБРОВОЧНАЯ ОГОВОРКА: имена контуров K2–K7 и карта модусов LIBERTY_MAP — методологическая реконструкция
// («Восприятие → … → Само-осознавание»); словари маркеров RU/UA/EN расширяются без изменения логики. Выходы 🔵,
// доли высказываний — 🟢 как счётчики по детерминированному классификатору.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'groundingClassifier';
const GAP_SHARE = 0.05;

export const LEVELS = Object.freeze([
  ['K1', 'Восприятие', ['вижу', 'видел', 'видела', 'слышу', 'слышал', 'слышала', 'заметил', 'заметила', 'замечаю', 'факт', 'происходит', 'произошло', 'случилось', 'бачу', 'бачив', 'чую', 'чув', 'помітив', 'помітила', 'сталося', 'відбувається', 'see', 'saw', 'hear', 'heard', 'noticed', 'happened', 'fact'], ['было так', 'на самом деле', 'було так', 'насправді', 'what happened']],
  ['K2', 'Чувство', ['чувствую', 'чувствовал', 'чувствовала', 'злюсь', 'страшно', 'грустно', 'обидно', 'больно', 'тревожно', 'радостно', 'стыдно', 'тошно', 'відчуваю', 'злюся', 'сумно', 'боляче', 'страшно', 'соромно', 'feel', 'felt', 'angry', 'scared', 'sad', 'hurt', 'ashamed'], ['мне плохо', 'мені погано', 'i feel']],
  ['K3', 'Значение', ['значит', 'думаю', 'понимаю', 'объясняю', 'смысл', 'причина', 'означает', 'логично', 'получается', 'виходить', 'означає', 'розумію', 'сенс', 'means', 'think', 'understand', 'reason', 'because'], ['потому что', 'получается что', 'тому що', 'виходить що']],
  ['K4', 'Потребность', ['хочу', 'хочется', 'нуждаюсь', 'мечтаю', 'нужно', 'хотелось', 'хотів', 'хотіла', 'потрібно', 'мрію', 'бракує', 'want', 'need', 'wish', 'lacking', 'miss'], ['мне важно', 'не хватает', 'мені важливо', 'важно чтобы', 'important to me']],
  ['K5', 'Намерение', ['решил', 'решила', 'решаю', 'собираюсь', 'планирую', 'намерен', 'намерена', 'попробую', 'вирішив', 'вирішила', 'збираюся', 'планую', 'спробую', 'decided', 'plan', 'intend', 'going'], ['буду делать', 'я решил', 'я решила', 'going to']],
  ['K6', 'Действие', ['сделал', 'сделала', 'делаю', 'пошёл', 'пошел', 'пошла', 'сказал', 'сказала', 'позвонил', 'позвонила', 'написал', 'написала', 'начал', 'начала', 'зробив', 'зробила', 'роблю', 'пішов', 'пішла', 'сказав', 'сказала', 'зателефонував', 'почав', 'почала', 'did', 'doing', 'went', 'said', 'called', 'started'], []],
  ['K7', 'Результат', ['получилось', 'результат', 'вышло', 'привело', 'привёл', 'привел', 'привела', 'изменилось', 'сработало', 'вийшло', 'призвело', 'змінилося', 'спрацювало', 'worked', 'result', 'changed', 'outcome'], ['в итоге', 'не получилось', 'у підсумку', 'не вийшло', 'turned out', 'led to']],
  ['K8', 'Само-осознавание', ['осознаю', 'осознал', 'осознала', 'усвідомлюю', 'усвідомив', 'усвідомила', 'realize', 'realized'], ['замечаю за собой', 'понимаю что я', 'моя часть', 'узнаю себя', 'вижу себя', 'я такой', 'я такая', 'я стал', 'я стала', 'помічаю за собою', 'бачу себе', 'я став', 'я стала', 'notice in myself', 'part of me', "i've become", 'i am the kind']]
]);
// Модусы свободы воли по месту разрыва (реконструкция; подставить методологию заказчика).
export const LIBERTY_MAP = Object.freeze({ K1: 'А', K2: 'А', K3: 'Б', K4: 'Б', K5: 'В', K6: 'В', K7: 'Г', K8: 'Г' });
export const LIBERTY_LABELS = Object.freeze({ 'А': 'вернуться к восприятию и чувству', 'Б': 'переосмыслить значение и потребность', 'В': 'решить и действовать', 'Г': 'принять результат и осознать себя' });

function tokens(text) {
  return String(text).toLowerCase().match(/[a-zа-яёіїєґ’'-]+/g) || [];
}

export class GroundingClassifier {
  constructor(levels) {
    this.levels = levels === undefined ? LEVELS : levels;
    Object.freeze(this);
  }

  // Одно высказывание → { level, scores[] }. Фразы весят 2, токены — 1; ничья → нижний контур.
  classify(text) {
    const low = String(text).toLowerCase().replace(/[^a-zа-яёіїєґ’' -]/g, ' ').replace(/\s+/g, ' ');
    const toks = tokens(low);
    const scores = this.levels.map(([, , words, phrases]) => toks.filter((t) => words.includes(t)).length + 2 * phrases.filter((ph) => low.includes(ph)).length);
    let best = -1; let bestScore = 0;
    scores.forEach((s, i) => { if (s > bestScore) { bestScore = s; best = i; } });
    return { level: best < 0 ? '' : this.levels[best][0], scores };
  }

  // Вход: { statements: string[] }. Выход: уровни, профиль долей, разрыв, модус.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const statements = Array.isArray(src.statements) ? src.statements.filter((s) => typeof s === 'string' && s.trim() !== '') : [];
    if (statements.length === 0) return this.missing('нет высказываний');
    const items = statements.map((s) => ({ text: s, ...this.classify(s) }));
    const classified = items.filter((i) => i.level !== '');
    const counts = {}; this.levels.forEach(([k]) => { counts[k] = 0; });
    classified.forEach((i) => { counts[i.level] += 1; });
    const levels = {};
    this.levels.forEach(([k, label]) => { levels[k] = classified.length ? Param.measured(counts[k] / classified.length, 'share', [0, 1], TOOL, VERSION, `${label}: ${counts[k]} из ${classified.length}`).json() : Param.missing('share', [0, 1], TOOL, VERSION, 'ни одно высказывание не классифицировано').json(); });
    let gap = '';
    if (classified.length) { for (const [k] of this.levels) { if (counts[k] / classified.length < GAP_SHARE) { gap = k; break; } } }
    const mode = gap === '' ? '' : LIBERTY_MAP[gap];
    return Object.freeze({ status: 'ok', reason: '', version: VERSION, n: statements.length, classified: classified.length, unclassified: statements.length - classified.length,
      items: items.map((i) => ({ text: i.text, level: i.level })), levels, gap, gap_label: gap === '' ? '' : this.levels.find(([k]) => k === gap)[1],
      liberty_mode: mode, liberty_label: mode === '' ? '' : LIBERTY_LABELS[mode],
      badge: '🔵', note: 'уровни K1–K8 по словарям маркеров; разрыв — первый контур с долей < 5 %; модусы — реконструкция' });
  }

  missing(reason) {
    const levels = {}; this.levels.forEach(([k]) => { levels[k] = Param.missing('share', [0, 1], TOOL, VERSION, reason).json(); });
    return Object.freeze({ status: 'missing', reason, version: VERSION, n: 0, classified: 0, unclassified: 0, items: [], levels, gap: '', gap_label: '', liberty_mode: '', liberty_label: '', badge: '⛔', note: reason });
  }
}
