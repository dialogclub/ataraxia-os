// Spectrogram (Приложение D): canvas 0–5 кГц, палитра одной температуры (светлое → насыщенный синий), F0-трек поверх,
// паузы — светлыми колонками, метки времени каждые 5 с, полоса спикеров сверху (⛔ без разметки). Envelope — RMS-огибающая.
import { h, clear, emptyViz } from './base.mjs';

const BLUE = [10, 132, 255];
const BG = [242, 242, 247];

export class Spectrogram {
  constructor(height) {
    this.height = typeof height === 'number' ? height : 220;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'spectro-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  // data: выход prosodyTool ({ spectrogram, f0.track, rms.track, pause_share, duration_s }), speakers?: [{from, to, name}]
  update(data, speakers) {
    clear(this.nodes.root);
    const d = data === undefined || data === null ? {} : data;
    const sp = d.spectrogram;
    if (!sp || !Array.isArray(sp.data) || sp.data.length === 0) { this.nodes.root.append(emptyViz('спектрограмма: нет аудио')); return; }
    const W = Math.max(320, Math.min(1200, sp.frames * 2)); const H = this.height; const top = 14; const bottom = 18;
    const canvas = h('canvas', { width: W, height: H, style: 'width:100%;height:auto;display:block;border-radius:10px', role: 'img', 'aria-label': `спектрограмма 0–${sp.fmax} Гц, ${d.duration_s} с` });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${BG.join(',')})`; ctx.fillRect(0, 0, W, H);
    const plotH = H - top - bottom; const colW = W / sp.frames; const rowH = plotH / sp.bins;
    const img = ctx.createImageData(W, H);
    for (let f = 0; f < sp.frames; f += 1) {
      for (let b = 0; b < sp.bins; b += 1) {
        const v = sp.data[f][b] / 255; // 0 — тихо, 1 — максимум
        const x0 = Math.floor(f * colW); const x1 = Math.max(x0 + 1, Math.floor((f + 1) * colW));
        const y0 = Math.floor(top + plotH - (b + 1) * rowH); const y1 = Math.max(y0 + 1, Math.floor(top + plotH - b * rowH));
        const r = Math.round(BG[0] + (BLUE[0] - BG[0]) * v); const g = Math.round(BG[1] + (BLUE[1] - BG[1]) * v); const bl = Math.round(BG[2] + (BLUE[2] - BG[2]) * v);
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const i = (y * W + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = 255; }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Паузы — светлые колонки по RMS-треку.
    const rms = Array.isArray(d.rms && d.rms.track) ? d.rms.track : [];
    if (rms.length) {
      const peak = Math.max(...rms, 1e-9); const thr = Math.max(1e-4, peak * Math.pow(10, -35 / 20));
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      rms.forEach((v, i) => { if (v < thr) { const x = (i / rms.length) * W; ctx.fillRect(x, top, Math.max(1, W / rms.length), plotH); } });
    }
    // F0-трек поверх линией --blue.
    const f0 = Array.isArray(d.f0 && d.f0.track) ? d.f0.track : [];
    if (f0.length) {
      ctx.strokeStyle = '#0A84FF'; ctx.lineWidth = 2; ctx.beginPath(); let pen = false;
      f0.forEach((v, i) => { if (v === null || !Number.isFinite(v)) { pen = false; return; } const x = ((i + 0.5) / f0.length) * W; const y = top + plotH - (v / sp.fmax) * plotH; if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; });
      ctx.stroke();
    }
    // Метки времени каждые 5 с и шкала частот.
    ctx.fillStyle = '#8E8E93'; ctx.font = '11px -apple-system, system-ui, sans-serif';
    const dur = typeof d.duration_s === 'number' ? d.duration_s : sp.frames * sp.hop_s;
    for (let t = 0; t <= dur; t += 5) { const x = (t / dur) * W; ctx.fillRect(x, top + plotH, 1, 4); ctx.fillText(`${t} с`, Math.min(x + 2, W - 28), H - 4); }
    [1000, 2000, 3000, 4000].forEach((hz) => { const y = top + plotH - (hz / sp.fmax) * plotH; ctx.fillText(`${hz / 1000} кГц`, 2, y - 2); });
    // Полоса спикеров сверху.
    const seg = Array.isArray(speakers) ? speakers : [];
    if (seg.length) seg.forEach((s, i) => { ctx.fillStyle = i % 2 ? 'rgba(175,82,222,.5)' : 'rgba(90,200,250,.6)'; ctx.fillRect((s.from / dur) * W, 0, ((s.to - s.from) / dur) * W, top - 3); ctx.fillStyle = '#1C1C1E'; ctx.fillText(s.name, (s.from / dur) * W + 3, 10); });
    else { ctx.fillStyle = 'rgba(60,60,67,.12)'; ctx.fillRect(0, 0, W, top - 3); ctx.fillStyle = '#8E8E93'; ctx.fillText('⛔ спикеры: нет диаризации', 3, 10); }
    this.nodes.root.append(canvas);
    this.nodes.root.append(h('div', { class: 'caption', text: `0–${sp.fmax} Гц · окно 2048, шаг 512, Ханн · F0-трек синим · паузы светлыми колонками · акустические прокси — не диагноз, не верификация личности` }));
  }

  destroy() {
    clear(this.nodes.root);
  }
}

export class Envelope {
  constructor(height) {
    this.height = typeof height === 'number' ? height : 70;
    this.nodes = {};
    Object.freeze(this);
  }

  render(el) {
    const root = h('div', { class: 'envelope-host' });
    el.append(root);
    this.nodes.root = root;
    return root;
  }

  update(track) {
    clear(this.nodes.root);
    const t = Array.isArray(track) ? track.filter((v) => Number.isFinite(v)) : [];
    if (t.length === 0) { this.nodes.root.append(emptyViz('RMS: нет аудио')); return; }
    const W = Math.max(320, Math.min(1200, t.length * 2)); const H = this.height;
    const canvas = h('canvas', { width: W, height: H, style: 'width:100%;height:auto;display:block;border-radius:10px;background:#F2F2F7', role: 'img', 'aria-label': 'RMS-огибающая' });
    const ctx = canvas.getContext('2d');
    const peak = Math.max(...t, 1e-9);
    ctx.fillStyle = 'rgba(10,132,255,.35)'; ctx.strokeStyle = '#0A84FF'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, H);
    t.forEach((v, i) => ctx.lineTo((i / (t.length - 1 || 1)) * W, H - (v / peak) * (H - 6)));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.stroke();
    this.nodes.root.append(canvas);
  }

  destroy() {
    clear(this.nodes.root);
  }
}
