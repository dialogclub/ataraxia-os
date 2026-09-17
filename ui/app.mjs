// ATMARAKSI OS · оболочка v0.1 «Каркас». Интерфейс строится из реестров; L4 ничего не вычисляет — только движки L1/L3.
import { h, clear, present, fmt } from './components/base.mjs';
import { Badge } from './components/badge.mjs';
import { DynamicIsland } from './components/island.mjs';
import { SegmentControl, Sheet, Composer, Toast, HarnessStatus } from './components/controls.mjs';
import { Radar } from './components/radar.mjs';
import { RingGauge, TrafficScale7 } from './components/gauges.mjs';
import { Spectrogram, Envelope } from './components/spectrogram.mjs';
import { Heatmap24 } from './components/heatmap.mjs';
import { CascadeWaterfall, PhiControl } from './components/cascade.mjs';
import { Czi8Ring } from './components/czi8.mjs';
import { ResultCard } from './components/card.mjs';
import { Scp } from '../core/scp.mjs';
import { EventBus } from '../core/bus.mjs';
import { Param } from '../core/param.mjs';
import { CascadeEngine } from '../core/engines/cascadeEngine.mjs';
import { StimulusGate, StimulusSession } from '../core/engines/stimulusGate.mjs';
import { Chronometry } from '../core/engines/chronometry.mjs';
import { memoryFor } from '../core/engines/memorySearchTool.mjs';
import { ProsodyTool } from '../core/engines/prosodyTool.mjs';
import { LexisTool } from '../core/engines/lexisTool.mjs';
import { PhonoSemTool, SCALE_MAP } from '../core/engines/phonoSemTool.mjs';
import { GroundingClassifier, LEVELS } from '../core/engines/groundingClassifier.mjs';
import { ScaleScorer } from '../core/engines/scaleScorer.mjs';

const VERSION = '0.2.0';
const VERSION_LABEL = 'v0.2 «Инструменты»';
const byId = (id) => document.getElementById(id);

// Данные: в single-file сборке лежат в window.__ATM_DATA, иначе грузятся по относительному пути.
class Data {
  static async load(path) {
    const inline = globalThis.__ATM_DATA;
    if (inline !== undefined && inline[path] !== undefined) return inline[path];
    const res = await fetch(`../${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`не загружен ${path}: ${res.status}`);
    return res.json();
  }
}

class I18n {
  constructor(dicts, locale) {
    this.dicts = dicts;
    this.state = { locale: dicts[locale] === undefined ? 'ru' : locale };
    Object.freeze(this);
  }

  t(key) {
    const d = this.dicts[this.state.locale];
    if (d !== undefined && d[key] !== undefined) return d[key];
    return this.dicts.ru[key] === undefined ? key : this.dicts.ru[key];
  }

  use(locale) {
    if (this.dicts[locale] !== undefined) this.state.locale = locale;
    document.documentElement.lang = this.state.locale;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = this.t(el.dataset.i18nPlaceholder); });
  }
}

// Демо-транскрипт: синтетический, составлен для демонстрации конвейера. Не данные клиента.
const DEMO_TRANSCRIPT = [
  '[10:02] Т.: С чего начнём сегодня?',
  '[10:02] К.: Не знаю. Я просто устал. Ничего не хочу, даже утром вставать.',
  '[10:03] Т.: Когда это началось?',
  '[10:03] К.: Наверное, месяца три назад. На работе всё сыпется, а я делаю вид, что держу.',
  '[10:05] Т.: Вы сказали «делаю вид». Перед кем?',
  '[10:05] К.: Перед всеми. Перед женой особенно. Она думает, что я справляюсь.',
  '[10:07] Т.: А что было бы, если бы она узнала?',
  '[10:07] К.: Давайте лучше про работу поговорим, там хотя бы понятно, что делать.',
  '[10:09] Т.: Хорошо. Что понятно про работу?',
  '[10:09] К.: Что надо уйти. Но я должен тянуть, у нас кредит и мама болеет.',
  '[10:12] Т.: «Должен» — чьё это слово?',
  '[10:12] К.: Отца. Он всегда так говорил. Я и не заметил, как стал им.'
].join('\n');

async function sha256(text) {
  if (globalThis.crypto !== undefined && crypto.subtle !== undefined) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Резерв без Web Crypto: FNV-1a (не криптографический, помечается префиксом).
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `fnv1a-${hash.toString(16)}`;
}

// L0: разбор транскрипта «Спикер: реплика» — спикеры, реплики, псевдо-таймкод по номеру строки.
class Transcript {
  constructor(text) {
    const lines = String(text === undefined ? '' : text).split('\n').map((l) => l.trim()).filter((l) => l !== '');
    // Формат строки: «[HH:MM] Спикер: реплика» либо «HH:MM:SS Спикер: реплика» либо «Спикер: реплика».
    this.lines = Object.freeze(lines.map((l, i) => {
      const tm = l.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/);
      const body = tm ? tm[2] : l;
      const m = body.match(/^([^:]{1,24}):\s*(.+)$/);
      return Object.freeze({ n: i + 1, t: tm ? `[${tm[1]}]` : `#${i + 1}`, speaker: m ? m[1].trim() : '?', text: m ? m[2].trim() : body });
    }));
    Object.freeze(this);
  }

  speakers() {
    const counts = {};
    this.lines.forEach((l) => { counts[l.speaker] = (counts[l.speaker] === undefined ? 0 : counts[l.speaker]) + 1; });
    return counts;
  }

  textOf(speaker) {
    return this.lines.filter((l) => speaker === undefined || l.speaker === speaker).map((l) => l.text).join(' ');
  }

  statementsOf(speaker) {
    return this.lines.filter((l) => speaker === undefined || l.speaker === speaker).map((l) => l.text);
  }

  lexisLines() {
    return this.lines.map((l) => ({ speaker: l.speaker, text: l.text, t: l.t }));
  }

  empty() {
    return this.lines.length === 0;
  }
}

// Конвейер: L0 → L1 (детерминированно) → L2 (⛔ в Спринте 0) → L3 (детерминированный отчёт 🟢/⛔).
class Pipeline {
  constructor(app) {
    this.app = app;
    this.state = { cancelled: false, running: false, results: new Map() };
    Object.freeze(this);
  }

  cancel() {
    this.state.cancelled = true;
  }

  async tick() {
    await new Promise((r) => requestAnimationFrame(() => r()));
  }

