// scaleScorer: ответы → баллы/нормы по открытым ключам. Неполный опросник → ⛔ (без импутации).
// Проприетарные ключи (16PF, IST, Gallup-34 опросник, Белбин, Леонгард, Мадди) не загружены → ⛔ с причиной;
// подставляются в SCALE_KEYS без изменения логики. Gallup-34 принимает импортированный рейтинг тем.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'scaleScorer';

const band = (bands) => (score) => { const b = bands.find(([lo, hi]) => score >= lo && score <= hi); return b === undefined ? '' : b[2]; };

export const SCALE_KEYS = Object.freeze({
  PHQ9: { label: 'PHQ-9', items: 9, min: 0, max: 3, total: [0, 27], bands: band([[0, 4, 'минимальная'], [5, 9, 'лёгкая'], [10, 14, 'умеренная'], [15, 19, 'умеренно-тяжёлая'], [20, 27, 'тяжёлая']]), flags: (a) => (a[8] > 0 ? ['item9>0: суицидальные мысли — кризисный путь'] : []), grade: 'A', source: 'Kroenke, Spitzer, Williams (2001), public domain' },
  GAD7: { label: 'GAD-7', items: 7, min: 0, max: 3, total: [0, 21], bands: band([[0, 4, 'минимальная'], [5, 9, 'лёгкая'], [10, 14, 'умеренная'], [15, 21, 'тяжёлая']]), flags: () => [], grade: 'A', source: 'Spitzer et al. (2006), public domain' },
  TAS20: { label: 'TAS-20', items: 20, min: 1, max: 5, reverse: [4, 5, 10, 18, 19], total: [20, 100], subscales: { DIF: [1, 3, 6, 7, 9, 13, 14], DDF: [2, 4, 11, 12, 17], EOT: [5, 8, 10, 15, 16, 18, 19, 20] }, bands: band([[20, 51, 'нет алекситимии'], [52, 60, 'пограничная'], [61, 100, 'алекситимия']]), flags: () => [], grade: 'A', source: 'Bagby, Parker, Taylor (1994)' },
  MBI: { label: 'MBI', items: 22, min: 0, max: 6, total: [0, 132], subscales: { EE: [1, 2, 3, 6, 8, 13, 14, 16, 20], DP: [5, 10, 11, 15, 22], PA: [4, 7, 9, 12, 17, 18, 19, 21] }, subBands: { EE: band([[0, 16, 'низкое'], [17, 26, 'среднее'], [27, 54, 'высокое']]), DP: band([[0, 6, 'низкая'], [7, 12, 'средняя'], [13, 30, 'высокая']]), PA: band([[0, 31, 'низкая (редукция)'], [32, 38, 'средняя'], [39, 48, 'высокая']]) }, bands: () => '', flags: () => [], grade: 'A', source: 'Maslach, Jackson (1981)' },
  SCL90R: { label: 'SCL-90-R', items: 90, min: 0, max: 4, total: [0, 360], subscales: { SOM: [1, 4, 12, 27, 40, 42, 48, 49, 52, 53, 56, 58], OC: [3, 9, 10, 28, 38, 45, 46, 51, 55, 65], INT: [6, 21, 34, 36, 37, 41, 61, 69, 73], DEP: [5, 14, 15, 20, 22, 26, 29, 30, 31, 32, 54, 71, 79], ANX: [2, 17, 23, 33, 39, 57, 72, 78, 80, 86], HOS: [11, 24, 63, 67, 74, 81], PHOB: [13, 25, 47, 50, 70, 75, 82], PAR: [8, 18, 43, 68, 76, 83], PSY: [7, 16, 35, 62, 77, 84, 85, 87, 88, 90] }, indices: true, bands: () => '', flags: () => [], grade: 'A', source: 'Derogatis (1977, 1994)' },
  IPIP50: { label: 'Big Five (IPIP-50)', items: 50, min: 1, max: 5, total: [50, 250], subscales: { E: [1, 6, 11, 16, 21, 26, 31, 36, 41, 46], A: [2, 7, 12, 17, 22, 27, 32, 37, 42, 47], C: [3, 8, 13, 18, 23, 28, 33, 38, 43, 48], N: [4, 9, 14, 19, 24, 29, 34, 39, 44, 49], O: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] }, reverse: [6, 16, 26, 36, 2, 12, 22, 32, 8, 18, 28, 38, 4, 14, 24, 29, 34, 39, 44, 49, 10, 20, 30], percent: true, bands: () => '', flags: () => [], grade: 'A', source: 'Goldberg (1992), IPIP public domain' },
  ROKEACH: { label: 'Рокич', ranking: 18, grade: 'B', source: 'Rokeach (1973)' },
  GALLUP34: { label: 'Gallup-34 (импорт рейтинга)', ranking: 34, domains: { 'Исполнение': ['Achiever', 'Arranger', 'Belief', 'Consistency', 'Deliberative', 'Discipline', 'Focus', 'Responsibility', 'Restorative'], 'Влияние': ['Activator', 'Command', 'Communication', 'Competition', 'Maximizer', 'Self-Assurance', 'Significance', 'Woo'], 'Отношения': ['Adaptability', 'Connectedness', 'Developer', 'Empathy', 'Harmony', 'Includer', 'Individualization', 'Positivity', 'Relator'], 'Стратегия': ['Analytical', 'Context', 'Futuristic', 'Ideation', 'Input', 'Intellection', 'Learner', 'Strategic'] }, grade: 'B', source: 'CliftonStrengths (2007), домены публичны; опросник проприетарен' },
  MADDI: { label: 'Мадди (жизнестойкость)', proprietary: 'ключ адаптации Леонтьева не загружен' },
  LEONHARD: { label: 'Леонгард–Шмишек', proprietary: 'ключ не загружен' },
  CATTELL16PF: { label: 'Кеттелл 16PF', proprietary: 'ключ проприетарный' },
  IST: { label: 'Амтхауэр IST', proprietary: 'ключ проприетарный' },
  BELBIN: { label: 'Белбин', proprietary: 'ключ проприетарный' }
});

