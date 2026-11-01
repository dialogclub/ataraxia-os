// DSP-примитивы без DOM: БПФ radix-2, окно Ханна, автокорреляция через БПФ, Левинсон–Дурбин.
// Всё детерминировано; Float64Array внутри, обычные массивы наружу.

export class Fft {
  constructor(n) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('размер БПФ должен быть степенью двойки');
    this.n = n;
    const rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r = (r << 1) | ((i >>> b) & 1);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i += 1) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
    this.rev = rev; this.cos = cos; this.sin = sin;
    Object.freeze(this);
  }

  // Прямое БПФ на месте; re/im — Float64Array длины n.
  forward(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i += 1) {
      const j = this.rev[i];
      if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1; const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k += 1) {
          const wr = this.cos[k * step]; const wi = -this.sin[k * step];
          const a = start + k; const b = a + half;
          const xr = re[b] * wr - im[b] * wi; const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  // Обратное БПФ через сопряжение.
  inverse(re, im) {
    for (let i = 0; i < this.n; i += 1) im[i] = -im[i];
    this.forward(re, im);
    for (let i = 0; i < this.n; i += 1) { re[i] /= this.n; im[i] = -im[i] / this.n; }
  }
}

export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// Нормированная автокорреляция кадра через БПФ (с поправкой на смещение оценки).
export function autocorr(frame, fft, scratch) {
  const n = fft.n;
  const re = scratch === undefined ? new Float64Array(n) : scratch.re; const im = scratch === undefined ? new Float64Array(n) : scratch.im;
  re.fill(0); im.fill(0);
  re.set(frame.subarray(0, Math.min(frame.length, n)));
  fft.forward(re, im);
  for (let i = 0; i < n; i += 1) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft.inverse(re, im);
  const r0 = re[0];
  const out = new Float64Array(frame.length);
  if (r0 <= 0) return out;
  const len = frame.length;
  for (let t = 0; t < len; t += 1) out[t] = (re[t] / r0) * (len / (len - t));
  return out;
}

// Коэффициенты линейного предсказания по автокорреляции (Левинсон–Дурбин). Возвращает a[0..p], a[0] = 1.
export function levinson(r, order) {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  if (err <= 0) return a;
  const tmp = new Float64Array(order + 1);
  for (let i = 1; i <= order; i += 1) {
    let acc = r[i];
    for (let j = 1; j < i; j += 1) acc += a[j] * r[i - j];
    const k = -acc / err;
    tmp.set(a);
    for (let j = 1; j < i; j += 1) a[j] = tmp[j] + k * tmp[i - j];
    a[i] = k;
    err *= 1 - k * k;
    if (err <= 1e-12) break;
  }
  return a;
}

// Огибающая LPC в дБ на сетке частот [0, fmax] из points точек.
export function lpcEnvelope(a, sr, fmax, points) {
  const out = new Float64Array(points);
  for (let p = 0; p < points; p += 1) {
    const w = (2 * Math.PI * (p / (points - 1)) * fmax) / sr;
    let re = 0; let im = 0;
    for (let k = 0; k < a.length; k += 1) { re += a[k] * Math.cos(k * w); im -= a[k] * Math.sin(k * w); }
    const mag = Math.sqrt(re * re + im * im);
    out[p] = -20 * Math.log10(Math.max(mag, 1e-9));
  }
  return out;
}

// Параболическая интерполяция вершины по трём точкам: смещение в [-0.5, 0.5].
export function parabolic(y0, y1, y2) {
  const d = y0 - 2 * y1 + y2;
  if (Math.abs(d) < 1e-12) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d));
}

export function median(values) {
  const v = Array.from(values).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return Number.NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function mean(values) {
  let s = 0; let n = 0;
  for (const x of values) if (Number.isFinite(x)) { s += x; n += 1; }
  return n === 0 ? Number.NaN : s / n;
}

export function stddev(values) {
  const m = mean(values);
  if (!Number.isFinite(m)) return Number.NaN;
  let s = 0; let n = 0;
  for (const x of values) if (Number.isFinite(x)) { s += (x - m) * (x - m); n += 1; }
  return n < 2 ? 0 : Math.sqrt(s / (n - 1));
}