  steps(input) {
    const app = this.app;
    const list = [
      { id: 'intake', layer: 'L0', label: 'Intake', run: async () => {
        const tr = new Transcript(input.transcript);
        if (tr.empty()) throw new Error('Транскрипт пуст: вставьте текст или нажмите «Демо-транскрипт»');
        const hash = await sha256(input.transcript);
        const speakers = tr.speakers();
        app.state.transcript = tr;
        app.state.scp = app.state.scp.with('meta.input_hash', hash, 'tool:intake').with('inputs', [{ kind: 'transcript', hash, ref: 'launch' }], 'tool:intake')
          .with('subject.alias', input.focus, 'tool:intake').with('meta.mode', input.mode, 'tool:intake').with('meta.model', input.model, 'tool:intake');
        return { badge: '🟢', title: 'L0 · Intake', source: 'intake v1.0', verdict: `${tr.lines.length} реплик · спикеры: ${Object.keys(speakers).join(', ')}`,
          params: Object.keys(speakers).map((s) => ({ label: `реплик ${s}`, param: Param.measured(speakers[s], 'n', [0, 9999], 'intake', '1.0', '').json(), kind: 'count' })),
          json: { hash, speakers, lines: tr.lines.length } };
      } },
      { id: 'cascade', layer: 'L1', label: 'cascadeEngine', run: async () => {
        const out = new CascadeEngine(input.form).run(input.cascade);
        app.state.scp = app.state.scp.with('cascade', { A: out.contributions.A, D: out.contributions.D, C: out.contributions.C, phi: out.contributions.phi, B: out.B, form: out.form, formula_version: out.formula_version }, 'tool:cascadeEngine');
        if (out.status === 'ok') app.state.scp = app.state.scp.withEvidence({ claim_id: 'cascade.B', type: 'measure', ref: { tool: 'cascadeEngine', path: 'cascade.B' }, badge: '🟢' }, 'tool:cascadeEngine');
        return { badge: out.status === 'ok' ? '🟢' : '⛔', title: 'L1 · Каскад АВС', source: `cascadeEngine v${out.formula_version}`, verdict: out.status === 'ok' ? `B = ${fmt(out.B)} при Φ = ${fmt(out.contributions.phi)} (${out.form === 'cbrt' ? 'форма ∛' : 'каноническая форма'})` : `⛔ ${out.reason}`,
          viz: (el) => { const w = new CascadeWaterfall(); w.render(el); w.update(out); }, next: { label: app.i18n.t('next.profile'), onClick: () => app.go('profile', 'cascade') }, json: out, limit: out.status === 'ok' ? '' : out.reason };
      } },
      { id: 'chronometry', layer: 'L1', label: 'chronometry', run: async () => {
        const out = new Chronometry().run({ game_minutes: input.game_minutes });
        app.state.scp = app.state.scp.with('frames.cashflow.chronometry', out, 'tool:chronometry');
        return { badge: out.status === 'ok' ? '🟢' : '⛔', title: 'L1 · Хронометраж Башкина', source: `chronometry v${out.version}`, verdict: out.status === 'ok' ? `${input.game_minutes} мин игры ≈ ${fmt(out.years, 'freq')} лет биографии` : `⛔ ${out.reason}`,
          params: [{ label: 'дней', param: out.days, kind: 'duration' }, { label: 'лет', param: out.years, kind: 'duration' }], json: out, limit: input.mode === 'game' ? '' : 'режим не «Игра» — хронометраж справочный' };
      } },
      { id: 'memory', layer: 'L1', label: 'memorySearchTool', run: async () => {
        const tr = app.state.transcript;
        const query = tr === undefined ? '' : tr.textOf(input.focus) || tr.textOf();
        const out = app.memory.search(query, 3);
        app.state.scp = app.state.scp.with('memory.similar', out.hits, 'tool:memorySearchTool');
        return { badge: out.hits.length ? '🟢' : '⛔', title: 'L1 · Память кейсов', source: `memorySearchTool v${out.version} · ${out.mode}`, verdict: out.hits.length ? `Ближайший кейс ${out.hits[0].id} · ${out.hits[0].archetype} · score ${fmt(out.hits[0].score)}` : (out.reason || app.i18n.t('memory.none')),
          params: out.hits.map((hit) => ({ label: `${hit.id} · ${hit.archetype} · ${hit.outcome}`, param: hit.score, kind: 'index' })), next: { label: app.i18n.t('memory.title'), onClick: () => app.go('memory') }, json: out, limit: `индекс ${out.total} синтетических демо-кейсов; боевой архив — ◇ MCP-SWAP` };
      } },
      { id: 'prosody', layer: 'L1', label: 'prosodyTool', run: async () => {
        const audio = app.state.audio;
        if (audio === undefined) {
          return { badge: '⛔', title: 'L1 · ХРОНОС · просодика', source: 'prosodyTool v1.0', verdict: 'Канал недоступен: нет аудио', params: ['prosody.f0', 'prosody.pause_share', 'prosody.hnr'].map((id) => { const p = app.registry.parameters.find((x) => x.id === id); return { label: p.label_ru, param: Param.missing(p.unit, p.range, 'prosodyTool', '1.0', 'нет аудио').json(), kind: p.type }; }), limit: `${app.i18n.t('limit.noaudio')} — полный пайплайн измерил бы F0, паузы, темп, F1–F4, HNR, джиттер, шиммер`, next: { label: app.i18n.t('nav.speech'), onClick: () => app.go('speech') } };
        }
        const out = app.prosody.run({ pcm: audio.pcm, sr: audio.sr });
        app.state.prosody = out;
        app.state.scp = app.state.scp.with('signals.prosody', { f0: out.f0.mean, f0_sd: out.f0.sd, rms: out.rms.mean, pause_share: out.pause_share, onset_rate: out.onset_rate, hnr: out.hnr, jitter: out.jitter, shimmer: out.shimmer, f1: out.formants.f1, f2: out.formants.f2, f3: out.formants.f3, f4: out.formants.f4, centroid: out.centroid, tilt: out.tilt, proxies: out.proxies }, 'tool:prosodyTool');
        if (present(out.f0.mean)) app.state.scp = app.state.scp.withEvidence({ claim_id: 'prosody.f0', type: 'measure', ref: { tool: 'prosodyTool', path: 'signals.prosody.f0', unit: 'Hz' }, badge: '🟢' }, 'tool:prosodyTool');
        return { badge: present(out.f0.mean) ? '🟢' : '⛔', title: 'L1 · ХРОНОС · просодика', source: `prosodyTool v${out.version} · ${audio.name}`, verdict: present(out.f0.mean) ? `F0 ${fmt(out.f0.mean, 'freq')} Гц ± ${fmt(out.f0.sd, 'freq')} · паузы ${fmt(out.pause_share, 'percent')} % · HNR ${fmt(out.hnr, 'freq')} дБ` : 'Вокализованных кадров нет',
          params: [{ label: 'Темп онсетов', param: out.onset_rate, kind: 'index' }, { label: 'Джиттер', param: out.jitter, kind: 'index' }, { label: 'Шиммер', param: out.shimmer, kind: 'index' }, { label: 'F1', param: out.formants.f1, kind: 'freq' }, { label: 'F2', param: out.formants.f2, kind: 'freq' }],
          next: { label: app.i18n.t('nav.speech'), onClick: () => app.go('speech') }, json: { ...out, spectrogram: { ...out.spectrogram, data: `[${out.spectrogram.frames}×${out.spectrogram.bins}]` }, f0: { ...out.f0, track: `[${out.f0.track.length}]` }, rms: { ...out.rms, track: `[${out.rms.track.length}]` } }, limit: 'акустические прокси — не диагноз и не верификация личности' };
      } },
      { id: 'lexis', layer: 'L1', label: 'lexisTool', run: async () => {
        const tr = app.state.transcript;
        const out = app.lexis.run({ lines: tr.lexisLines(), focus: input.focus });
        app.state.lexis = out;
        app.state.scp = app.state.scp.with('lexis', { pronouns: out.pronouns, modality: out.modality, zimbardo: out.zimbardo, balance: out.balance, heatmap: out.heatmap }, 'tool:lexisTool');
        if (out.status === 'ok') app.state.scp = app.state.scp.withEvidence({ claim_id: 'lexis.pronouns', type: 'measure', ref: { tool: 'lexisTool', path: 'lexis.pronouns' }, badge: '🟢' }, 'tool:lexisTool');
        return { badge: out.status === 'ok' ? '🟢' : '⛔', title: 'L1 · ЛЕКСИС', source: `lexisTool v${out.version} · фокус ${out.focus || 'все'}`, verdict: out.status === 'ok' ? `«я» ${fmt(out.pronouns.i, 'percent')} % · «мы» ${fmt(out.pronouns.we, 'percent')} % · долженствование ${fmt(out.modality.must, 'percent')} ‰ · доля речи ${out.balance[input.focus] ? fmt(out.balance[input.focus].share, 'percent') : '—'} %` : out.reason,
          params: [{ label: 'Возможность', param: out.modality.can, kind: 'percent' }, { label: 'Доля долженствования', param: out.modality.ratio, kind: 'index' }, { label: 'Zimbardo: будущее 🔵', param: out.zimbardo.future, kind: 'index' }, { label: 'Zimbardo: прошлое− 🔵', param: out.zimbardo.past_negative, kind: 'index' }],
          next: { label: app.i18n.t('nav.speech'), onClick: () => app.go('speech') }, json: out, limit: out.heatmap.badge === '⛔' ? `⛔ ${out.heatmap.reason}` : '' };
      } },
      { id: 'vaal', layer: 'L1', label: 'phonoSemTool', run: async () => {
        const tr = app.state.transcript;
        const out = app.phono.run({ text: tr.textOf(input.focus) || tr.textOf() });
        app.state.vaal = out;
        app.state.scp = app.state.scp.with('lexis.vaal', { scales: out.scales.map((x) => ({ id: x.id, left: x.left, right: x.right, value: x.value, significant: x.significant })), significant: out.significant, blocks: out.blocks, polarity: out.polarity, plutchik: out.plutchik, belyanin: out.belyanin, ttr: out.ttr, hapax: out.hapax, lang: out.lang }, 'tool:phonoSemTool');
        return { badge: out.status === 'ok' ? '🔵' : '⛔', title: 'L1 · VAAL-lite · фоносемантика', source: `phonoSemTool v${out.version} · ${out.lang} · ${out.words} слов`, verdict: out.status === 'ok' ? `Полярность ${fmt(out.polarity, 'score')} · значимые: ${out.significant.slice(0, 5).join(', ') || 'нет'}` : out.reason,
          params: [{ label: 'TTR', param: out.ttr, kind: 'index' }, { label: 'Hapax', param: out.hapax, kind: 'index' }], next: { label: app.i18n.t('nav.speech'), onClick: () => app.go('speech') }, json: out, limit: 'таблица PHON — методологическая реконструкция; точная таблица Журавлёва подставляется без изменения логики' };
      } },
      { id: 'grounding', layer: 'L1', label: 'groundingClassifier', run: async () => {
        const tr = app.state.transcript;
        const out = app.grounding.run({ statements: tr.statementsOf(input.focus).length ? tr.statementsOf(input.focus) : tr.statementsOf() });
        app.state.grounding = out;
        app.state.scp = app.state.scp.with('czi8', { levels: out.levels, gap: out.gap, liberty_mode: out.liberty_mode, badge: out.badge, classified: out.classified, n: out.n }, 'tool:groundingClassifier');
        return { badge: out.status === 'ok' && out.classified > 0 ? '🔵' : '⛔', title: 'L1 · ЦЗИ-8 · контуры K1–K8', source: `groundingClassifier v${out.version} · ${out.classified}/${out.n} высказываний`, verdict: out.classified > 0 ? `Разрыв: ${out.gap ? `${out.gap} · ${out.gap_label}` : 'нет'} · модус свободы воли: ${out.liberty_mode ? `${out.liberty_mode} — ${out.liberty_label}` : '—'}` : 'Маркеров контуров нет',
          viz: (el) => { const r = new Czi8Ring(200); r.render(el); r.update(out); }, next: { label: 'ЦЗИ-8 в профиле', onClick: () => app.go('profile', 'czi8') }, json: out, limit: out.note };
      } },
      { id: 'scales', layer: 'L1', label: 'scaleScorer', run: async () => {
        const filled = Object.keys(app.state.scales);
        if (filled.length === 0) return { badge: '⛔', title: 'L1 · Шкалы', source: 'scaleScorer v1.0', verdict: 'Опросники не заполнены', limit: 'заполните PHQ-9/GAD-7 в «Тестах» или импортируйте ответы', next: { label: app.i18n.t('nav.tests'), onClick: () => app.go('tests') } };
        const results = filled.map((id) => app.state.scales[id]);
        app.state.scp = app.state.scp.with('clinic.scales', Object.fromEntries(results.map((r) => [r.scale, { total: r.total, band: r.band, subscales: r.subscales, flags: r.flags, grade: r.grade }])), 'tool:scaleScorer');
        results.forEach((r) => { app.state.scp = app.state.scp.withEvidence({ claim_id: `clinic.${r.scale}`, type: 'scale', ref: { tool: 'scaleScorer', scale: r.scale, band: r.band }, badge: '🟢' }, 'tool:scaleScorer'); });
        const flags = results.flatMap((r) => r.flags);
        if (flags.length) app.state.scp = app.state.scp.with('clinic.crisis', { pathway: 'stanley-brown', shown: true, flags }, 'system:Safety');
        return { badge: '🟢', title: 'L1 · Шкалы', source: `scaleScorer v1.0 · ${results.map((r) => r.label).join(', ')}`, verdict: results.map((r) => `${r.label} ${fmt(r.total, 'score')} (${r.band || 'без нормы'})`).join(' · '), params: results.map((r) => ({ label: r.label, param: r.total, kind: 'score' })), next: { label: app.i18n.t('nav.tests'), onClick: () => app.go('tests') }, json: results, limit: flags.length ? `‼ ${flags.join('; ')}` : '' };
      } }
    ];
    input.agents.forEach((id) => {
      const card = app.registry.agents.find((a) => a.id === id);
      list.push({ id: `agent-${id}`, layer: 'L2', label: id, run: async () => ({ badge: '⛔', title: `L2 · ${id}`, source: `${card.label_ru} · ${card.status}`, verdict: 'Агент не вызван: Claude API не подключён', limit: app.i18n.t('limit.nollm'), json: { reads: card.reads, writes: card.writes, tools_required: card.tools_required } }) });
    });
    list.push({ id: 'synthesis', layer: 'L3', label: 'Synthesis', run: async () => {
      const scp = app.state.scp.data;
      const measured = scp.evidence.filter((e) => e.badge === '🟢').map((e) => e.claim_id);
      const verdicts = measured.map((id) => ({ claim_id: id, badge: '🟢', text: `${id} измерен детерминированно` }));
      app.state.scp = app.state.scp.with('synthesis', { verdicts, axes: [], plan: [], risks: [] }, 'engine:synthesis');
      return { badge: measured.length ? '🟢' : '⛔', hero: true, title: 'L3 · Детерминированный отчёт', source: 'без Reflector · Спринт 0', verdict: measured.length ? `Измерено ${measured.length}: ${measured.join(', ')}. Интерпретации нет — агенты L2 недоступны.` : 'Нет измерений', next: { label: app.i18n.t('synthesis.title'), onClick: () => app.go('synthesis') }, limit: app.i18n.t('limit.nollm') };
    } });
    return list;
  }

