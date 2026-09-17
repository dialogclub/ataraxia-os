// Синтетические сигналы для харнесса DSP: тон, тишина, шум, джиттер/шиммер, гласный с формантами.
import { Rng } from '../harness/Harness.mjs';

export function tone(freq, sr, seconds, amp) {
  const n = Math.round(sr * seconds); const out = new Float32Array(n); const a = amp === undefined ? 0.5 : amp;
  for (let i = 0; i < n; i += 1) out[i] = a * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

export function silence(sr, seconds) {
  return new Float32Array(Math.round(sr * seconds));
}

export function noise(sr, seconds, seed) {
  const rng = new Rng(seed === undefined ? 1 : seed); const n = Math.round(sr * seconds); const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = 0.5 * (rng.next() * 2 - 1);
  return out;
}

// Чередование периодов T(1+δ)/T(1−δ) → локальный джиттер 2δ; чередование амплитуд → шиммер 2ε.
export function jittered(freq, sr, seconds, delta, eps) {
  const n = Math.round(sr * seconds); const out = new Float32Array(n);
  const base = sr / freq; let pos = 0; let k = 0;
  while (pos < n) {
    const period = base * (1 + (k % 2 === 0 ? delta : -delta)); const amp = 0.5 * (1 + (k % 2 === 0 ? eps : -eps));
    for (let i = 0; i < period && pos + i < n; i += 1) out[pos + i] = amp * Math.sin((2 * Math.PI * i) / period);
    pos += Math.round(period); k += 1;
  }
  return out;
}

// Импульсный источник f0 через каскад двухполюсных резонаторов (форманты Гц, полосы Гц).
export function vowel(f0, sr, seconds, formants, bandwidths) {
  const n = Math.round(sr * seconds); const x = new Float64Array(n);
  const period = Math.round(sr / f0);
  for (let i = 0; i < n; i += period) x[i] = 1;
  let y = x;
  formants.forEach((fc, k) => {
    const bw = bandwidths[k]; const r = Math.exp((-Math.PI * bw) / sr); const c = -2 * r * Math.cos((2 * Math.PI * fc) / sr); const g = 1 + c + r * r;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i += 1) out[i] = g * y[i] - c * (i > 0 ? out[i - 1] : 0) - r * r * (i > 1 ? out[i - 2] : 0);
    y = out;
  });
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(y[i]));
  const res = new Float32Array(n);
  for (let i = 0; i < n; i += 1) res[i] = peak > 0 ? (0.8 * y[i]) / peak : 0;
  return res;
}
