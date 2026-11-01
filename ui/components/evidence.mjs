// Якорь-цитата: спикер, таймкод, кнопка «к месту в транскрипте». Смещённая речь — сильный голос (полужирный + ‼), не красный.
import { h } from './base.mjs';

export class EvidenceQuote {
  constructor(item, onJump) {
    this.item = Object.freeze({ quote: String(item.quote === undefined ? '' : item.quote), speaker: String(item.speaker === undefined ? '' : item.speaker), t: String(item.t === undefined ? '' : item.t), strong: item.strong === true, away_from: item.away_from === undefined ? '' : String(item.away_from) });
    this.onJump = onJump;
    Object.freeze(this);
  }

  render(el) {
    const node = h('blockquote', { class: `quote${this.item.strong ? ' strong' : ''}` });
    const q = h('q', { text: this.item.quote === '' ? '—' : this.item.quote });
    const who = h('span', { class: 'who' });
    if (this.item.strong) who.append(h('span', { class: 'mark', text: '‼ смещённая речь', title: 'маркер сопротивления' }));
    who.append(h('span', { text: `${this.item.speaker || '—'} · ${this.item.t || '—:—'}` }));
    if (typeof this.onJump === 'function') who.append(h('button', { type: 'button', class: 'btn quiet small', text: 'К месту в транскрипте', onClick: () => this.onJump(this.item) }));
    node.append(q, who);
    if (this.item.away_from !== '') node.append(h('span', { class: 'caption', text: `уводит от: ${this.item.away_from}` }));
    el.append(node);
    return node;
  }
}