  async run(input) {
    const app = this.app;
    this.state.cancelled = false;
    this.state.running = true;
    this.state.results.clear();
    app.state.scp = Scp.fresh({ mode: input.mode, model: input.model, created: new Date().toISOString(), input_hash: '', alias: input.focus });
    app.bus.emit('run.start', { mode: input.mode, agents: input.agents.length });
    const steps = this.steps(input);
    app.state.steps = steps;
    app.setState('analysis', 'loading');
    let done = 0;
    try {
      for (const step of steps) {
        if (this.state.cancelled) { app.bus.emit('run.cancel', {}); app.island.update({ phase: 'idle', text: app.i18n.t('analysis.cancelled') }); app.setState('analysis', 'partial', app.i18n.t('analysis.cancelled')); return; }
        app.island.update({ phase: 'running', layer: step.layer, agent: step.label, percent: (done / steps.length) * 100, model: input.model === '' ? app.i18n.t('toast.nomodel') : input.model });
        await this.tick();
        await this.runStep(step);
        done += 1;
        app.renderFeed();
      }
      const missing = Array.from(this.state.results.values()).filter((r) => r.badge === '⛔').length;
      app.island.update({ phase: 'done', text: `${app.i18n.t('toast.done')} · ${input.agents.length} ${app.i18n.t('toast.agents')} ⛔ · ${app.i18n.t('toast.nomodel')}` });
      app.toast.show(`${app.i18n.t('toast.done')} · 0/${input.agents.length} ${app.i18n.t('toast.agents')} · ${app.i18n.t('toast.nomodel')}`);
      app.setState('analysis', missing ? 'partial' : 'content', `${app.i18n.t('analysis.partial')} · ⛔ ${missing}`);
      app.bus.emit('run.done', { steps: steps.length, missing });
      app.renderSynthesis();
      app.go('synthesis');
    } catch (e) {
      app.island.update({ phase: 'error', text: e.message });
      app.setState('analysis', 'error', e.message);
      app.bus.emit('run.error', { message: e.message });
    } finally {
      // Глобальный finally: кнопка запуска всегда разблокируется.
      this.state.running = false;
      byId('launch-run').disabled = false;
      app.renderHome();
      app.renderInspector();
    }
  }

