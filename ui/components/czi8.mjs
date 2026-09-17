// Czi8Ring: кольцо K1–K8, разрыв подсвечен. Вход: { levels: {K1..K8: Param}, gap }.
import { svg, h, present, norm, emptyViz, clear } from './base.mjs';

export class Czi8Ring {
  constructor(size) {
    this.size = typeof size === 'number' ? size : 220;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'czi8-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(data) {
    clear(this.nodes.root);
    const d = data === undefined || data === null ? {} : data;
    const levels = d.levels === undefined ? {} : d.levels;
    const keys = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8'];
    if (!keys.some((k) => present(levels[k]))) { this.nodes.root.append(emptyViz('ЦЗИ-8: нет классификации')); return; }
    const s = this.size; const c = s / 2; const r = s / 2 - 26;
    const root = svg('svg', { class: 'viz', viewBox: `0 0 ${s} ${s}`, role: 'img', 'aria-label': `ЦЗИ-8, разрыв ${d.gap || 'нет'}` });
    keys.forEach((k, i) => {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 8 + 0.04; const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / 8 - 0.04;
      const path = `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
      const cls = k === d.gap ? 'ring-seg gap' : present(levels[k]) && norm(levels[k]) > 0.5 ? 'ring-seg active' : 'ring-seg';
      root.append(svg('path', { class: cls, d: path, opacity: present(levels[k]) ? String(0.35 + 0.65 * norm(levels[k])) : '0.25' }));
      const am = (a0 + a1) / 2;
      root.append(svg('text', { x: c + (r + 18) * Math.cos(am), y: c + (r + 18) * Math.sin(am), 'text-anchor': 'middle', 'dominant-baseline': 'middle', text: k }));
    });
    root.append(svg('text', { class: 'big', x: c, y: c, 'text-anchor': 'middle', 'dominant-baseline': 'middle', text: d.gap || '—' }));
    root.append(svg('text', { x: c, y: c + 22, 'text-anchor': 'middle', text: 'разрыв' }));
    this.nodes.root.append(root);
  }

  destroy() {
    clear(this.nodes.root);
  }
}
