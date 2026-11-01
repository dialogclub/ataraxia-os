// ClaimList — утверждения L2 с якорями: бейдж · текст · цитаты (спикер, таймкод) либо замер (инструмент.путь).
// Компонент ничего не вычисляет: принимает готовый результат рантайма агента (Приложение E); пусто → ⛔.
import { h, clear } from './base.mjs';
import { Badge } from './badge.mjs';
import { EvidenceQuote } from './evidence.mjs';

const FLAG_TEXT = Object.freeze({
  unsupported_number: 'число без источника — понижено до 🔵',
  overclaimed_badge: 'модель завысила доказательность — бейдж назначен системой',
  unstable_k: 'нестабильно между выборками'
});

function flagText(flag) {
  const key = String(flag).split(':')[0];
  return FLAG_TEXT[key] === undefined ? String(flag) : FLAG_TEXT[key];
}

export class ClaimList {
  // data: { claims: [{ id, text, badge, evidence: [{type, quote?, speaker?, t?, tool?, path?, ref?, ok, reason}], flags[] }], onJump }
  constructor(data) {
    const d = data === undefined || data === null ? {} : data;
    this.config = Object.freeze({ claims: Array.isArray(d.claims) ? d.claims : [], onJump: d.onJump });
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'claims stack' });
    this.nodes.root = root;
    this.fill(root, this.config.claims);
    el.append(root);
    return root;
  }

  fill(root, claims) {
    clear(root);
    if (claims.length === 0) { root.append(h('div', { class: 'viz-empty', role: 'img', 'aria-label': 'нет утверждений' }, '⛔ ', 'Утверждений нет')); return; }
    claims.forEach((c) => {
      const row = h('div', { class: 'claim', dataset: { badge: String(c.badge) } });
      const head = h('div', { class: 'claim-head' }, h('span', { class: 'cap2', text: String(c.id) }));
      new Badge(c.badge).render(head);
      row.append(head);
      if (c.hideText !== true) row.append(h('p', { class: 'sub', text: String(c.text) })); // hideText: текст уже стоит в вердикте карточки-героя
      const evidence = Array.isArray(c.evidence) ? c.evidence : [];
      if (evidence.length === 0) row.append(h('span', { class: 'caption', text: 'без якоря — гипотеза' }));
      evidence.forEach((e) => {
        if (e.type === 'quote' && e.ok) new EvidenceQuote({ quote: e.quote, speaker: e.speaker, t: e.t }, this.config.onJump).render(row);
        else if (e.type === 'measure' && e.ok) row.append(h('div', { class: 'row' }, h('span', { text: `замер · ${e.tool}.${e.path}` }), h('span', { class: 'cap2', text: e.badge })));
        else if (e.type === 'claim' && e.ok) row.append(h('div', { class: 'row' }, h('span', { text: `опора на утверждение ${e.ref}` }), h('span', { class: 'cap2', text: e.badge })));
        else row.append(h('div', { class: 'row' }, h('span', { class: 'caption', text: `якорь не принят: ${e.reason || 'не прошёл проверку'}` }), h('span', { class: 'cap2', text: '⛔' })));
      });
      (Array.isArray(c.flags) ? c.flags : []).forEach((f) => row.append(h('span', { class: 'caption', text: `⚠ ${flagText(f)}` })));
      root.append(row);
    });
  }

  update(data) {
    const claims = data !== undefined && data !== null && Array.isArray(data.claims) ? data.claims : [];
    if (this.nodes.root !== undefined) this.fill(this.nodes.root, claims);
  }

  destroy() {
    if (this.nodes.root !== undefined) this.nodes.root.remove();
  }
}
