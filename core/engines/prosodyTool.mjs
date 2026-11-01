// prosodyTool (ХРОНОС): PCM → F0 (автокорреляция), вариативность F0, RMS-огибающая, доля пауз, темп онсетов,
// форманты F1–F4 (LPC), центроид, наклон спектра, HNR, джиттер, шиммер; спектрограмма 0–5 кГц.
// Акустические прокси — не диагноз и не верификация личности. Пороги вокализации/пауз — калибровочная реконструкция.
import { Param } from '../param.mjs';
import { Fft, hann, autocorr, levinson, lpcEnvelope, parabolic, median, mean, stddev } from '../dsp.mjs';

const VERSION = '1.0';
const TOOL = 'prosodyTool';
const WIN = 2048;
const HOP = 512;
const FMAX = 5000;
const F0_MIN = 75;
const F0_MAX = 500;
const VOICED_R = 0.45;            // порог нормированной автокорреляции для вокализации (реконструкция)
const PAUSE_DB = -35;             // пауза: RMS ниже пика на 35 дБ (реконструкция)
const SILENCE_ABS = 1e-4;         // цифровая тишина
const BANDS = Object.freeze({ f1: [200, 900], f2: [900, 2500], f3: [2500, 3500], f4: [3500, 5000] });
const MAX_SPEC_FRAMES = 600;
const MAX_SPEC_BINS = 128;

const P = (v, unit, range, note) => (Number.isFinite(v) ? Param.measured(Math.min(range[1], Math.max(range[0], v)), unit, range, TOOL, VERSION, note === undefined ? '' : note).json() : Param.missing(unit, range, TOOL, VERSION, note === undefined ? 'нет данных' : note).json());

// Метки циклов внутри кадра — восходящие переходы через ноль с максимальным наклоном в окне [0,7P; 1,3P]
// (интервал между метками равен периоду). Джиттер/шиммер по циклам — грубый аналог Praat, без согласования форм волны.
function cycles(frame, period) {
  const marks = [];
  const amps = [];
  const limit = Math.min(frame.length - 1, Math.round(period * 1.5));
  let start = -1; let bestSlope = 0;
  for (let i = 1; i < limit; i += 1) if (frame[i - 1] < 0 && frame[i] >= 0 && frame[i] - frame[i - 1] > bestSlope) { bestSlope = frame[i] - frame[i - 1]; start = i; }
  if (start < 0) return { jitter: Number.NaN, shimmer: Number.NaN };
  const sub = (i) => i - 1 + (0 - frame[i - 1]) / (frame[i] - frame[i - 1]);
  marks.push(sub(start));
  let pos = start;
  while (pos + 1.3 * period < frame.length) {
    const lo = Math.round(pos + 0.7 * period); const hi = Math.round(pos + 1.3 * period);
    let m = -1; let slope = 0; let amp = 0;
    for (let i = lo; i <= hi; i += 1) if (frame[i - 1] < 0 && frame[i] >= 0 && frame[i] - frame[i - 1] > slope) { slope = frame[i] - frame[i - 1]; m = i; }
    if (m < 0) break;
    for (let i = pos; i < m; i += 1) amp = Math.max(amp, Math.abs(frame[i]));
    marks.push(sub(m));
    amps.push(amp);
    pos = m;
  }
  if (marks.length < 4) return { jitter: Number.NaN, shimmer: Number.NaN };
  const periods = []; const dT = []; const dA = [];
  for (let i = 1; i < marks.length; i += 1) periods.push(marks[i] - marks[i - 1]);
  for (let i = 1; i < periods.length; i += 1) dT.push(Math.abs(periods[i] - periods[i - 1]));
  for (let i = 1; i < amps.length; i += 1) dA.push(Math.abs(amps[i] - amps[i - 1]));
  const mT = mean(periods); const mA = mean(amps);
  return { jitter: mT > 0 ? mean(dT) / mT : Number.NaN, shimmer: mA > 0 ? mean(dA) / mA : Number.NaN };
}

export class ProsodyTool {
  constructor(options) {
    const o = options === undefined ? {} : options;
    this.maxSeconds = typeof o.maxSeconds === 'number' ? o.maxSeconds : 120;
    Object.freeze(this);
  }

