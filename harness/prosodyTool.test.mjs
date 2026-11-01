import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { ProsodyTool } from '../core/engines/prosodyTool.mjs';
import { tone, silence, noise, jittered, vowel } from '../fixtures/synth.mjs';

const passport = JSON.parse(readFileSync(new URL('./prosodyTool.harness.json', import.meta.url), 'utf8'));
const tool = new ProsodyTool();
const run = (input) => tool.run(input);
const T44 = { pcm: tone(150, 44100, 2), sr: 44100 };
const T48 = { pcm: tone(150, 48000, 2), sr: 48000 };
const clip = tone(150, 44100, 1, 5);

export const harness = new Harness(passport, [
  Harness.determinism(run, [T44, { pcm: noise(44100, 0.5, 3), sr: 44100 }, {}]),
  Harness.edges(run, [
    { name: 'empty', input: {}, expect: (o, a) => a(o.status === 'missing' && o.f0.mean.badge === '⛔', 'пусто → ⛔') },
    { name: 'single-frame', input: { pcm: tone(200, 44100, 0.02), sr: 44100 }, expect: (o, a) => a(o.frames === 1 && Math.abs(o.f0.mean.value - 200) < 3, 'кадр < 2048 дополняется нулями, F0 ≈ 200') },
    { name: 'silence', input: { pcm: silence(44100, 1), sr: 44100 }, expect: (o, a) => a(o.pause_share.value === 100 && o.f0.mean.badge === '⛔' && o.hnr.badge === '⛔', 'тишина → паузы 100 %, F0/HNR ⛔') },
    { name: 'clipping', input: { pcm: clip, sr: 44100 }, expect: (o, a) => a(Math.abs(o.f0.mean.value - 150) < 1 && o.rms.mean.value <= 1, 'клиппинг ±1 → F0 держится, RMS ≤ 1') },
    { name: 'sr-48000', input: T48, expect: (o, a) => a(Math.abs(o.f0.mean.value - 150) < 1, `48 кГц: F0 = ${o.f0.mean.value}`) },
    { name: 'nan-samples', input: { pcm: [0.1, Number.NaN, 0.2, Infinity, -0.3], sr: 44100 }, expect: (o, a) => a(o.status === 'ok', 'NaN/Infinity в сэмплах → 0, без падения') }
  ]),
  Harness.custom('44,1 vs 48 кГц: одинаковые F0/паузы/HNR (допуск)', () => {
    const a = run(T44); const b = run(T48);
    if (Math.abs(a.f0.mean.value - b.f0.mean.value) > 1) throw new Error(`F0 ${a.f0.mean.value} vs ${b.f0.mean.value}`);
    if (Math.abs(a.hnr.value - b.hnr.value) > 3) throw new Error(`HNR ${a.hnr.value} vs ${b.hnr.value}`);
    if (a.pause_share.value !== b.pause_share.value) throw new Error('паузы различаются');
    return `F0 ${a.f0.mean.value.toFixed(2)}/${b.f0.mean.value.toFixed(2)} Гц · HNR ${a.hnr.value.toFixed(1)}/${b.hnr.value.toFixed(1)} дБ`;
  }),
  Harness.stress((input) => run(input), (rng) => ({ pcm: Array.from({ length: 2048 + Math.floor(rng.between(0, 6144)) }, () => rng.between(-1, 1)), sr: rng.pick([44100, 48000]) }), 1000, 120, 21),
  Harness.golden(run, [
    { id: 'tone150', input: T44, pick: (o) => o.f0.mean.value, expect: [149, 151] },
    { id: 'silence', input: { pcm: silence(44100, 1), sr: 44100 }, pick: (o) => o.pause_share.value, expect: [100, 100] },
    { id: 'noise', input: { pcm: noise(44100, 1, 5), sr: 44100 }, pick: (o) => o.hnr.value, expect: [-20, 5] },
    { id: 'jitter2', input: { pcm: jittered(150, 44100, 2, 0.01, 0), sr: 44100 }, pick: (o) => Number(o.jitter.value.toFixed(4)), expect: [0.017, 0.023] },
    { id: 'shimmer4', input: { pcm: jittered(150, 44100, 2, 0, 0.02), sr: 44100 }, pick: (o) => Number(o.shimmer.value.toFixed(4)), expect: [0.035, 0.045] },
    { id: 'vowel-f1', input: { pcm: vowel(120, 44100, 1.5, [500, 1500, 2500, 3800], [80, 100, 120, 150]), sr: 44100 }, pick: (o) => Math.round(o.formants.f1.value), expect: [420, 580] },
    { id: 'vowel-f2', input: { pcm: vowel(120, 44100, 1.5, [500, 1500, 2500, 3800], [80, 100, 120, 150]), sr: 44100 }, pick: (o) => Math.round(o.formants.f2.value), expect: [1400, 1600] },
    { id: 'vowel-f3', input: { pcm: vowel(120, 44100, 1.5, [500, 1500, 2500, 3800], [80, 100, 120, 150]), sr: 44100 }, pick: (o) => Math.round(o.formants.f3.value), expect: [2400, 2600] },
    { id: 'vowel-f4', input: { pcm: vowel(120, 44100, 1.5, [500, 1500, 2500, 3800], [80, 100, 120, 150]), sr: 44100 }, pick: (o) => Math.round(o.formants.f4.value), expect: [3700, 3900] },
    { id: 'spectrogram-peak', input: T44, pick: (o) => o.spectrogram.peak_bin, expect: [6, 8] }
  ])
]);
