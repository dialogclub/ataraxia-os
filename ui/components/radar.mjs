// Radar: SVG, 6/8 осей, нормы серым. Вход — массив { label, param, norm? }.
import { svg, h, present, norm, emptyViz, clear } from './base.mjs';

export class Radar {
  constructor(size) {
    this.size = typeof size === 'number' ? size : 260;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'radar-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(axes) {
    clear(this.nodes.root);
    const list = Array.isArray(axes) ? axes : [];
    if (list.length < 3 || !list.some((a) => present(a.param))) {
      this.nodes.root.append(emptyViz(list.length < 3 ? 'радар: меньше 3 осей' : 'радар: нет данных'));
      return;
    }
    const s = this.size; const c = s / 2; const r = s / 2 - 28;
    const n = list.length;
    const pt = (i, k) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + r * k * Math.cos(a), c + r * k * Math.sin(a)]; };
    const root = svg('svg', { class: 'viz', viewBox: `0 0 ${s} ${s}`, role: 'img', 'aria-label': `радар ${n} осей` });
    [0.25, 0.5, 0.75, 1].forEach((k) => root.append(svg('polygon', { class: 'grid', points: list.map((_, i) => pt(i, k).join(',')).join(' ') })));
    list.forEach((_, i) => { const [x, y] = pt(i, 1); root.append(svg('line', { class: 'grid', x1: c, y1: c, x2: x, y2: y })); });
    if (list.every((a) => present(a.norm))) root.append(svg('polygon', { class: 'norm', points: list.map((a, i) => pt(i, norm(a.norm)).join(',')).join(' ') }));
    root.append(svg('polygon', { class: 'shape', points: list.map((a, i) => pt(i, norm(a.param)).join(',')).join(' ') }));
    list.forEach((a, i) => {
      const [x, y] = pt(i, 1.16);
      root.append(svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', text: `${a.label}${present(a.param) ? '' : ' ⛔'}` }));
      if (present(a.param)) { const [px, py] = pt(i, norm(a.param)); root.append(svg('circle', { cx: px, cy: py, r: 3, fill: '#0A84FF' })); }
    });
    this.nodes.root.append(root);
  }

  destroy() {
    clear(this.nodes.root);
  }
}