const ALIASES = Object.freeze({ '16PF': 'CATTELL16PF', 'CATTELL': 'CATTELL16PF', 'SCL90': 'SCL90R', 'BIGFIVE': 'IPIP50', 'IPIP': 'IPIP50', 'BIG5': 'IPIP50', 'GALLUP': 'GALLUP34', 'MASLACH': 'MBI', 'ROKICH': 'ROKEACH', 'HARDINESS': 'MADDI' });

const P = (v, unit, range, note) => Param.measured(v, unit, range, TOOL, VERSION, note === undefined ? '' : note).json();
const M = (unit, range, reason) => Param.missing(unit, range, TOOL, VERSION, reason).json();

export class ScaleScorer {
  constructor(keys) {
    this.keys = keys === undefined ? SCALE_KEYS : keys;
    Object.freeze(this);
  }

  static scales() {
    return Object.keys(SCALE_KEYS).map((id) => ({ id, label: SCALE_KEYS[id].label, available: SCALE_KEYS[id].proprietary === undefined, reason: SCALE_KEYS[id].proprietary === undefined ? '' : SCALE_KEYS[id].proprietary }));
  }

  // Вход: { scale, answers[] } либо { scale, ranking[] } для ранжирований.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const norm = typeof src.scale === 'string' ? src.scale.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const id = ALIASES[norm] === undefined ? norm : ALIASES[norm];
    const key = this.keys[id];
    if (key === undefined) return this.missing(id || '?', 'неизвестная шкала');
    if (key.proprietary !== undefined) return this.missing(id, key.proprietary);
    if (key.ranking !== undefined) return this.ranking(id, key, src);
    const answers = Array.isArray(src.answers) ? src.answers : [];
    const missingItems = [];
    for (let i = 0; i < key.items; i += 1) { const a = answers[i]; if (!Number.isInteger(a) || a < key.min || a > key.max) missingItems.push(i + 1); }
    if (answers.length !== key.items || missingItems.length) return this.missing(id, `неполный опросник: ${answers.length}/${key.items} ответов${missingItems.length ? `, недопустимые пункты ${missingItems.slice(0, 5).join(',')}` : ''}`);
    const rev = new Set(key.reverse === undefined ? [] : key.reverse);
    const scored = answers.map((a, i) => (rev.has(i + 1) ? key.min + key.max - a : a));
    const total = scored.reduce((s, a) => s + a, 0);
    const subscales = {};
    if (key.subscales) Object.keys(key.subscales).forEach((name) => {
      const items = key.subscales[name];
      const sum = items.reduce((s, n) => s + scored[n - 1], 0);
      const range = [items.length * key.min, items.length * key.max];
      const value = key.percent ? ((sum - range[0]) / (range[1] - range[0])) * 100 : sum;
      subscales[name] = { score: P(value, key.percent ? '%' : 'балл', key.percent ? [0, 100] : range, key.percent ? `сырой ${sum} из [${range}]` : `${items.length} пунктов`), band: key.subBands ? key.subBands[name](sum) : '' };
    });
    const out = { status: 'ok', reason: '', version: VERSION, scale: id, label: key.label, n_items: key.items, grade: key.grade, source: key.source,
      total: P(total, 'балл', key.total, `диапазон ${key.total[0]}–${key.total[1]}`), band: key.bands(total), subscales, flags: key.flags(scored) };
    if (key.indices) {
      const positive = scored.filter((a) => a > 0).length;
      out.indices = { GSI: P(total / key.items, 'index', [0, 4], 'сумма / 90'), PST: P(positive, 'n', [0, 90], 'пунктов > 0'), PSDI: positive > 0 ? P(total / positive, 'index', [0, 4], 'сумма / PST') : M('index', [0, 4], 'PST = 0') };
    }
    return Object.freeze(out);
  }

  ranking(id, key, src) {
    const r = Array.isArray(src.ranking) ? src.ranking : [];
    if (key.domains) {
      const all = Object.values(key.domains).flat();
      const valid = r.filter((t) => all.includes(t));
      if (valid.length < 5 || valid.length !== r.length) return this.missing(id, `нужен рейтинг ≥ 5 из 34 тем; получено ${valid.length} валидных из ${r.length}`);
      const top5 = valid.slice(0, 5);
      const domains = {};
      Object.keys(key.domains).forEach((d) => { const c = top5.filter((t) => key.domains[d].includes(t)).length; domains[d] = P(c, 'n', [0, 5], `тем в топ-5`); });
      return Object.freeze({ status: 'ok', reason: '', version: VERSION, scale: id, label: key.label, grade: key.grade, source: key.source, top5, domains, ranking: valid, total: P(valid.length, 'n', [0, 34], 'тем в рейтинге'), band: '', subscales: {}, flags: [] });
    }
    const ok = r.length === key.ranking && r.every((x) => Number.isInteger(x) && x >= 1 && x <= key.ranking) && new Set(r).size === key.ranking;
    if (!ok) return this.missing(id, `нужна перестановка рангов 1–${key.ranking}`);
    return Object.freeze({ status: 'ok', reason: '', version: VERSION, scale: id, label: key.label, grade: key.grade, source: key.source, ranking: r.slice(), total: P(key.ranking, 'n', [0, key.ranking], 'рангов'), band: '', subscales: {}, flags: [] });
  }

  missing(id, reason) {
    return Object.freeze({ status: 'missing', reason, version: VERSION, scale: id, label: this.keys[id] === undefined ? id : this.keys[id].label, n_items: 0, grade: '', source: '', total: M('балл', [0, 0], reason), band: '', subscales: {}, flags: [] });
  }
}
