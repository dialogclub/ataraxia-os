// Элементы управления: сегмент, лист, композер, тост, статус харнесса.
import { h, clear } from './base.mjs';

export class SegmentControl {
  constructor(options, value, onChange) {
    this.options = options.slice();
    this.state = { value };
    this.onChange = onChange;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'segment', role: 'group' });
    this.options.forEach((o) => {
      root.append(h('button', { type: 'button', text: o.label, 'aria-pressed': String(o.id === this.state.value), dataset: { id: o.id }, onClick: () => this.update(o.id, true) }));
    });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(value, notify) {
    this.state.value = value;
    Array.from(this.nodes.root.children).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === value)));
    if (notify) this.onChange(value);
  }

  value() {
    return this.state.value;
  }

  destroy() {
    clear(this.nodes.root);
  }
}

export class Sheet {
  constructor(title) {
    this.title = title;
    this.nodes = {};
    Object.freeze(this);
  }

  open(content, host) {
    this.close();
    const backdrop = h('div', { class: 'sheet-backdrop', onClick: (e) => { if (e.target === backdrop) this.close(); } });
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.title });
    const head = h('div', { class: 'card-head' }, h('h2', { text: this.title }), h('button', { type: 'button', class: 'btn quiet', text: 'Закрыть', onClick: () => this.close() }));
    sheet.append(h('div', { class: 'grab', 'aria-hidden': 'true' }), head, content);
    backdrop.append(sheet);
    (host === undefined ? document.body : host).append(backdrop);
    this.nodes.backdrop = backdrop;
    this.nodes.key = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.nodes.key);
    const first = sheet.querySelector('button, input, textarea, select');
    if (first) first.focus();
    return sheet;
  }

  close() {
    if (this.nodes.backdrop) this.nodes.backdrop.remove();
    if (this.nodes.key) document.removeEventListener('keydown', this.nodes.key);
    this.nodes.backdrop = undefined;
    this.nodes.key = undefined;
  }
}

export class Composer {
  constructor(placeholder, onSend, onAttach) {
    this.placeholder = placeholder;
    this.onSend = onSend;
    this.onAttach = onAttach;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'composer' });
    const input = h('input', { type: 'file', accept: '.txt,.json,.md,audio/*', onChange: (e) => { const f = e.target.files[0]; if (f) this.onAttach(f); e.target.value = ''; } });
    // Скрепка: <label> вокруг <input type=file> — ref.click() в песочнице заглушён.
    const attach = h('label', { class: 'attach', title: 'Вложение', 'aria-label': 'Вложение' }, '📎', input);
    const area = h('textarea', { rows: '1', placeholder: this.placeholder, 'aria-label': this.placeholder });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } });
    const send = h('button', { type: 'button', class: 'send', text: '⏎', title: 'Отправить (Enter)', 'aria-label': 'Отправить', onClick: () => this.send() });
    root.append(attach, area, send);
    el.append(root);
    this.nodes.area = area;
    return root;
  }

  send() {
    const text = this.nodes.area.value.trim();
    if (text === '') return;
    this.nodes.area.value = '';
    this.onSend(text);
  }

  destroy() {
    this.nodes.area.parentElement.remove();
  }
}

export class Toast {
  constructor(host) {
    this.host = host;
    this.state = { timer: 0, node: undefined };
    Object.freeze(this);
  }

  show(text) {
    if (this.state.node) this.state.node.remove();
    const node = h('div', { class: 'toast', role: 'status', text });
    this.host.append(node);
    this.state.node = node;
    window.clearTimeout(this.state.timer);
    this.state.timer = window.setTimeout(() => node.remove(), 3500);
  }
}

export class HarnessStatus {
  constructor(status, reason) {
    this.status = ['green', 'red', 'hidden_by_harness'].includes(status) ? status : 'hidden_by_harness';
    this.reason = reason === undefined ? '' : reason;
    Object.freeze(this);
  }

  render(el) {
    const map = { green: ['green', 'Харнесс зелёный'], red: ['red', 'Харнесс красный'], hidden_by_harness: ['grey', 'Нет харнесса'] };
    const [cls, label] = map[this.status];
    const node = h('span', { class: `chip ${cls}`, title: this.reason }, label);
    el.append(node);
    return node;
  }
}