  async runStep(step) {
    const t0 = performance.now();
    try {
      const out = await step.run();
      this.state.results.set(step.id, { ...out, id: step.id, layer: step.layer, ms: Math.round(performance.now() - t0) });
      this.app.bus.emit('step.done', { id: step.id, layer: step.layer, badge: out.badge, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      // Ошибка одного шага не прячет остальные результаты.
      this.state.results.set(step.id, { id: step.id, layer: step.layer, badge: '⛔', title: `${step.layer} · ${step.label}`, source: 'ошибка', verdict: e.message, limit: 'шаг завершился ошибкой; остальные результаты сохранены', ms: Math.round(performance.now() - t0) });
      this.app.bus.emit('step.error', { id: step.id, message: e.message });
      if (step.id === 'intake') throw e;
    }
  }

  async retry(id) {
    const step = this.app.state.steps.find((s) => s.id === id);
    if (step === undefined) return;
    this.app.island.update({ phase: 'running', layer: step.layer, agent: step.label, percent: 50 });
    await this.tick();
    await this.runStep(step);
    this.app.island.update({ phase: 'done', text: `${step.label} · повторено` });
    this.app.renderFeed();
    this.app.renderInspector();
  }
}

class App {
  constructor(registry, dicts, report, corpus) {
    this.registry = registry;
    this.report = report;
    this.i18n = new I18n(dicts, 'ru');
    this.bus = new EventBus();
    this.memory = memoryFor(corpus.cases); // ◇ MCP-SWAP: memoryFor(corpus.cases, mcpClient)
    this.prosody = new ProsodyTool({ maxSeconds: 90 });
    this.lexis = new LexisTool();
    this.phono = new PhonoSemTool();
    this.grounding = new GroundingClassifier();
    this.scorer = new ScaleScorer();
    this.pipeline = new Pipeline(this);
    this.toast = new Toast(byId('toast-host'));
    this.sheet = new Sheet('ATMARAKSI OS');
    this.island = new DynamicIsland(() => this.pipeline.cancel(), () => this.commandPalette());
    this.state = { page: 'home', sub: '', scp: Scp.fresh({ mode: 'session', model: '', created: new Date().toISOString(), input_hash: '', alias: 'К.' }), steps: [], transcript: undefined, agents: new Set(), agentTasks: {}, clinicLocked: false, profileTab: 'overview', memoryMode: 'LOCAL', audio: undefined, prosody: undefined, lexis: undefined, vaal: undefined, grounding: undefined, scales: {}, testsTab: 'phq9' };
    Object.freeze(this);
  }

  harnessOf(fn) {
    const r = this.report.functions.find((f) => f.fn === fn);
    return r === undefined ? 'hidden_by_harness' : r.status;
  }

  // Состояния экрана: пусто / загрузка / ошибка / частично / контент.
  setState(page, state, message) {
    const root = byId(`page-${page}`);
    if (root === null) return;
    root.querySelectorAll('[data-state]').forEach((el) => {
      const on = el.dataset.state === state;
      el.hidden = !on;
      const msg = el.querySelector('.msg');
      if (on && msg !== null && message !== undefined) msg.textContent = message;
    });
  }

  go(page, sub) {
    const id = byId(`page-${page}`) === null ? 'stub' : page;
    document.querySelectorAll('.page').forEach((p) => { p.dataset.active = String(p.id === `page-${id}`); });
    this.state.page = page;
    this.state.sub = sub === undefined ? '' : sub;
    if (id === 'stub') this.renderStub(page);
    if (page === 'profile') { if (sub) this.state.profileTab = sub; this.renderProfile(); }
    if (page === 'agents') this.renderAgents();
    if (page === 'memory') this.renderMemory();
    if (page === 'home') this.renderHome();
    if (page === 'body') this.setState('body', 'empty', 'Health Score, PPG, меридианы, риски, биопаспорт — Спринт 4. Каналов нет.');
    if (page === 'practice') this.renderGate();
    if (page === 'synthesis') this.renderSynthesis();
    if (page === 'speech') this.renderSpeech();
    if (page === 'tests') this.renderTests();
    this.renderNav();
    this.renderInspector();
    window.scrollTo(0, 0);
    this.bus.emit('nav', { page, sub });
  }

  // --- Навигация: таб-бар (телефон) и сайдбар (студия) ---
  renderNav() {
    const tabs = [['home', 'tab.home', 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'], ['analysis', 'tab.analysis', 'M4 19h16M6 15l4-5 4 3 4-6'], ['profile', 'tab.profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0'], ['body', 'tab.body', 'M12 3v18M5 8h14M7 16h10'], ['more', 'tab.more', 'M5 12h.01M12 12h.01M19 12h.01']];
    const bar = byId('tabbar');
    clear(bar);
    const groupOf = { home: 'home', launch: 'analysis', analysis: 'analysis', synthesis: 'analysis', profile: 'profile', body: 'body' };
    const current = groupOf[this.state.page] === undefined ? 'more' : groupOf[this.state.page];
    tabs.forEach(([page, key, d]) => {
      const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgIcon.setAttribute('viewBox', '0 0 24 24'); svgIcon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svgIcon.append(path);
      bar.append(h('button', { type: 'button', 'aria-current': current === page ? 'page' : null, onClick: () => this.go(page) }, svgIcon, h('span', { text: this.i18n.t(key) })));
    });
    const side = byId('sidebar');
    clear(side);
    side.append(h('div', { class: 'module-head' }, h('strong', { text: 'ATMARAKSI OS' }), h('span', { class: 'chip blue', text: VERSION_LABEL })));
    const groups = [
      ['Домены', [['home', 'nav.home'], ['launch', 'nav.launch'], ['analysis', 'nav.analysis'], ['synthesis', 'nav.synthesis']]],
      [this.i18n.t('domain.core'), [['profile', 'nav.profile'], ['mind', 'nav.mind'], ['speech', 'nav.speech'], ['tests', 'nav.tests']]],
      [this.i18n.t('domain.body'), [['body', 'nav.body']]],
      [this.i18n.t('domain.practice'), [['practice', 'nav.practice']]],
      ['Клиника', [['clinic', 'nav.clinic']]],
      [this.i18n.t('domain.narrative'), [['narrative', 'nav.narrative']]],
      ['Система', [['memory', 'nav.memory'], ['agents', 'nav.agents'], ['settings', 'nav.settings']]]
    ];
    groups.forEach(([title, items]) => {
      const g = h('div', { class: 'side-group' }, h('h4', { text: title }));
      items.forEach(([page, key]) => g.append(h('button', { type: 'button', 'aria-current': this.state.page === page ? 'page' : null, onClick: () => this.go(page) }, h('span', { text: this.i18n.t(key) }), page === 'agents' ? h('span', { class: 'cap2', text: `${this.report.green}/${this.report.green + this.report.red}` }) : null)));
      side.append(g);
    });
    const cases = h('div', { class: 'side-group' }, h('h4', { text: 'Кейсы' }));
    cases.append(h('button', { type: 'button', onClick: () => this.go('launch') }, h('span', { text: this.state.scp.data.subject.alias }), h('span', { class: 'cap2', text: this.state.scp.data.meta.input_hash === '' ? this.i18n.t('home.never') : this.state.scp.data.meta.input_hash.slice(0, 8) })));
    side.append(cases);
  }

  // --- Инспектор (студия): параметры из реестра, доказательства, JSON, харнесс, журнал ---
  renderInspector() {
    const insp = byId('inspector');
    clear(insp);
    const scp = this.state.scp.data;
    const params = h('div', { class: 'section' }, h('h3', { text: 'Параметры' }));
    const list = h('div', { class: 'card quiet' });
    ['cascade.A', 'cascade.D', 'cascade.C', 'cascade.phi', 'cascade.B'].forEach((id) => {
      const reg = this.registry.parameters.find((p) => p.id === id);
      const p = this.state.scp.at(id);
      list.append(h('div', { class: 'row' }, h('span', { text: reg.label_ru }), h('span', { class: 'value', text: fmt(p, reg.type) }, h('span', { class: 'unit', text: present(p) ? p.unit : '' }))));
    });
    params.append(list);
    const evidence = h('div', { class: 'section' }, h('h3', { text: 'Доказательства' }), h('div', { class: 'card quiet' }, scp.evidence.length ? scp.evidence.map((e) => h('div', { class: 'row' }, h('span', { text: e.claim_id }), h('span', { class: 'cap2', text: `${e.type} · ${e.badge}` }))) : h('span', { class: 'caption', text: 'якорей пока нет' })));
    const json = h('div', { class: 'section' }, h('h3', { text: 'JSON' }), h('details', { class: 'json' }, h('summary', { text: 'SCP' }), h('pre', { text: this.state.scp.text().slice(0, 6000) })));
    const harness = h('div', { class: 'section' }, h('h3', { text: 'Харнесс' }), h('div', { class: 'hstack' }, this.report.functions.map((f) => h('span', { class: `chip ${f.status === 'green' ? 'green' : 'red'}`, text: `${f.fn}` }))));
    const log = h('div', { class: 'section' }, h('h3', { text: 'Лог' }), h('div', { class: 'card quiet' }, this.bus.history().slice(-8).reverse().map((r) => h('div', { class: 'row' }, h('span', { class: 'mono', text: r.topic }), h('span', { class: 'cap2', text: r.at.slice(11, 19) })))));
    insp.append(params, evidence, json, harness, log);
  }

  // --- Домой: 6 доменов как плитки с кольцами заполненности SCP ---
  renderHome() {
    const scp = this.state.scp.data;
    const filled = (keys) => keys.filter((k) => { const v = this.state.scp.at(k); return v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0); }).length / keys.length;
    const domains = [
      ['core', 'domain.core', ['request.explicit', 'cascade', 'czi8', 'drives', 'frames.persona6'], 'profile'],
      ['body', 'domain.body', ['body.lowen', 'body.reich', 'body.risk', 'signals.ppg', 'body.biopassport'], 'body'],
      ['practice', 'domain.practice', ['practice.breath', 'practice.stimulus', 'frames.abhidharma'], 'practice'],
      ['love', 'domain.love', ['frames.berne', 'frames.gottman', 'frames.vaillant', 'frames.panksepp'], 'profile'],
      ['social', 'domain.social', ['narrative.intraktom', 'frames.cashflow', 'frames.gallup34', 'memory.similar'], 'memory'],
      ['narrative', 'domain.narrative', ['narrative.archetypes', 'narrative.hero_path', 'narrative.optika'], 'narrative']
    ];
    const tiles = byId('home-tiles');
    clear(tiles);
    domains.forEach(([id, key, keys, page]) => {
      const share = filled(keys);
      const tile = h('button', { type: 'button', class: 'tile', onClick: () => this.go(page) });
      const ring = h('div', { class: 'ring' });
      const g = new RingGauge(44, [[0, 100, '#0A84FF']]);
      g.render(ring);
      g.update(Param.measured(Math.round(share * 100), '%', [0, 100], 'scp', '1.0', '').json());
      ring.querySelectorAll('text').forEach((t) => t.remove());
      tile.append(h('div', { class: 'card-head' }, h('span', { class: 'name', text: this.i18n.t(key) }), ring), h('span', { class: 'caption', text: `${this.i18n.t('home.fill')} ${Math.round(share * 100)} %` }), h('span', { class: 'cap2', text: `${this.i18n.t('home.last')}: ${scp.meta.input_hash === '' ? this.i18n.t('home.never') : scp.meta.created.slice(0, 16).replace('T', ' ')}` }));
      tiles.append(tile);
    });
    const cont = byId('home-continue');
    clear(cont);
    cont.append(h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: `${scp.subject.alias} · ${this.i18n.t(`mode.${scp.meta.mode}`)}` }), new Badge(scp.meta.input_hash === '' ? '⛔' : '🟢').render(h('span'))), h('span', { class: 'caption', text: scp.meta.input_hash === '' ? this.i18n.t('analysis.empty') : `hash ${scp.meta.input_hash.slice(0, 12)} · ${scp.audit.length} записей аудита` }), h('div', { class: 'card-actions' }, h('button', { type: 'button', class: 'btn secondary small', text: this.i18n.t('nav.launch'), onClick: () => this.go('launch') }), scp.meta.input_hash === '' ? null : h('button', { type: 'button', class: 'btn quiet small', text: this.i18n.t('synthesis.title'), onClick: () => this.go('synthesis') }))));
    const quick = byId('home-quick');
    clear(quick);
    quick.append(
      h('button', { type: 'button', class: 'btn secondary small', text: this.i18n.t('launch.demo'), onClick: () => { this.go('launch'); byId('launch-transcript').value = DEMO_TRANSCRIPT; } }),
      h('button', { type: 'button', class: 'btn secondary small', text: this.i18n.t('memory.title'), onClick: () => this.go('memory') }),
      h('button', { type: 'button', class: 'btn secondary small', text: this.i18n.t('agents.title'), onClick: () => this.go('agents') }),
      h('button', { type: 'button', class: 'btn secondary small', text: 'Галерея компонентов', onClick: () => window.open('gallery.html', '_blank') })
    );
    byId('home-harness-chip').textContent = `харнессы 🟢 ${this.report.green} · 🔴 ${this.report.red}`;
    byId('home-harness-chip').className = `chip ${this.report.red === 0 ? 'green' : 'red'}`;
    this.setState('home', scp.meta.input_hash === '' ? 'empty' : 'content');
  }

  // --- Запуск ---
  renderLaunch() {
    const modeHost = byId('launch-mode');
    clear(modeHost);
    this.state.modeControl = new SegmentControl(['session', 'meeting', 'game', 'full'].map((m) => ({ id: m, label: this.i18n.t(`mode.${m}`) })), 'session', () => {});
    this.state.modeControl.render(modeHost);
    const chips = byId('launch-agents');
    clear(chips);
    const defaults = ['Requestor', 'Veritas', 'Obstacle', 'Insight', 'Libertas', 'Qualitas', 'Grounding', 'CascadeABC', 'Drives', 'Chronotope', 'Berne', 'Archetype', 'Memory'];
    defaults.forEach((id) => this.state.agents.add(id));
    this.registry.agents.filter((a) => a.domain !== 'system' || a.id === 'Memory').forEach((a) => {
      const chip = h('button', { type: 'button', class: 'chip editable', id: `chip-${a.id}`, text: a.id, 'aria-pressed': String(this.state.agents.has(a.id)), title: a.label_ru });
      chip.addEventListener('click', () => { if (this.state.agents.has(a.id)) this.state.agents.delete(a.id); else this.state.agents.add(a.id); chip.setAttribute('aria-pressed', String(this.state.agents.has(a.id))); });
      chips.append(chip);
    });
    const fillModels = (sel) => { clear(sel); sel.append(h('option', { value: '', text: this.i18n.t('toast.nomodel') })); this.registry.models.models.forEach((m) => sel.append(h('option', { value: m.id, text: `${m.label} · ${m.tier}` }))); };
    fillModels(byId('launch-model'));
    fillModels(byId('settings-model'));
    byId('launch-demo').addEventListener('click', () => { byId('launch-transcript').value = DEMO_TRANSCRIPT; this.setState('launch', 'content'); });
    byId('launch-run').addEventListener('click', () => this.launch());
    byId('launch-error-retry').addEventListener('click', () => this.launch());
    byId('analysis-go-launch').addEventListener('click', () => this.go('launch'));
    byId('analysis-retry').addEventListener('click', () => this.launch());
    this.setState('launch', 'content');
  }

  launchInput() {
    const num = (id) => Number(byId(id).value);
    return {
      transcript: byId('launch-transcript').value, focus: byId('launch-focus').value.trim() || 'К.', mode: this.state.modeControl.value(), model: byId('launch-model').value,
      agents: Array.from(this.state.agents), cascade: { A: num('launch-A'), D: num('launch-D'), C: num('launch-C'), phi: num('launch-phi') }, form: byId('launch-form').value, game_minutes: num('launch-minutes')
    };
  }

  async launch() {
    if (this.pipeline.state.running) return;
    const input = this.launchInput();
    if (new Transcript(input.transcript).empty()) { this.setState('launch', 'error', 'Транскрипт пуст. Вставьте текст или нажмите «Демо-транскрипт».'); return; }
    this.setState('launch', 'content');
    byId('launch-run').disabled = true;
    byId('launch-run').textContent = this.i18n.t('launch.started');
    window.setTimeout(() => { byId('launch-run').textContent = this.i18n.t('launch.run'); }, 1500);
    this.go('analysis'); // автопереход на «Анализ» при старте
    await this.pipeline.run(input);
  }

  // --- Анализ: лента карточек по слоям ---
  renderFeed() {
    const feed = byId('analysis-feed');
    clear(feed);
    let layer = '';
    this.state.steps.forEach((step) => {
      const r = this.pipeline.state.results.get(step.id);
      if (step.layer !== layer) { layer = step.layer; feed.append(h('div', { class: 'layer-head', text: layer })); }
      if (r === undefined) { feed.append(h('div', { class: 'skeleton', id: `card-${step.id}` }, h('div', { class: 'bar w60' }), h('div', { class: 'bar w80' }))); return; }
      new ResultCard({ ...r, id: step.id, onRetry: () => this.pipeline.retry(step.id), onJump: (item) => this.jumpTo(item) }).render(feed);
    });
    const meta = byId('analysis-meta');
    clear(meta);
    const scp = this.state.scp.data;
    meta.append(h('span', { class: 'chip grey', text: `${this.i18n.t(`mode.${scp.meta.mode}`)} · ${scp.subject.alias}` }), h('span', { class: 'chip grey', text: scp.meta.input_hash === '' ? 'hash —' : `hash ${scp.meta.input_hash.slice(0, 8)}` }));
  }

  jumpTo(item) {
    const tr = this.state.transcript;
    if (tr === undefined) return;
    const line = tr.lines.find((l) => l.t === item.t);
    this.sheet.open(h('div', { class: 'stack' }, tr.lines.map((l) => h('p', { class: l === line ? 'sub' : 'caption', style: l === line ? 'font-weight:700' : '', text: `${l.t} ${l.speaker}: ${l.text}` }))));
  }

  // --- Синтез ---
  renderSynthesis() {
    const scp = this.state.scp.data;
    const hero = byId('synthesis-hero');
    clear(hero);
    if (scp.meta.input_hash === '') { this.setState('synthesis', 'empty'); ['synthesis-axes', 'synthesis-plan', 'synthesis-risks'].forEach((id) => { clear(byId(id)); byId(id).append(h('span', { class: 'caption', text: '⛔' })); }); return; }
    const r = this.pipeline.state.results.get('synthesis');
    if (r !== undefined) new ResultCard({ ...r, id: 'synthesis-hero', onRetry: () => this.pipeline.retry('synthesis') }).render(hero);
    this.setState('synthesis', 'partial', this.i18n.t('limit.nollm'));
    const fill = (id, items, empty) => { const el = byId(id); clear(el); if (items.length === 0) el.append(h('span', { class: 'caption', text: `⛔ ${empty}` })); items.forEach((it) => el.append(h('div', { class: 'row' }, h('span', { text: it.text }), h('span', { class: 'cap2', text: it.badge })))); };
    fill('synthesis-axes', [], 'оси синтеза строит Reflector (Спринт 2)');
    fill('synthesis-plan', [], 'план строит TheraNavigator (Спринт 2)');
    fill('synthesis-risks', [], 'риски выдаёт Safety (Спринт 2)');
  }

  // --- Профиль (Persona v12): 6 вкладок, живой Φ-слайдер ---
  renderProfile() {
    const tabsHost = byId('profile-tabs');
    clear(tabsHost);
    const tabs = ['overview', 'cascade', 'czi8', 'body', 'mirrors', 'plan'];
    new SegmentControl(tabs.map((t) => ({ id: t, label: this.i18n.t(`profile.${t}`) })), this.state.profileTab, (v) => { this.state.profileTab = v; this.renderProfile(); }).render(tabsHost);
    const content = byId('profile-content');
    clear(content);
    const scp = this.state.scp.data;
    const tab = this.state.profileTab;
    this.setState('profile', 'content');
    if (tab === 'cascade') {
      const cur = scp.cascade;
      const base = present(cur.A) ? { A: cur.A.value, D: cur.D.value, C: cur.C.value } : { A: Number(byId('launch-A').value), D: Number(byId('launch-D').value), C: Number(byId('launch-C').value) };
      const engine = new CascadeEngine(cur.form === undefined ? byId('launch-form').value : cur.form);
      const card = h('div', { class: 'card hero' }, h('div', { class: 'card-head' }, h('h3', { text: 'Каскад АВС · живой Φ' }), new Badge('🟢').render(h('span'))));
      const w = new CascadeWaterfall();
      const phi = new PhiControl(present(cur.phi) ? cur.phi.value : Number(byId('launch-phi').value), (v) => w.update(engine.run({ ...base, phi: v })));
      phi.render(card); w.render(card); w.update(engine.run({ ...base, phi: phi.value() }));
      card.append(h('span', { class: 'caption', text: 'Слайдер пересчитывает движком без LLM; в SCP пишется только результат запуска.' }));
      content.append(card);
      return;
    }
    if (tab === 'czi8') {
      const card = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: 'ЦЗИ-8 · контуры K1–K8' }), new Badge('⛔').render(h('span'))));
      const ring = new Czi8Ring(220); ring.render(card); ring.update(scp.czi8);
      card.querySelector('.badge').replaceWith(new Badge(scp.czi8.badge === undefined ? '⛔' : scp.czi8.badge).render(h('span')));
      if (scp.czi8.gap !== undefined && scp.czi8.classified > 0) card.append(h('div', { class: 'stack' }, LEVELS.map(([k, label]) => h('div', { class: 'row' }, h('span', { text: `${k} · ${label}${scp.czi8.gap === k ? ' · разрыв' : ''}` }), h('span', { class: 'value', text: fmt(scp.czi8.levels[k], 'index') }, h('span', { class: 'unit', text: 'share' })))), h('p', { class: 'sub', text: scp.czi8.liberty_mode ? `Модус свободы воли ${scp.czi8.liberty_mode}: ${{ 'А': 'вернуться к восприятию и чувству', 'Б': 'переосмыслить значение и потребность', 'В': 'решить и действовать', 'Г': 'принять результат и осознать себя' }[scp.czi8.liberty_mode]}` : 'Разрыва нет — все контуры представлены' })));
      card.append(h('div', { class: 'limit' }, h('span', { text: scp.czi8.classified > 0 ? '🔵 имена контуров и модусы — методологическая реконструкция; словари маркеров расширяются' : '⛔ запустите анализ: ЦЗИ-8 считается по высказываниям фокус-участника' })));
      content.append(card);
      return;
    }
    if (tab === 'overview') {
      const card = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: `${scp.subject.alias} · ${this.i18n.t(`mode.${scp.meta.mode}`)}` }), new Badge(scp.meta.input_hash === '' ? '⛔' : '🟢').render(h('span'))));
      const radar = new Radar(240); radar.render(card);
      radar.update(['Theromata', 'Alligantia', 'Phobon', 'Dominix', 'Agonix', 'Φ'].map((d) => ({ label: d, param: d === 'Φ' ? scp.cascade.phi : scp.drives[d] })));
      card.append(h('span', { class: 'caption', text: 'Драйвы Persona v12 — агент Drives (⛔ до Спринта 2); Φ — из каскада.' }));
      content.append(card);
      if (scp.meta.input_hash === '') this.setState('profile', 'empty', this.i18n.t('analysis.empty'));
      return;
    }
    const reasons = { body: 'Лоуэн/Райх сегменты, риск-профиль, 3A — Спринт 4', mirrors: 'Зеркала (Берн/Готтман/Вейлант) — агенты L2, Спринт 2', plan: 'План Тера-навигатора — Спринт 2' };
    this.setState('profile', 'empty', `⛔ ${reasons[tab]}`);
  }

  // --- Практика: панель гейта (живой stimulusGate) и аварийный стоп ---
  renderGate() {
    const gate = new StimulusGate('wellness');
    const decide = () => {
      const out = gate.decide({ flicker_hz: Number(byId('practice-flicker').value), spl_db: Number(byId('practice-spl').value), hour_local: new Date().getHours() });
      const host = byId('practice-decision');
      clear(host);
      host.append(h('div', { class: 'hstack' }, h('span', { class: `chip ${out.allowed ? 'green' : 'red'}`, text: out.allowed ? this.i18n.t('practice.allowed') : this.i18n.t('practice.blocked') }), out.blocks.map((b) => h('span', { class: 'chip red', text: b })), out.warnings.map((w) => h('span', { class: 'chip yellow', text: w }))));
      host.append(h('div', { class: 'row' }, h('span', { text: 'Латентность стопа' }), h('span', { class: 'value', text: this.state.stopLatency === undefined ? '—' : `${this.state.stopLatency.value.toFixed(3)}`, }, h('span', { class: 'unit', text: 'ms' }))));
      this.state.scp = this.state.scp.with('practice.gate', out, 'tool:stimulusGate');
    };
    ['practice-flicker', 'practice-spl'].forEach((id) => { const el = byId(id); el.oninput = decide; });
    byId('practice-stop').onclick = () => { const s = new StimulusSession(() => performance.now()); this.state.stopLatency = s.stop(); byId('practice-session').textContent = `стоп: ${this.state.stopLatency.value.toFixed(3)} мс < 100 мс`; this.bus.emit('stimulus.stop', this.state.stopLatency); decide(); };
    new HarnessStatus(this.harnessOf('stimulusGate')).render(byId('practice-harness'));
    decide();
    this.setState('practice', 'partial', '⛔ 72 паттерна, WebGL2, звук, EMDR — Спринт 5; гейт уже действует');
  }

  // --- Клиника: режим фиксируется при старте; кризисная кнопка всегда ---
  renderClinic() {
    const host = byId('clinic-mode');
    clear(host);
    const ctl = new SegmentControl([{ id: 'cds', label: 'CDS Phase 0' }, { id: 'iia', label: 'Class IIa' }], 'cds', (v) => {
      if (this.state.clinicLocked) { ctl.update(this.state.scp.data.clinic.mode, false); this.setState('clinic', 'error', 'Режим зафиксирован при старте сессии; смена в середине запрещена (аудит-трейл).'); this.bus.emit('clinic.mode_change_denied', { to: v }); }
    });
    ctl.render(host);
    byId('clinic-start').addEventListener('click', () => {
      this.state.clinicLocked = true;
      this.state.scp = this.state.scp.with('clinic.mode', ctl.value(), 'clinician').with('clinic.crisis', { pathway: 'stanley-brown', shown: true }, 'system:Safety');
      byId('clinic-locked').textContent = `режим ${ctl.value()} зафиксирован · ${new Date().toLocaleTimeString()}`;
      byId('clinic-start').disabled = true;
      this.setState('clinic', 'partial', '⛔ Intake, 4 стимула, графология, рисунок, шкалы — Спринт 6');
    });
    byId('clinic-crisis').addEventListener('click', () => {
      this.bus.emit('crisis.open', { pathway: 'stanley-brown' });
      this.sheet.open(h('ol', { class: 'stack' }, ['Признаки-предупреждения: что предшествует кризису', 'Внутренние стратегии совладания', 'Люди и места, отвлекающие от кризиса', 'Люди и службы экстренной помощи; ограничение доступа к средствам'].map((s) => h('li', { class: 'sub', text: s }))));
      this.sheet.nodes.backdrop.querySelector('h2').textContent = this.i18n.t('clinic.crisis_title');
    });
    this.setState('clinic', 'empty', 'Сессия не начата. Кризисный путь доступен всегда.');
  }

  // --- Память ---
  renderMemory() {
    const host = byId('memory-mode');
    clear(host);
    new SegmentControl([{ id: 'LOCAL', label: 'LOCAL' }, { id: 'MCP', label: 'MCP' }], this.state.memoryMode, (v) => { this.state.memoryMode = v; this.renderMemory(); }).render(host);
    const input = byId('memory-query');
    const results = byId('memory-results');
    const search = () => {
      clear(results);
      const q = input.value.trim();
      if (q === '') { this.setState('memory', 'empty'); return; }
      const mem = this.state.memoryMode === 'MCP' ? memoryFor([], {}) : this.memory;
      const out = this.state.memoryMode === 'MCP' ? memoryFor([], undefined).search('', 0) : mem.search(q, 5);
      if (this.state.memoryMode === 'MCP') { this.setState('memory', 'partial', '⛔ MCP-клиент не подключён — точка замены ◇ MCP-SWAP'); return; }
      this.setState('memory', out.hits.length ? 'content' : 'partial', this.i18n.t('memory.none'));
      out.hits.forEach((hit) => results.append(h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: `${hit.id} · ${hit.archetype}` }), new Badge('🟢').render(h('span'))), h('div', { class: 'hstack' }, h('span', { class: `chip ${hit.crisis ? 'red' : 'grey'}`, text: hit.crisis ? 'кризис' : 'без кризиса' }), h('span', { class: 'chip grey', text: hit.age_band }), hit.tags.map((t) => h('span', { class: 'chip blue', text: t }))), h('div', { class: 'row' }, h('span', { text: 'score' }), h('span', { class: 'value', text: fmt(hit.score) }, h('span', { class: 'unit', text: 'cos' }))), h('span', { class: 'sub', text: `исход: ${hit.outcome}` }))));
      this.bus.emit('memory.search', { q, hits: out.hits.length, mode: out.mode });
    };
    input.oninput = search;
    search();
  }

  // --- Агенты: реестр, статус харнесса, редактор задач, лог ---
  renderAgents() {
    const table = byId('agents-table');
    clear(table);
    table.append(h('thead', {}, h('tr', {}, ['Агент', 'Домен', 'Задача', 'Инструменты', 'Харнесс', ''].map((t) => h('th', { text: t })))));
    const body = h('tbody');
    this.registry.agents.forEach((a) => {
      const st = h('td'); new HarnessStatus(a.status).render(st);
      const task = this.state.agentTasks[a.id] === undefined ? a.label_ru : this.state.agentTasks[a.id];
      body.append(h('tr', {}, h('td', {}, h('strong', { text: a.id })), h('td', { text: a.domain }), h('td', { text: task }), h('td', { class: 'caption', text: a.tools_required.join(', ') || '—' }), st, h('td', {}, h('button', { type: 'button', class: 'btn quiet small', text: this.i18n.t('agents.edit'), onClick: () => this.editAgent(a) }))));
    });
    table.append(body);
    const tools = byId('tools-table');
    clear(tools);
    tools.append(h('thead', {}, h('tr', {}, ['Инструмент', 'Слой', 'Вход → выход', 'Харнесс'].map((t) => h('th', { text: t })))));
    const tb = h('tbody');
    this.registry.tools.forEach((t) => { const st = h('td'); new HarnessStatus(this.harnessOf(t.id), t.harness === '' ? 'нет паспорта' : t.harness).render(st); tb.append(h('tr', {}, h('td', {}, h('strong', { text: t.id }), h('div', { class: 'cap2', text: t.label_ru })), h('td', { text: t.layer }), h('td', { class: 'caption', text: t.io }), st)); });
    tools.append(tb);
    const meta = byId('agents-meta');
    clear(meta);
    meta.append(h('span', { class: 'chip grey', text: `${this.registry.agents.length} агентов` }), h('span', { class: 'chip grey', text: `${this.registry.tools.length} инструментов` }), h('span', { class: `chip ${this.report.red === 0 ? 'green' : 'red'}`, text: `харнессы 🟢 ${this.report.green} · 🔴 ${this.report.red}` }));
    const log = byId('agents-log');
    clear(log);
    const hist = this.bus.history();
    if (hist.length === 0) log.append(h('span', { class: 'caption', text: 'журнал пуст — запустите анализ' }));
    hist.slice(-20).reverse().forEach((r) => log.append(h('div', { class: 'row' }, h('span', { class: 'mono', text: `${r.topic} ${JSON.stringify(r.payload).slice(0, 60)}` }), h('span', { class: 'cap2', text: r.at.slice(11, 19) }))));
    this.setState('agents', 'content');
  }

  editAgent(a) {
    const area = h('textarea', { class: 'sub', rows: '5', style: 'width:100%;border:1px solid var(--line-soft);border-radius:10px;padding:10px' });
    area.value = this.state.agentTasks[a.id] === undefined ? a.label_ru : this.state.agentTasks[a.id];
    const save = h('button', { type: 'button', class: 'btn', text: 'Сохранить', onClick: () => { this.state.agentTasks[a.id] = area.value.trim() || a.label_ru; this.bus.emit('agent.edit', { id: a.id }); this.sheet.close(); this.renderAgents(); } });
    this.sheet.open(h('div', { class: 'stack' }, h('p', { class: 'caption', text: `${a.id} · читает ${a.reads.join(', ')} · пишет ${a.writes.join(', ')}` }), area, h('p', { class: 'cap2', text: 'Правило промпта: агент не вычисляет; вызывает инструменты; цитирует с таймкодом и спикером; смещённую речь помечает сильным голосом; нет данных → null и ⛔.' }), save));
  }

  // --- Ещё (телефон) ---
  renderMore() {
    const list = byId('more-list');
    clear(list);
    [['launch', 'nav.launch'], ['synthesis', 'nav.synthesis'], ['practice', 'nav.practice'], ['clinic', 'nav.clinic'], ['memory', 'nav.memory'], ['agents', 'nav.agents'], ['speech', 'nav.speech'], ['tests', 'nav.tests'], ['mind', 'nav.mind'], ['narrative', 'nav.narrative'], ['settings', 'nav.settings']].forEach(([page, key]) => list.append(h('button', { type: 'button', class: 'item', style: 'width:100%;text-align:left', onClick: () => this.go(page) }, h('span', { text: this.i18n.t(key) }), h('span', { class: 'cap2', text: '›' }))));
    this.setState('more', 'content');
  }


  // Вложение: аудио → Web Audio (офлайн-декодер) → моно PCM; текст → транскрипт.
  attach(file) {
    if (/^audio\//.test(file.type) || /\.(wav|mp3|m4a|ogg|flac|webm)$/i.test(file.name)) { this.decodeAudio(file); return; }
    file.text().then((t) => { byId('launch-transcript').value = t; this.go('launch'); this.toast.show(`Вложение ${file.name}`); });
  }

  async decodeAudio(file) {
    this.setState('speech', 'loading');
    this.island.update({ phase: 'running', layer: 'L0', agent: 'decodeAudio', percent: 10 });
    try {
      const buf = await file.arrayBuffer();
      const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
      if (Ctx === undefined) throw new Error('Web Audio недоступен в этом браузере');
      const ctx = new Ctx(1, 44100, 44100);
      const decoded = await ctx.decodeAudioData(buf);
      const n = decoded.length; const mono = new Float32Array(n);
      for (let c = 0; c < decoded.numberOfChannels; c += 1) { const ch = decoded.getChannelData(c); for (let i = 0; i < n; i += 1) mono[i] += ch[i] / decoded.numberOfChannels; }
      this.loadPcm(mono, decoded.sampleRate, file.name);
    } catch (e) {
      this.island.update({ phase: 'error', text: `аудио: ${e.message}` });
      this.setState('speech', 'error', `Не удалось декодировать аудио: ${e.message}. Поддерживаются WAV/MP3/M4A/OGG.`);
    }
  }

  // PCM в состояние; просодика считается сразу (детерминированно, без LLM).
  loadPcm(pcm, sr, name) {
    this.state.audio = { pcm, sr, name };
    this.island.update({ phase: 'running', layer: 'L1', agent: 'prosodyTool', percent: 50 });
    const out = this.prosody.run({ pcm, sr });
    this.state.prosody = out;
    this.state.scp = this.state.scp.with('inputs', this.state.scp.data.inputs.filter((i) => i.kind !== 'audio').concat([{ kind: 'audio', hash: `${name}:${pcm.length}@${sr}`, ref: name }]), 'tool:intake');
    this.bus.emit('audio.loaded', { name, sr, seconds: Number((pcm.length / sr).toFixed(2)) });
    this.island.update({ phase: 'done', text: `${name} · ${(pcm.length / sr).toFixed(1)} с · F0 ${fmt(out.f0.mean, 'freq')} Гц` });
    if (this.state.page === 'speech') this.renderSpeech(); else this.go('speech');
  }

  demoTone() {
    const sr = 44100; const n = sr * 3; const pcm = new Float32Array(n);
    for (let i = 0; i < n; i += 1) pcm[i] = i > sr && i < sr * 1.5 ? 0 : 0.5 * Math.sin((2 * Math.PI * 150 * i) / sr);
    this.loadPcm(pcm, sr, 'синтетический тон 150 Гц (демо, не речь)');
  }

  // --- Речь: спектрограмма, RMS, VAAL, ЛЕКСИС, тепловая карта ---
  renderSpeech() {
    const audioInput = byId('speech-audio-file');
    audioInput.onchange = (e) => { const f = e.target.files[0]; if (f) this.decodeAudio(f); e.target.value = ''; };
    byId('speech-demo-tone').onclick = () => this.demoTone();
    const hs = byId('speech-harness'); clear(hs); new HarnessStatus(this.harnessOf('prosodyTool')).render(hs);
    const meta = byId('speech-meta'); clear(meta);
    const host = byId('speech-prosody'); clear(host);
    const out = this.state.prosody;
    byId('speech-audio-name').textContent = this.state.audio === undefined ? '' : `${this.state.audio.name} · ${(this.state.audio.pcm.length / this.state.audio.sr).toFixed(1)} с · ${this.state.audio.sr} Гц`;
    if (out === undefined) {
      host.append(h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: 'Спектрограмма 0–5 кГц' }), new Badge('⛔').render(h('span'))), h('div', { class: 'viz-empty', text: '⛔ нет аудио — полный пайплайн измерил бы F0, паузы, темп, F1–F4, HNR, джиттер, шиммер' })));
    } else {
      const card = h('div', { class: 'card hero' }, h('div', { class: 'card-head' }, h('div', {}, h('h3', { text: 'Спектрограмма 0–5 кГц' }), h('div', { class: 'card-source', text: `prosodyTool v${out.version} · ${out.frames} кадров · ${out.duration_s} с` })), new Badge(present(out.f0.mean) ? '🟢' : '⛔').render(h('span'))));
      const sg = new Spectrogram(220); sg.render(card); sg.update(out);
      const env = new Envelope(60); env.render(card); env.update(out.rms.track);
      const chips = h('div', { class: 'hstack' });
      [['возбуждение/агитация', out.proxies.agitation], ['уплощённый аффект', out.proxies.flat_affect], ['сдержанность', out.proxies.restraint]].forEach(([label, p]) => chips.append(h('span', { class: `chip ${present(p) ? (p.value > 0.5 ? 'blue' : 'grey') : 'grey'}`, title: p.note, text: `${label} ${fmt(p, 'index')} 🔵` })));
      card.append(chips, h('span', { class: 'caption', text: 'акустические прокси — не диагноз, не верификация личности; пороги — калибровочная реконструкция' }));
      const rows = [['F0 средняя', out.f0.mean, 'freq'], ['Вариативность F0', out.f0.sd, 'freq'], ['RMS средняя', out.rms.mean, 'index'], ['Доля пауз', out.pause_share, 'percent'], ['Темп онсетов', out.onset_rate, 'index'], ['HNR', out.hnr, 'freq'], ['Джиттер', out.jitter, 'index'], ['Шиммер', out.shimmer, 'index'], ['F1', out.formants.f1, 'freq'], ['F2', out.formants.f2, 'freq'], ['F3', out.formants.f3, 'freq'], ['F4', out.formants.f4, 'freq'], ['Центроид', out.centroid, 'freq'], ['Наклон спектра', out.tilt, 'index']];
      const list = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: 'Просодика' }), new Badge('🟢').render(h('span'))));
      rows.forEach(([label, p, kind]) => list.append(h('div', { class: 'row' }, h('span', { text: label }), h('span', { class: 'value', title: p.note }, fmt(p, kind), h('span', { class: 'unit', text: present(p) ? p.unit : '' }), ' ', h('span', { class: 'cap2', text: p.badge })))));
      list.append(h('details', { class: 'json' }, h('summary', { text: 'JSON' }), h('pre', { text: JSON.stringify({ ...out, spectrogram: `[${out.spectrogram.frames}×${out.spectrogram.bins}]`, f0: { ...out.f0, track: `[${out.f0.track.length}]` }, rms: { ...out.rms, track: `[${out.rms.track.length}]` } }, null, 2) })));
      host.append(card, list);
      meta.append(h('span', { class: 'chip green', text: `F0 ${fmt(out.f0.mean, 'freq')} Гц` }), h('span', { class: 'chip grey', text: `паузы ${fmt(out.pause_share, 'percent')} %` }));
    }
    // VAAL и ЛЕКСИС — по транскрипту из «Запуска» (пересчёт детерминированный, без LLM).
    const tr = new Transcript(byId('launch-transcript').value);
    const focus = byId('launch-focus').value.trim() || 'К.';
    const vaalHost = byId('speech-vaal'); clear(vaalHost);
    const lexHost = byId('speech-lexis'); clear(lexHost);
    if (tr.empty()) {
      vaalHost.append(h('div', { class: 'state empty' }, h('span', { text: this.i18n.t('limit.novaal') })));
      lexHost.append(h('div', { class: 'state empty' }, h('span', { text: this.i18n.t('limit.novaal') })));
    } else {
      const v = this.phono.run({ text: tr.textOf(focus) || tr.textOf() });
      const vc = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h3', { text: `25 шкал Журавлёва · ${v.lang} · ${v.words} слов` }), h('div', { class: 'card-source', text: `phonoSemTool v${v.version} · полярность ${fmt(v.polarity, 'score')}` })), new Badge('🔵').render(h('span'))));
      const grid = h('div', { class: 'vaal-list' });
      v.scales.forEach((sc) => { const val = present(sc.value) ? sc.value.value : 0; const left = val < 0 ? 50 + val / 2 : 50; const w = Math.abs(val) / 2; grid.append(h('span', { class: sc.significant && val >= 0 ? 'sig' : '', text: sc.left }), h('div', { class: 'bar', title: `${fmt(sc.value, 'score')} · z ${sc.z}` }, h('i', { style: `left:${left}%;width:${w}%` })), h('span', { class: sc.significant && val < 0 ? 'sig' : '', style: 'text-align:right', text: sc.right })); });
      vc.append(grid, h('div', { class: 'hstack' }, v.blocks.positive.map((p) => h('span', { class: 'chip green', text: p })), v.blocks.negative.map((p) => h('span', { class: 'chip orange', text: p })), v.blocks.neutral.map((p) => h('span', { class: 'chip grey', text: p }))));
      const radar = new Radar(240); radar.render(vc); radar.update(Object.keys(v.plutchik).map((k) => ({ label: k, param: v.plutchik[k] })));
      vc.append(h('div', { class: 'hstack' }, Object.keys(v.belyanin).map((k) => h('span', { class: 'chip grey', text: `Белянин: ${k} ${fmt(v.belyanin[k], 'index')}` }))), h('div', { class: 'row' }, h('span', { text: 'TTR · hapax' }), h('span', { class: 'value', text: `${fmt(v.ttr)} · ${fmt(v.hapax)}` })), h('div', { class: 'limit' }, h('span', { text: '🔵 таблица PHON и категории — методологическая реконструкция; точные таблицы подставляются без изменения логики' })));
      vaalHost.append(vc);
      const l = this.lexis.run({ lines: tr.lexisLines(), focus });
      const lc = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h3', { text: `Местоимения и модальность · фокус ${l.focus || 'все'}` }), h('div', { class: 'card-source', text: `lexisTool v${l.version} · ${l.scope_words} слов` })), new Badge(l.status === 'ok' ? '🟢' : '⛔').render(h('span'))));
      [['«я»', l.pronouns.i, 'percent'], ['«мы»', l.pronouns.we, 'percent'], ['«ты/вы»', l.pronouns.you, 'percent'], ['«они»', l.pronouns.they, 'percent'], ['Долженствование', l.modality.must, 'percent'], ['Возможность', l.modality.can, 'percent']].forEach(([label, p, kind]) => lc.append(h('div', { class: 'row' }, h('span', { text: label }), h('span', { class: 'value', title: p.note }, fmt(p, kind), h('span', { class: 'unit', text: present(p) ? p.unit : '' })))));
      const zr = new Radar(220); zr.render(lc); zr.update([['прошлое−', 'past_negative'], ['прошлое+', 'past_positive'], ['гедонизм', 'present_hedonistic'], ['фатализм', 'present_fatalistic'], ['будущее', 'future']].map(([label, k]) => ({ label, param: l.zimbardo[k] })));
      lc.append(h('span', { class: 'caption', text: 'Zimbardo-прокси 🔵 — лексические маркеры, не опросник ZTPI' }));
      const bal = h('div', { class: 'hstack' }); Object.keys(l.balance).forEach((name) => bal.append(h('span', { class: 'chip blue', text: `${name}: ${fmt(l.balance[name].share, 'percent')} % · ${l.balance[name].turns} реплик · вопросов ${fmt(l.balance[name].questions, 'count')}` })));
      lc.append(bal);
      const hm = new Heatmap24(); hm.render(lc); hm.update(l.heatmap);
      lexHost.append(lc);
    }
    this.setState('speech', out === undefined ? 'partial' : 'content', this.i18n.t('speech.empty'));
  }

  // --- Тесты: PHQ-9 и GAD-7 (открытые ключи), импорт ответов для остальных ---
  renderTests() {
    const tabsHost = byId('tests-tabs'); clear(tabsHost);
    new SegmentControl([{ id: 'summary', label: this.i18n.t('tests.summary') }, { id: 'phq9', label: 'PHQ-9' }, { id: 'gad7', label: 'GAD-7' }, { id: 'import', label: this.i18n.t('tests.import') }], this.state.testsTab, (v) => { this.state.testsTab = v; this.renderTests(); }).render(tabsHost);
    const content = byId('tests-content'); clear(content);
    const tab = this.state.testsTab;
    const PHQ9 = ['Мало интереса или удовольствия от дел', 'Подавленность, депрессия, безнадёжность', 'Трудности с засыпанием, сном или избыточный сон', 'Усталость, мало энергии', 'Плохой аппетит или переедание', 'Плохое отношение к себе: неудачник, подвёл семью', 'Трудно сосредоточиться', 'Заторможенность или, наоборот, беспокойность', 'Мысли, что лучше умереть или причинить себе вред'];
    const GAD7 = ['Нервозность, тревога, взвинченность', 'Не удаётся прекратить или контролировать беспокойство', 'Слишком сильное беспокойство о разном', 'Трудно расслабиться', 'Беспокойство такое, что трудно усидеть на месте', 'Раздражительность', 'Страх, будто может случиться что-то ужасное'];
    const OPTS = ['0 · ни разу', '1 · несколько дней', '2 · более половины дней', '3 · почти каждый день'];
    const form = (id, items) => {
      const card = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', {}, h('h3', { text: `${id === 'PHQ9' ? 'PHQ-9' : 'GAD-7'} · за последние 2 недели` }), h('div', { class: 'card-source', text: 'scaleScorer · открытый ключ · Grade A' })), new Badge('🟢').render(h('span'))));
      const list = h('div', { class: 'scale-list' });
      const prev = this.state.answers === undefined ? {} : this.state.answers;
      items.forEach((text, i) => { const opts = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': text }); OPTS.forEach((o, v) => { const input = h('input', { type: 'radio', name: `${id}-${i}`, value: String(v) }); if (prev[id] !== undefined && prev[id][i] === v) input.checked = true; opts.append(h('label', { title: o }, input, h('span', { text: String(v) }))); }); list.append(h('div', { class: 'scale-row' }, h('span', { text: `${i + 1}. ${text}` }), opts)); });
      const result = h('div');
      const score = h('button', { type: 'button', class: 'btn', text: this.i18n.t('tests.score'), onClick: () => {
        const answers = items.map((_, i) => { const c = card.querySelector(`input[name="${id}-${i}"]:checked`); return c === null ? null : Number(c.value); });
        this.state.answers = { ...(this.state.answers === undefined ? {} : this.state.answers), [id]: answers };
        const out = this.scorer.run({ scale: id, answers });
        clear(result);
        if (out.status !== 'ok') { this.setState('tests', 'error', `${out.reason}. ${this.i18n.t('tests.empty')}`); return; }
        this.setState('tests', 'content');
        this.state.scales[id] = out;
        this.bus.emit('scale.scored', { scale: id, total: out.total.value, band: out.band });
        const ts = new TrafficScale7(); ts.render(result); ts.update(out.total, out.label);
        result.append(h('p', { class: 'sub', text: `${out.label}: ${fmt(out.total, 'score')} из ${out.total.range[1]} · ${out.band}` }));
        if (out.flags.length) { result.append(h('div', { class: 'state error' }, h('span', { class: 'title', text: '‼ Кризисный путь' }), h('span', { text: out.flags.join('; ') }), h('button', { type: 'button', class: 'btn danger small', text: 'Открыть Stanley-Brown', onClick: () => byId('clinic-crisis').dispatchEvent(new MouseEvent('click', { bubbles: true })) }))); this.state.scp = this.state.scp.with('clinic.crisis', { pathway: 'stanley-brown', shown: true, flags: out.flags }, 'system:Safety'); }
        result.append(h('span', { class: 'caption', text: 'гипотеза, не диагноз; решение принимает врач' }));
      } });
      card.append(list, h('div', { class: 'card-actions' }, score), result);
      if (this.state.scales[id] !== undefined) { const ts = new TrafficScale7(); ts.render(result); ts.update(this.state.scales[id].total, this.state.scales[id].label); result.append(h('p', { class: 'sub', text: `${this.state.scales[id].label}: ${fmt(this.state.scales[id].total, 'score')} · ${this.state.scales[id].band}` })); }
      return card;
    };
    this.setState('tests', 'content');
    if (tab === 'phq9') { content.append(form('PHQ9', PHQ9)); return; }
    if (tab === 'gad7') { content.append(form('GAD7', GAD7)); return; }
    if (tab === 'import') {
      const area = h('textarea', { rows: '6', placeholder: this.i18n.t('tests.answers_json'), style: 'width:100%;font-family:var(--mono);font-size:12px;border:1px solid var(--line-soft);border-radius:10px;padding:10px' });
      const result = h('div');
      const btn = h('button', { type: 'button', class: 'btn', text: this.i18n.t('tests.score'), onClick: () => {
        clear(result);
        try { const obj = JSON.parse(area.value); const out = this.scorer.run(obj); if (out.status !== 'ok') { this.setState('tests', 'error', out.reason); return; } this.setState('tests', 'content'); this.state.scales[out.scale] = out; this.bus.emit('scale.scored', { scale: out.scale, total: out.total.value }); result.append(h('div', { class: 'card quiet' }, h('h4', { text: `${out.label}: ${fmt(out.total, 'score')} ${out.band}` }), Object.keys(out.subscales).map((k) => h('div', { class: 'row' }, h('span', { text: k }), h('span', { class: 'value', text: `${fmt(out.subscales[k].score, 'score')} ${out.subscales[k].score.unit} ${out.subscales[k].band}` }))), out.indices ? h('div', { class: 'row' }, h('span', { text: 'GSI · PST · PSDI' }), h('span', { class: 'value', text: `${fmt(out.indices.GSI)} · ${fmt(out.indices.PST, 'count')} · ${fmt(out.indices.PSDI)}` })) : null)); } catch (e) { this.setState('tests', 'error', `JSON не разобран: ${e.message}`); }
      } });
      const avail = h('div', { class: 'hstack' }, ScaleScorer.scales().map((s) => h('span', { class: `chip ${s.available ? 'green' : 'grey'}`, title: s.reason, text: `${s.label}${s.available ? '' : ' ⛔'}` })));
      content.append(h('div', { class: 'card' }, h('h3', { text: 'Импорт ответов (JSON)' }), avail, area, h('div', { class: 'card-actions' }, btn), result, h('div', { class: 'limit' }, h('span', { text: '⛔ 16PF, IST, Белбин, Леонгард, Мадди — ключи проприетарные/не загружены; Gallup-34 — импорт рейтинга тем' }))));
      return;
    }
    const done = Object.values(this.state.scales);
    if (done.length === 0) { this.setState('tests', 'empty', this.i18n.t('tests.empty')); return; }
    done.forEach((out) => { const c = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', { text: out.label }), new Badge('🟢').render(h('span')))); const ts = new TrafficScale7(); ts.render(c); ts.update(out.total, out.label); c.append(h('p', { class: 'sub', text: `${fmt(out.total, 'score')} из ${out.total.range[1]} · ${out.band || 'без нормы'} · Grade ${out.grade}` })); content.append(c); });
  }

  // Экраны, у которых пока нет инструментов: честный ⛔ с описанием полного пайплайна.
  renderStub(page) {
    const info = {
      mind: ['Разум (V10)', 'Семиосферы · Цикл-8 · Когнитом 2D/3D · Факторы 52 · 6 осей · Я-профайл · Практики · МКБ-11. ⛔ Порт V10 — Спринт 3; 3D — ленивый чанк.'],
      narrative: ['Нарратив / Киноцех', 'Архетипы, путь героя (17), хронотоп, партитура напряжения, ОПТИКА-радары. ⛔ Спринт 7.']
    };
    const [title, text] = info[page] === undefined ? [page, '⛔ Модуль не описан'] : info[page];
    byId('stub-title').textContent = title;
    clear(byId('stub-content'));
    this.setState('stub', 'empty', text);
  }

  // --- Настройки, экспорт/импорт, печать ---
  renderSettings() {
    byId('settings-locale').addEventListener('change', (e) => { this.i18n.use(e.target.value); this.renderNav(); this.renderHome(); this.renderMore(); this.renderLaunchLabels(); });
    byId('settings-model').addEventListener('change', (e) => { byId('launch-model').value = e.target.value; });
    byId('settings-export').addEventListener('click', () => this.exportScp());
    byId('settings-import-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => this.importScp(t)); e.target.value = ''; });
    byId('settings-print').addEventListener('click', () => { this.renderPrintFooter(); window.print(); });
    const gates = byId('settings-gates');
    clear(gates);
    const rules = StimulusGate.rules();
    [['Фотосенситивная зона', `${rules.flicker_block_hz[0]}–${rules.flicker_block_hz[1]} Гц · блок`], ['Предел громкости', `${rules.spl_limit_db} дБ`], ['Аварийный стоп', `< ${rules.stop_budget_ms} мс`], ['Кризисный путь', 'Stanley-Brown · всегда на экране']].forEach(([k, v]) => gates.append(h('div', { class: 'item' }, h('span', { text: k }), h('span', { class: 'caption', text: v }))));
    this.setState('settings', 'content');
  }

  renderLaunchLabels() {
    this.state.modeControl.options.forEach((o, i) => { this.state.modeControl.nodes.root.children[i].textContent = this.i18n.t(`mode.${o.id}`); });
  }

  renderPrintFooter() {
    const m = this.state.scp.data.meta;
    byId('print-footer').textContent = `ATMARAKSI OS ${VERSION} · модель: ${m.model || 'без модели'}${m.fallback ? ' (откат)' : ''} · ${new Date().toISOString().slice(0, 16)} · hash ${m.input_hash || '—'}`;
  }

  exportText() {
    const scp = this.state.scp.with('meta.exported', { version: VERSION, at: new Date().toISOString() }, 'system:export');
    return scp.text();
  }

  // Скачивание: цепочка Blob → data: → window.open → textarea (песочница артефактов).
  exportScp() {
    const text = this.exportText();
    const name = `scp-${this.state.scp.data.subject.alias}-${(this.state.scp.data.meta.input_hash || 'empty').slice(0, 8)}.json`;
    let delivered = false;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      delivered = a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { delivered = false; }
    const area = h('textarea', { rows: '10', style: 'width:100%;font-family:var(--mono);font-size:11px', readonly: true });
    area.value = text;
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`;
    this.sheet.open(h('div', { class: 'stack' }, h('p', { class: 'caption', text: delivered ? `Скачивание ${name} запрошено. Если браузер заблокировал — откройте или скопируйте.` : 'Скачивание недоступно — откройте или скопируйте.' }), h('div', { class: 'hstack' }, h('button', { type: 'button', class: 'btn secondary small', text: 'Открыть в новом окне', onClick: () => window.open(dataUrl, '_blank') }), h('button', { type: 'button', class: 'btn secondary small', text: 'Выделить всё', onClick: () => area.select() })), area));
    this.toast.show(this.i18n.t('export.done'));
    this.bus.emit('export.json', { name, bytes: text.length });
  }

  importScp(text) {
    try {
      const scp = Scp.fromJson(text);
      if (scp.data.meta === undefined || scp.data.meta.system !== 'ATMARAKSI OS') throw new Error('meta.system');
      this.state.scp = scp;
      this.toast.show(this.i18n.t('import.done'));
      this.bus.emit('import.json', { hash: scp.data.meta.input_hash });
      this.renderHome(); this.renderInspector();
    } catch { this.setState('settings', 'error', this.i18n.t('import.bad')); }
  }

  // Round-trip: экспорт → импорт → идентичный профиль (харнесс типа 7).
  roundTrip() {
    const a = this.state.scp.text();
    const b = Scp.fromJson(a).text();
    return a === b;
  }

  // ⌘K / долгое нажатие Dynamic Island — командная строка.
  commandPalette() {
    const input = h('input', { type: 'text', placeholder: this.i18n.t('cmd.placeholder'), style: 'width:100%;min-height:44px;border:1px solid var(--line-soft);border-radius:10px;padding:0 12px', 'aria-label': 'Команда' });
    const run = () => {
      const q = input.value.toLowerCase();
      this.sheet.close();
      if (/каскад|cascade/.test(q)) this.go('profile', 'cascade');
      else if (/экспорт|export/.test(q)) this.exportScp();
      else if (/демо|demo/.test(q)) { this.go('launch'); byId('launch-transcript').value = DEMO_TRANSCRIPT; }
      else if (/запус|run|start/.test(q)) { this.go('launch'); if (byId('launch-transcript').value.trim() === '') byId('launch-transcript').value = DEMO_TRANSCRIPT; this.launch(); }
      else if (/памят|memory/.test(q)) this.go('memory');
      else if (/агент|agent/.test(q)) this.go('agents');
      else if (/галере|gallery/.test(q)) window.open('gallery.html', '_blank');
      else this.toast.show('Команда не распознана');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    this.sheet.open(h('div', { class: 'stack' }, input, h('div', { class: 'hstack' }, ['запусти сессию', 'покажи каскад', 'экспорт json', 'память', 'агенты'].map((c) => h('button', { type: 'button', class: 'chip editable', text: c, onClick: () => { input.value = c; run(); } })))));
  }

  start() {
    this.island.render(byId('island-host'));
    this.island.update({ phase: 'idle' });
    new Composer(this.i18n.t('launch.placeholder'), (text) => { byId('launch-transcript').value = text; this.go('launch'); this.launch(); }, (file) => this.attach(file)).render(byId('composer-host'));
    this.renderLaunch();
    this.renderClinic();
    this.renderSettings();
    this.renderMore();
    this.i18n.use('ru');
    document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.commandPalette(); } });
    this.bus.on('*', () => { if (this.state.page === 'agents') this.renderAgents(); });
    this.go('home');
    this.renderPrintFooter();
  }
}

async function main() {
  const [agents, tools, parameters, models, frames, ru, uk, en, report, corpus] = await Promise.all([
    Data.load('registry/agents.registry.json'), Data.load('registry/tools.registry.json'), Data.load('registry/parameters.registry.json'), Data.load('registry/models.registry.json'), Data.load('registry/frames.registry.json'),
    Data.load('ui/i18n/ru.json'), Data.load('ui/i18n/uk.json'), Data.load('ui/i18n/en.json'),
    Data.load('harness/report.json').catch(() => ({ green: 0, red: 0, functions: [] })), Data.load('fixtures/memory.cases.json')
  ]);
  const app = new App({ agents: agents.agents, tools: tools.tools, parameters: parameters.parameters, models, frames: frames.frames }, { ru, uk, en }, report, corpus);
  app.start();
  // Тестовый крючок для UI-харнесса (скриншоты, round-trip); наружу ничего не отправляется.
  globalThis.__atm = { app, version: VERSION, demo: DEMO_TRANSCRIPT, loadPcm: (pcm, sr, name) => app.loadPcm(pcm, sr, name) };
}

main().catch((e) => {
  const box = h('div', { class: 'state error', style: 'margin:16px' }, h('span', { class: 'title', text: 'Оболочка не запустилась' }), h('span', { text: e.message }));
  document.body.prepend(box);
});
