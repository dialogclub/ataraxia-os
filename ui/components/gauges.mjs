// RingGauge (0–100, зоны) и TrafficScale7 (7 зон, активный сегмент приподнят).
import { svg, h, present, norm, fmt, emptyViz, clear } from './base.mjs';

export class RingGauge {
  constructor(size, zones) {
    this.size = typeof size === 'number' ? size : 160;
    // Зоны по умолчанию: 0–40 низко, 40–70 средне, 70–100 высоко; цвета семантические.
    this.zones = Object.freeze(Array.isArray(zones) ? zones : [[0, 40, '#FF9F0A'], [40, 70, '#FFCC00'], [70, 100, '#34C759']]);
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'gauge-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(param, label) {
    clear(this.nodes.root);
    if (!present(param)) { this.nodes.root.append(emptyViz(`${label || 'гейдж'}: нет данных`)); return; }
    const s = this.size; const sw = Math.max(3, Math.round(s / 14)); const c = s / 2; const r = s / 2 - sw; const len = 2 * Math.PI * r;
    const k = norm(param);
    const root = svg('svg', { class: 'viz', viewBox: `0 0 ${s} ${s}`, role: 'img', 'aria-label': `${label || ''} ${fmt(param, 'score')} ${param.unit}` });
    root.append(svg('circle', { class: 'arc track', cx: c, cy: c, r, 'stroke-width': sw }));
    const v = param.value;
    const zone = this.zones.find((z) => v >= z[0] && v <= z[1]);
    const arc = svg('circle', { class: 'arc value', cx: c, cy: c, r, 'stroke-width': sw, 'stroke-dasharray': `${len * k} ${len}`, transform: `rotate(-90 ${c} ${c})` });
    if (zone) arc.setAttribute('stroke', zone[2]);
    root.append(arc);
    root.append(svg('text', { class: 'big', x: c, y: c - 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', text: fmt(param, 'score') }));
    root.append(svg('text', { x: c, y: c + 22, 'text-anchor': 'middle', text: `${param.unit} · ${param.badge}` }));
    this.nodes.root.append(root);
  }

  destroy() {
    clear(this.nodes.root);
  }
}

export class TrafficScale7 {
  constructor(labels) {
    this.labels = Object.freeze(Array.isArray(labels) && labels.length === 7 ? labels : ['значительно снижено', 'снижено', 'слегка снижено', 'норма', 'слегка повышено', 'повышено', 'значительно повышено']);
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'traffic-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(param, label) {
    clear(this.nodes.root);
    if (!present(param)) { this.nodes.root.append(emptyViz(`${label || 'шкала'}: нет данных`)); return; }
    const w = 320; const hgt = 56; const gap = 3; const seg = (w - gap * 6) / 7;
    const active = Math.min(6, Math.floor(norm(param) * 7));
    const colors = ['#FF9F0A', '#FFCC00', '#FFE066', '#34C759', '#FFE066', '#FFCC00', '#FF9F0A'];
    const root = svg('svg', { class: 'viz', viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': `${label || ''}: ${this.labels[active]}, ${fmt(param, 'score')} ${param.unit}` });
    for (let i = 0; i < 7; i += 1) {
      root.append(svg('rect', { class: `zone${i === active ? ' active' : ''}`, x: i * (seg + gap), y: 14, width: seg, height: 22, rx: 5, fill: colors[i], opacity: i === active ? 1 : 0.35 }));
    }
    const lx = Math.min(w - 70, Math.max(70, active * (seg + gap) + seg / 2));
    root.append(svg('text', { x: lx, y: 50, 'text-anchor': 'middle', text: `${this.labels[active]} · ${fmt(param, 'score')} ${param.unit}` }));
    this.nodes.root.append(root);
  }

  destroy() {
    clear(this.nodes.root);
  }
}
