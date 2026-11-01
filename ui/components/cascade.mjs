// CascadeWaterfall: A, D, C → Φ → B; слайдер Φ пересчитывает через движок без LLM (PhiControl).
import { h, present, fmt, clear } from './base.mjs';

export class PhiControl {
  constructor(value, onChange) {
    this.state = { value: typeof value === 'number' && Number.isFinite(value) ? value : 0.5 };
    this.onChange = onChange;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'phi' });
    const label = h('span', { class: 'sub', text: 'Φ' });
    const out = h('span', { class: 'mono', text: this.state.value.toFixed(2) });
    const input = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(this.state.value), 'aria-label': 'Φ-порог осознанности' });
    input.addEventListener('input', () => { this.state.value = Number(input.value); out.textContent = this.state.value.toFixed(2); this.onChange(this.state.value); });
    root.append(label, input, out);
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  value() {
    return this.state.value;
  }

  destroy() {
    clear(this.nodes.root);
  }
}

export class CascadeWaterfall {
  constructor() {
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'waterfall', role: 'img', 'aria-label': 'каскад АВС' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  // data: выход cascadeEngine ({ B, contributions: {A, D, C, phi}, form })
  update(data) {
    clear(this.nodes.root);
    const d = data === undefined || data === null ? {} : data;
    const c = d.contributions === undefined ? {} : d.contributions;
    const rows = [['A', c.A, ''], ['D', c.D, ''], ['C', c.C, ''], ['Φ', c.phi, 'phi'], ['B', d.B, 'b']];
    rows.forEach(([name, p, cls]) => {
      const bar = h('div', { class: 'track' }, h('i', { class: cls, style: `width:${present(p) ? Math.round(p.value * 100) : 0}%` }));
      this.nodes.root.append(h('span', { class: 'sub', text: name }), bar, h('span', { class: 'num', text: fmt(p, 'index') }));
    });
    if (!present(d.B)) this.nodes.root.append(h('span', { class: 'caption', style: 'grid-column:1/-1', text: `⛔ ${d.reason || 'нет входа для каскада'}` }));
    else this.nodes.root.append(h('span', { class: 'caption', style: 'grid-column:1/-1', text: `${d.B.note} · формула v${d.formula_version}` }));
  }

  destroy() {
    clear(this.nodes.root);
  }
}
