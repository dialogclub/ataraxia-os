// Бейдж доказательности: иконка + текст (доступность), цвет семантический.
import { h } from './base.mjs';

const LABELS = Object.freeze({ '🟢': 'Измерено', '🟡': 'Интерпретация', '🔵': 'Гипотеза', '⛔': 'Нет данных' });

export class Badge {
  constructor(badge, label) {
    this.badge = LABELS[badge] === undefined ? '⛔' : badge;
    this.label = label === undefined ? LABELS[this.badge] : label;
    Object.freeze(this);
  }

  static labels() {
    return LABELS;
  }

  render(el) {
    const node = h('span', { class: 'badge', dataset: { badge: this.badge }, role: 'img', 'aria-label': `${this.label}` }, h('span', { 'aria-hidden': 'true', text: this.badge }), h('span', { text: this.label }));
    el.append(node);
    return node;
  }
}
