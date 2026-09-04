// Dynamic Island — орган статуса системы: слой/агент, прогресс, модель, откат. aria-live для доступности.
import { h, clear } from './base.mjs';

export class DynamicIsland {
  constructor(onCancel, onLongPress) {
    this.onCancel = onCancel;
    this.onLongPress = onLongPress;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const wrap = h('div', { class: 'island-wrap' });
    const island = h('div', { class: 'island', dataset: { phase: 'idle' }, role: 'status', 'aria-live': 'polite', tabindex: '0', title: 'Долгое нажатие — командная строка' });
    const dot = h('span', { class: 'dot', 'aria-hidden': 'true' });
    const text = h('span', { class: 'text', text: 'ATMARAKSI OS · готово' });
    const progress = h('span', { class: 'progress', hidden: true }, h('i'));
    const cancel = h('button', { type: 'button', text: 'Отменить', hidden: true, onClick: () => this.onCancel() });
    island.append(dot, text, progress, cancel);
    let timer = 0;
    const start = () => { timer = window.setTimeout(() => this.onLongPress(), 500); };
    const stop = () => window.clearTimeout(timer);
    island.addEventListener('pointerdown', start);
    island.addEventListener('pointerup', stop);
    island.addEventListener('pointerleave', stop);
    island.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onLongPress(); } });
    wrap.append(island);
    el.append(wrap);
    this.nodes.island = island; this.nodes.text = text; this.nodes.progress = progress; this.nodes.cancel = cancel;
    return wrap;
  }

  // data: { phase: idle|running|done|error, layer, agent, percent, model, fallback, text }
  update(data) {
    const d = data === undefined ? {} : data;
    const phase = ['idle', 'running', 'done', 'error'].includes(d.phase) ? d.phase : 'idle';
    this.nodes.island.dataset.phase = phase;
    const parts = [];
    if (d.text) parts.push(d.text);
    else {
      if (d.layer) parts.push(d.layer);
      if (d.agent) parts.push(d.agent);
      if (typeof d.percent === 'number' && Number.isFinite(d.percent)) parts.push(`${Math.round(d.percent)} %`);
      if (d.model) parts.push(d.fallback ? `${d.model} (откат)` : d.model);
    }
    this.nodes.text.textContent = parts.length ? parts.join(' · ') : 'ATMARAKSI OS · готово';
    this.nodes.progress.hidden = phase !== 'running';
    this.nodes.progress.firstChild.style.width = `${typeof d.percent === 'number' && Number.isFinite(d.percent) ? Math.min(100, Math.max(0, d.percent)) : 0}%`;
    this.nodes.cancel.hidden = phase !== 'running';
  }

  destroy() {
    clear(this.nodes.island);
  }
}
