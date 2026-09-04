// Параметр реестра: в SCP нет голых чисел (инвариант 3.2).
// Каждое число несёт единицу, диапазон, бейдж доказательности и источник.
// Бейджи: 🟢 измерено инструментом · 🟡 интерпретация с якорем · 🔵 гипотеза/реконструкция · ⛔ канала нет.

export const BADGE = Object.freeze({
  MEASURED: '🟢',
  INTERPRETED: '🟡',
  HYPOTHESIS: '🔵',
  MISSING: '⛔'
});

export class Param {
  // Конструктор без логики: только фиксация полей (EO).
  constructor(spec) {
    this.value = spec.value;
    this.unit = spec.unit;
    this.range = Object.freeze([spec.range[0], spec.range[1]]);
    this.badge = spec.badge;
    this.source = spec.source;
    this.tool = spec.tool;
    this.version = spec.version;
    this.note = spec.note === undefined ? '' : spec.note;
    Object.freeze(this);
  }

  // Число измерено детерминированным инструментом.
  static measured(value, unit, range, tool, version, note) {
    return new Param({ value, unit, range, badge: BADGE.MEASURED, source: 'tool', tool, version, note });
  }

  // Число реконструировано методологически (калибровочная оговорка обязательна).
  static hypothesis(value, unit, range, tool, version, note) {
    return new Param({ value, unit, range, badge: BADGE.HYPOTHESIS, source: 'reconstruction', tool, version, note });
  }

  // Канала нет: значение отсутствует, но объект существует (нет null).
  static missing(unit, range, tool, version, reason) {
    return new Param({ value: Number.NaN, unit, range, badge: BADGE.MISSING, source: 'none', tool, version, note: reason });
  }

  present() {
    return Number.isFinite(this.value);
  }

  inRange() {
    return this.present() && this.value >= this.range[0] && this.value <= this.range[1];
  }

  // Форматирование по правилу 4.1: индексы — 2 знака, баллы/проценты — целые.
  text(kind) {
    if (!this.present()) return '⛔';
    if (kind === 'score' || kind === 'percent') return String(Math.round(this.value));
    return this.value.toFixed(2);
  }

  json() {
    return {
      value: this.present() ? this.value : null,
      unit: this.unit,
      range: [this.range[0], this.range[1]],
      badge: this.badge,
      source: this.source,
      tool: this.tool,
      version: this.version,
      note: this.note
    };
  }
}