  // Вход: { pcm: Float32Array|number[], sr: 44100|48000 }. Выход: Param-объекты + треки + спектрограмма.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const sr = typeof src.sr === 'number' && Number.isFinite(src.sr) && src.sr >= 8000 && src.sr <= 96000 ? src.sr : 0;
    const raw = src.pcm === undefined || src.pcm === null ? [] : src.pcm;
    if (sr === 0 || raw.length === 0) return this.missing(sr === 0 ? 'нет частоты дискретизации' : 'нет аудио');
    const limit = Math.min(raw.length, Math.floor(this.maxSeconds * sr));
    const n = Math.max(WIN, limit);
    const pcm = new Float64Array(n);
    for (let i = 0; i < limit; i += 1) { const v = Number(raw[i]); pcm[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }
    const frameCount = Math.floor((n - WIN) / HOP) + 1;
    const fft = new Fft(WIN);
    const fftAc = new Fft(WIN * 2);
    const win = hann(WIN);
    const binHz = sr / WIN;
    const nb = Math.min(WIN / 2, Math.floor(FMAX / binHz) + 1);
    const lpcOrder = Math.min(60, 2 + Math.round(sr / 1000));
    const rmsT = new Float64Array(frameCount);
    const f0T = new Float64Array(frameCount).fill(Number.NaN);
    const rT = new Float64Array(frameCount);
    const spec = [];
    const specMean = new Float64Array(nb);
    const re = new Float64Array(WIN); const im = new Float64Array(WIN);
    const scratch = { re: new Float64Array(WIN * 2), im: new Float64Array(WIN * 2) };
    const pe = new Float64Array(WIN); const rr = new Float64Array(lpcOrder + 1);
    const formantsAll = { f1: [], f2: [], f3: [], f4: [] };
    const jit = []; const shim = [];
    let maxDb = -200;
    for (let f = 0; f < frameCount; f += 1) {
      const frame = pcm.subarray(f * HOP, f * HOP + WIN);
      let e = 0;
      for (let i = 0; i < WIN; i += 1) e += frame[i] * frame[i];
      rmsT[f] = Math.sqrt(e / WIN);
      // Спектр кадра (окно Ханна) — только 0–5 кГц.
      for (let i = 0; i < WIN; i += 1) { re[i] = frame[i] * win[i]; im[i] = 0; }
      fft.forward(re, im);
      const row = new Float64Array(nb);
      for (let b = 0; b < nb; b += 1) { const m = Math.sqrt(re[b] * re[b] + im[b] * im[b]) / WIN; row[b] = 20 * Math.log10(Math.max(m, 1e-9)); specMean[b] += row[b] / frameCount; if (row[b] > maxDb) maxDb = row[b]; }
      spec.push(row);
      // F0: автокорреляция без окна, поправка на смещение; октавная проверка — предпочитаем меньший лаг.
      if (rmsT[f] > SILENCE_ABS) {
        const ac = autocorr(frame, fftAc, scratch);
        const lo = Math.max(2, Math.floor(sr / F0_MAX)); const hi = Math.min(WIN - 2, Math.ceil(sr / F0_MIN));
        let bestLag = -1; let bestR = -1;
        for (let t = lo; t <= hi; t += 1) if (ac[t] > ac[t - 1] && ac[t] >= ac[t + 1] && ac[t] > bestR) { bestR = ac[t]; bestLag = t; }
        if (bestLag > 0) {
          for (let t = lo; t < bestLag; t += 1) if (ac[t] > ac[t - 1] && ac[t] >= ac[t + 1] && ac[t] >= 0.9 * bestR) { bestLag = t; break; }
          rT[f] = Math.min(0.999, Math.max(0, ac[bestLag]));
          if (rT[f] > VOICED_R) {
            const lag = bestLag + parabolic(ac[bestLag - 1], ac[bestLag], ac[bestLag + 1]);
            f0T[f] = sr / lag;
            const c = cycles(frame, lag);
            if (Number.isFinite(c.jitter)) jit.push(c.jitter);
            if (Number.isFinite(c.shimmer)) shim.push(c.shimmer);
            // Форманты: преэмфаза, окно, LPC порядка 2 + sr/1000, пики огибающей по полосам.
            pe[0] = 0;
            for (let i = 1; i < WIN; i += 1) pe[i] = (frame[i] - 0.97 * frame[i - 1]) * win[i];
            for (let k = 0; k <= lpcOrder; k += 1) { let s = 0; for (let i = k; i < WIN; i += 1) s += pe[i] * pe[i - k]; rr[k] = s; }
            const a = levinson(rr, lpcOrder);
            const env = lpcEnvelope(a, sr, FMAX, 501);
            Object.keys(BANDS).forEach((key) => {
              const [b0, b1] = BANDS[key];
              let pk = -1; let pv = -Infinity;
              for (let p = 1; p < 500; p += 1) { const hz = (p / 500) * FMAX; if (hz >= b0 && hz <= b1 && env[p] > env[p - 1] && env[p] >= env[p + 1] && env[p] > pv) { pv = env[p]; pk = p; } }
              if (pk > 0) formantsAll[key].push(((pk + parabolic(env[pk - 1], env[pk], env[pk + 1])) / 500) * FMAX);
            });
          }
        }
      }
    }
    // Паузы и онсеты по RMS относительно пика.
    let peak = 0;
    for (let f = 0; f < frameCount; f += 1) if (rmsT[f] > peak) peak = rmsT[f];
    const thr = Math.max(SILENCE_ABS, peak * Math.pow(10, PAUSE_DB / 20));
    let pauses = 0; let onsets = 0; let sounding = 0;
    const hnrs = [];
    for (let f = 0; f < frameCount; f += 1) {
      const isPause = rmsT[f] < thr;
      if (isPause) pauses += 1; else sounding += 1;
      if (!isPause && (f === 0 || rmsT[f - 1] < thr || rmsT[f] > 2 * rmsT[f - 1])) onsets += 1;
      if (!isPause) { const r = Math.min(0.999, Math.max(0.001, rT[f])); hnrs.push(10 * Math.log10(r / (1 - r))); }
    }
    const durationS = n / sr;
    const voiced = Array.from(f0T).filter((v) => Number.isFinite(v));
    // Центроид и наклон по среднему спектру 0–5 кГц (наклон — регрессия дБ на кГц).
    let num = 0; let den = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
    for (let b = 0; b < nb; b += 1) { const lin = Math.pow(10, specMean[b] / 20); const hz = b * binHz; num += hz * lin; den += lin; const x = hz / 1000; sx += x; sy += specMean[b]; sxx += x * x; sxy += x * specMean[b]; }
    const centroid = den > 0 ? num / den : Number.NaN;
    const tilt = nb * sxx - sx * sx !== 0 ? (nb * sxy - sx * sy) / (nb * sxx - sx * sx) : Number.NaN;
    // Спектрограмма: квантование 0–255 (0 = −80 дБ от максимума), прореживание до 600 × 128.
    const gF = Math.ceil(frameCount / MAX_SPEC_FRAMES); const gB = Math.ceil(nb / MAX_SPEC_BINS);
    const data = [];
    for (let f = 0; f < frameCount; f += gF) {
      const row = [];
      for (let b = 0; b < nb; b += gB) {
        let s = 0; let c = 0;
        for (let ff = f; ff < Math.min(frameCount, f + gF); ff += 1) for (let bb = b; bb < Math.min(nb, b + gB); bb += 1) { s += spec[ff][bb]; c += 1; }
        row.push(Math.round(Math.min(255, Math.max(0, ((s / c - maxDb) + 80) * (255 / 80)))));
      }
      data.push(row);
    }
    let peakBin = 0;
    for (let b = 1; b < nb; b += 1) if (specMean[b] > specMean[peakBin]) peakBin = b;
    const f0Mean = voiced.length ? mean(voiced) : Number.NaN;
    const f0Sd = voiced.length > 1 ? stddev(voiced) : (voiced.length === 1 ? 0 : Number.NaN);
    const pauseShare = (pauses / frameCount) * 100;
    const onsetRate = onsets / durationS;
    const rmsMean = mean(rmsT);
    const rmsSd = stddev(rmsT);
    // Прокси-чипы (Приложение D): возбуждение · уплощённый аффект · сдержанность — пороги реконструированы (🔵).
    const idx = (v) => Math.min(1, Math.max(0, v));
    const agitation = voiced.length ? idx((f0Sd / 40) * 0.5 + (onsetRate / 4) * 0.5) : Number.NaN;
    const flat = voiced.length ? idx(1 - (f0Sd / 30) * 0.5 - ((rmsMean > 0 ? rmsSd / rmsMean : 0) / 1) * 0.5) : Number.NaN;
    const restraint = idx((pauseShare / 60) * 0.6 + (1 - Math.min(1, rmsMean / 0.2)) * 0.4);
    const hyp = (v, note) => (Number.isFinite(v) ? Param.hypothesis(v, 'index', [0, 1], TOOL, VERSION, note).json() : Param.missing('index', [0, 1], TOOL, VERSION, 'нет вокализованных кадров').json());
    const fm = (key) => (formantsAll[key].length ? P(median(formantsAll[key]), 'Hz', BANDS[key], `LPC p=${lpcOrder}, медиана ${formantsAll[key].length} кадров`) : Param.missing('Hz', BANDS[key], TOOL, VERSION, 'нет пика в полосе').json());
    return Object.freeze({
      status: 'ok', reason: '', version: VERSION, sr, duration_s: Number(durationS.toFixed(3)), frames: frameCount,
      voiced_share: P((voiced.length / frameCount) * 100, '%', [0, 100]),
      f0: { mean: voiced.length ? P(f0Mean, 'Hz', [F0_MIN, F0_MAX], `автокорреляция, ${voiced.length} кадров`) : Param.missing('Hz', [F0_MIN, F0_MAX], TOOL, VERSION, 'нет вокализованных кадров').json(),
        sd: voiced.length ? P(f0Sd, 'Hz', [0, 200]) : Param.missing('Hz', [0, 200], TOOL, VERSION, 'нет вокализованных кадров').json(),
        track: Array.from(f0T).map((v) => (Number.isFinite(v) ? Number(v.toFixed(1)) : null)) },
      rms: { mean: P(rmsMean, 'rel', [0, 1]), sd: P(rmsSd, 'rel', [0, 1]), track: Array.from(rmsT).map((v) => Number(v.toFixed(5))) },
      pause_share: P(pauseShare, '%', [0, 100], `порог ${PAUSE_DB} дБ от пика`),
      onset_rate: P(onsetRate, '1/s', [0, 20]),
      hnr: hnrs.length ? P(mean(hnrs), 'dB', [-20, 40], 'по автокорреляции, звучащие кадры') : Param.missing('dB', [-20, 40], TOOL, VERSION, 'нет звучащих кадров').json(),
      jitter: jit.length ? P(median(jit), 'ratio', [0, 1], 'по циклам; норма < 0,01') : Param.missing('ratio', [0, 1], TOOL, VERSION, 'нет циклов').json(),
      shimmer: shim.length ? P(median(shim), 'ratio', [0, 2], 'по циклам; норма < 0,03') : Param.missing('ratio', [0, 2], TOOL, VERSION, 'нет циклов').json(),
      formants: { f1: fm('f1'), f2: fm('f2'), f3: fm('f3'), f4: fm('f4') },
      centroid: P(centroid, 'Hz', [0, FMAX]),
      tilt: P(tilt, 'dB/kHz', [-60, 60], 'регрессия среднего спектра 0–5 кГц'),
      spectrogram: { frames: data.length, bins: data.length ? data[0].length : 0, bin_hz: Number((binHz * gB).toFixed(3)), raw_bin_hz: Number(binHz.toFixed(3)), hop_s: Number(((HOP * gF) / sr).toFixed(4)), fmax: FMAX, peak_bin: peakBin, data },
      proxies: { agitation: hyp(agitation, 'прокси: вариативность F0 + онсеты; не диагноз'), flat_affect: hyp(flat, 'прокси: низкая вариативность F0 и RMS; не диагноз'), restraint: hyp(restraint, 'прокси: паузы и тихий RMS; не диагноз') }
    });
  }

