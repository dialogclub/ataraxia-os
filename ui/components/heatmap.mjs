// Heatmap24: активность по часам суток (24 клетки), из lexisTool.heatmap. ⛔ без временных меток.
import { h, clear, emptyViz } from './base.mjs';

export class Heatmap24 {
  constructor() {
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'heatmap-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(heatmap) {
    clear(this.nodes.root);
    const hm = heatmap === undefined || heatmap === null ? {} : heatmap;
    if (!Array.isArray(hm.hours) || hm.hours.length !== 24 || hm.badge === '⛔' || hm.hours.every((v) => !Number.isFinite(v) || v === 0)) { this.nodes.root.append(emptyViz(hm.reason || 'тепловая карта: нет временных меток')); return; }
    const max = Math.max(...hm.hours.map((v) => (Number.isFinite(v) ? v : 0)), 1);
    const grid = h('div', { class: 'heat24', role: 'img', 'aria-label': `активность по часам, максимум ${max}` });
    hm.hours.forEach((v, hour) => {
      const k = Number.isFinite(v) ? v / max : 0;
      grid.append(h('div', { class: 'cell', title: `${hour}:00 — ${Number.isFinite(v) ? v : 0}`, style: `background:rgba(10,132,255,${(0.08 + 0.92 * k).toFixed(2)})` }, h('span', { text: String(hour) })));
    });
    this.nodes.root.append(grid, h('div', { class: 'caption', text: `${hm.stamped} реплик с метками · шкала 0–${max}` }));
  }

  destroy() {
    clear(this.nodes.root);
  }
}
