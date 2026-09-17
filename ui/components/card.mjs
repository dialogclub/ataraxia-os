// ResultCard — грамматика результата 4.3: заголовок + бейдж + источник · вердикт · якоря · параметры · что дальше · JSON · повторить · ограничения.
import { h, present, fmt, clear } from './base.mjs';
import { Badge } from './badge.mjs';
import { EvidenceQuote } from './evidence.mjs';

export class ResultCard {
  // spec: { id, title, badge, source, verdict, anchors[], params[{label, param, kind}], next:{label, onClick}, json, onRetry, limit, hero, viz(fn el) }
  constructor(spec) {
    this.spec = spec;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const s = this.spec;
    const card = h('article', { class: `card${s.hero ? ' hero' : ''}`, id: s.id === undefined ? null : `card-${s.id}`, dataset: { badge: s.badge } });
    const head = h('div', { class: 'card-head' }, h('div', {}, h('h3', { text: s.title }), h('div', { class: 'card-source', text: s.source === undefined ? '' : s.source })));
    new Badge(s.badge).render(head);
    card.append(head);
    if (s.verdict) card.append(h('p', { class: s.hero ? 'verdict' : 'sub', text: s.verdict }));
    if (Array.isArray(s.anchors) && s.anchors.length) {
      const box = h('div', { class: 'stack' });
      s.anchors.forEach((a) => { if (a.quote !== undefined) new EvidenceQuote(a, s.onJump).render(box); else box.append(h('div', { class: 'row' }, h('span', { text: a.label }), h('span', { class: 'value', text: `${fmt(a.param, a.kind)}`, title: a.param && a.param.note }, h('span', { class: 'unit', text: present(a.param) ? a.param.unit : '' })))); });
      card.append(box);
    }
    if (typeof s.viz === 'function') { const vizHost = h('div'); s.viz(vizHost); card.append(vizHost); }
    if (Array.isArray(s.params) && s.params.length) {
      const list = h('div', { class: 'params' });
      s.params.forEach((p) => list.append(h('div', { class: 'row' }, h('span', { text: p.label }), h('span', { class: 'value', title: p.param && p.param.note }, fmt(p.param, p.kind), h('span', { class: 'unit', text: present(p.param) ? p.param.unit : '' }), ' ', h('span', { class: 'cap2', text: p.param ? p.param.badge : '⛔' })))));
      card.append(list);
    }
    const actions = h('div', { class: 'card-actions' });
    if (s.next) actions.append(h('button', { type: 'button', class: 'btn secondary small', text: s.next.label, onClick: s.next.onClick }));
    if (typeof s.onRetry === 'function') actions.append(h('button', { type: 'button', class: 'btn quiet small', text: 'Повторить', onClick: s.onRetry }));
    if (s.json !== undefined) actions.append(h('details', { class: 'json' }, h('summary', { text: 'JSON' }), h('pre', { text: JSON.stringify(s.json, null, 2) })));
    if (actions.childElementCount) card.append(actions);
    if (s.limit) card.append(h('div', { class: 'limit' }, h('span', { 'aria-hidden': 'true', text: '⛔' }), h('span', { text: s.limit })));
    el.append(card);
    this.nodes.card = card;
    return card;
  }

  destroy() {
    if (this.nodes.card) this.nodes.card.remove();
  }
}
