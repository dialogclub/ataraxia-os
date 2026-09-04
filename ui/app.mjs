// ATMARAKSI OS · оболочка v0.1 «Каркас». Интерфейс строится из реестров; L4 ничего не вычисляет — только движки L1/L3.
import { h, clear, present, fmt } from './components/base.mjs';
import { Badge } from './components/badge.mjs';
import { DynamicIsland } from './components/island.mjs';
import { SegmentControl, Sheet, Composer, Toast, HarnessStatus } from './components/controls.mjs';
import { Radar } from './components/radar.mjs';
import { RingGauge } from './components/gauges.mjs';
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

const VERSION = '0.1.0';
const VERSION_LABEL = 'v0.1 «Каркас»';
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
  'Т.: С чего начнём сегодня?',
  'К.: Не знаю. Я просто устал. Ничего не хочу, даже утром вставать.',
  'Т.: Когда это началось?',
  'К.: Наверное, месяца три назад. На работе всё сыпется, а я делаю вид, что держу.',
  'Т.: Вы сказали «делаю вид». Перед кем?',
  'К.: Перед всеми. Перед женой особенно. Она думает, что я справляюсь.',
  'Т.: А что было бы, если бы она узнала?',
  'К.: Давайте лучше про работу поговорим, там хотя бы понятно, что делать.',
  'Т.: Хорошо. Что понятно про работу?',
  'К.: Что надо уйти. Но я должен тянуть, у нас кредит и мама болеет.',
  'Т.: «Должен» — чьё это слово?',
  'К.: Отца. Он всегда так говорил. Я и не заметил, как стал им.'
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
    this.lines = Object.freeze(lines.map((l, i) => {
      const m = l.match(/^([^:]{1,24}):\s*(.+)$/);
      return Object.freeze({ n: i + 1, t: `#${i + 1}`, speaker: m ? m[1].trim() : '?', text: m ? m[2].trim() : l });
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
      { id: 'prosody', layer: 'L1', label: 'prosodyTool', run: async () => ({ badge: '⛔', title: 'L1 · ХРОНОС · просодика', source: 'prosodyTool', verdict: 'Канал недоступен: нет аудио', params: ['prosody.f0', 'prosody.pause_share', 'prosody.hnr'].map((id) => { const p = app.registry.parameters.find((x) => x.id === id); return { label: p.label_ru, param: Param.missing(p.unit, p.range, 'prosodyTool', '—', 'нет аудио').json(), kind: p.type }; }), limit: app.i18n.t('limit.noaudio') }) },
      { id: 'lexis', layer: 'L1', label: 'lexisTool', run: async () => ({ badge: '⛔', title: 'L1 · ЛЕКСИС', source: 'lexisTool · hidden_by_harness', verdict: 'Инструмент скрыт: нет зелёного харнесса (Спринт 1)', limit: app.i18n.t('limit.notool') }) }
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
    this.pipeline = new Pipeline(this);
    this.toast = new Toast(byId('toast-host'));
    this.sheet = new Sheet('ATMARAKSI OS');
    this.island = new DynamicIsland(() => this.pipeline.cancel(), () => this.commandPalette());
    this.state = { page: 'home', sub: '', scp: Scp.fresh({ mode: 'session', model: '', created: new Date().toISOString(), input_hash: '', alias: 'К.' }), steps: [], transcript: undefined, agents: new Set(), agentTasks: {}, clinicLocked: false, profileTab: 'overview', memoryMode: 'LOCAL' };
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
      card.append(h('div', { class: 'limit' }, h('span', { text: '⛔ groundingClassifier — Спринт 1; модус свободы воли А/Б/В/Г — после классификации' })));
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

  // Экраны, у которых пока нет инструментов: честный ⛔ с описанием полного пайплайна.
  renderStub(page) {
    const info = {
      speech: ['Речь', 'Спектрограмма 0–5 кГц, RMS, F0-трек, VAAL 25 шкал, Плутчик, Белянин, ЛЕКСИС, тепловая карта 24 ч. ⛔ Нет аудио и нет prosodyTool/phonoSemTool (Спринт 1). Полный пайплайн измерил бы: F0 автокорреляцией, паузы, темп онсетов, F1–F4, HNR, джиттер, шиммер.'],
      tests: ['Тесты', 'Итог · Gallup-34 · Интеллект · Характер · Мотивация · Развитие · Синтез. ⛔ scaleScorer — Спринт 1; данных опросников нет.'],
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
    new Composer(this.i18n.t('launch.placeholder'), (text) => { byId('launch-transcript').value = text; this.go('launch'); this.launch(); }, (file) => file.text().then((t) => { byId('launch-transcript').value = t; this.go('launch'); this.toast.show(`Вложение ${file.name}`); })).render(byId('composer-host'));
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
  globalThis.__atm = { app, version: VERSION, demo: DEMO_TRANSCRIPT };
}

main().catch((e) => {
  const box = h('div', { class: 'state error', style: 'margin:16px' }, h('span', { class: 'title', text: 'Оболочка не запустилась' }), h('span', { text: e.message }));
  document.body.prepend(box);
});