  missing(reason) {
    const m = (unit, range) => Param.missing(unit, range, TOOL, VERSION, reason).json();
    return Object.freeze({
      status: 'missing', reason, version: VERSION, sr: 0, duration_s: 0, frames: 0, voiced_share: m('%', [0, 100]),
      f0: { mean: m('Hz', [F0_MIN, F0_MAX]), sd: m('Hz', [0, 200]), track: [] }, rms: { mean: m('rel', [0, 1]), sd: m('rel', [0, 1]), track: [] },
      pause_share: m('%', [0, 100]), onset_rate: m('1/s', [0, 20]), hnr: m('dB', [-20, 40]), jitter: m('ratio', [0, 1]), shimmer: m('ratio', [0, 2]),
      formants: { f1: m('Hz', BANDS.f1), f2: m('Hz', BANDS.f2), f3: m('Hz', BANDS.f3), f4: m('Hz', BANDS.f4) }, centroid: m('Hz', [0, FMAX]), tilt: m('dB/kHz', [-60, 60]),
      spectrogram: { frames: 0, bins: 0, bin_hz: 0, raw_bin_hz: 0, hop_s: 0, fmax: FMAX, peak_bin: 0, data: [] },
      proxies: { agitation: m('index', [0, 1]), flat_affect: m('index', [0, 1]), restraint: m('index', [0, 1]) }
    });
  }
}
