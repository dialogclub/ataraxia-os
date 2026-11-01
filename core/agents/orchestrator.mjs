// Оркестратор L2/L3 (3.6): Router → DAG агентов (параллельные веера по уровням зависимостей, не более N одновременно)
// → Синтез-рефлектор (k выборок, консенсус) → Тера-навигатор → Судья. Ошибка одного агента не прячет остальных;
// без API (auth/сеть) отчёт собирается из L1: агенты получают ⛔ с причиной. Запись в SCP — только в поля карточки агента.
import { AgentRunner } from './agentRunner.mjs';
import { SPECS, DOMAIN_AGENTS } from './agentSpecs.mjs';
import { REFLECTOR_SPEC, THERA_SPEC, claimIndexOf, consensus, verdictKey, axisKey, judge } from './synthesis.mjs';

// Цепочка отката по реестру моделей: id → fallback → … (без циклов).
export function chainOf(models, id) {
  const byId = new Map(models.models.map((m) => [m.id, m]));
  const chain = [];
  let cur = byId.has(id) ? id : models.default;
  while (cur && byId.has(cur) && !chain.includes(cur) && chain.length < 5) { chain.push(cur); cur = byId.get(cur).fallback; }
  return chain;
}

export function modelsFor(policy, selected, models) {
  if (policy === 'strong') return chainOf(models, models.default);
  if (policy === 'cheap') { const cheap = models.models.find((m) => m.tier === 'cheap'); return chainOf(models, cheap ? cheap.id : models.default); }
  return chainOf(models, selected);
}

const SET_MEETING = ['Requestor', 'Veritas', 'Obstacle', 'Grounding', 'Drives', 'Chronotope', 'Memory'];
const SET_GAME = ['Requestor', 'Veritas', 'Obstacle', 'Grounding', 'CascadeABC', 'Drives', 'Chronotope', 'Insight', 'Libertas', 'Qualitas'];

export class Router {
  // Правила по режиму и входам; LLM-классификатор интента не подключён (⛔) — в объяснении так и сказано.
  static plan(options) {
    const o = options;
    const base = o.mode === 'meeting' ? SET_MEETING : o.mode === 'game' ? SET_GAME : DOMAIN_AGENTS;
    const picked = (o.selected && o.selected.length ? o.selected : base).filter((id) => DOMAIN_AGENTS.includes(id));
    const notes = [];
    if (!o.hasAudio) notes.push('просодика ⛔: нет аудио');
    if (picked.some((id) => SPECS[id].depends_on.some((d) => !picked.includes(d)))) notes.push('часть агентов без вышестоящих: работают на транскрипте и инструментах');
    return { agents: picked, reason: `Router: режим «${o.mode}» → ${picked.length} агентов${notes.length ? `; ${notes.join('; ')}` : ''}; LLM-классификатор интента ⛔ (только правила)` };
  }
}

function levelsOf(ids) {
  const done = new Set();
  const levels = [];
  let rest = ids.slice();
  while (rest.length) {
    const ready = rest.filter((id) => SPECS[id].depends_on.filter((d) => ids.includes(d)).every((d) => done.has(d)));
    if (ready.length === 0) { levels.push(rest); break; } // защита от циклов: оставшиеся — одним уровнем
    levels.push(ready);
    ready.forEach((id) => done.add(id));
    rest = rest.filter((id) => !ready.includes(id));
  }
  return levels;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next; next += 1; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

export class L2Orchestrator {
  // deps: { client, toolbox, models (registry), cards (Map id → card), prompts: { preamble, tasks }, now }
  constructor(deps, options) {
    const o = options === undefined || options === null ? {} : options;
    this.deps = deps;
    this.runner = new AgentRunner(deps.client, deps.toolbox, { now: deps.now, maxTokens: o.maxTokens });
    this.concurrency = typeof o.concurrency === 'number' ? o.concurrency : 4;
    this.k = typeof o.k === 'number' ? o.k : 3;
    Object.freeze(this);
  }

  promptFor(id, overrides) {
    const p = this.deps.prompts;
    const task = overrides && overrides[id] ? overrides[id] : p.tasks[id];
    return { preamble: p.preamble, task: task === undefined ? '' : task };
  }

  // base: { lines, focus, mode, cascade, audio, selectedModel, overrides, l1Notes }
  contextFor(id, base, results) {
    const card = this.deps.cards.get(id);
    const upstream = (SPECS[id] ? SPECS[id].depends_on : [])
      .map((d) => results.get(d)).filter((r) => r && (r.status === 'ok' || r.status === 'degraded'))
      .map((r) => ({ agent: r.id, claims: r.claims.map((c) => ({ id: c.id, text: c.text, badge: c.badge })) }));
    return { lines: base.lines, focus: base.focus, mode: base.mode, cascade: base.cascade, audio: base.audio, chain: modelsFor(card.model_policy, base.selectedModel, this.deps.models), prompt: this.promptFor(id, base.overrides), upstream, effort: base.effort };
  }

  skipped(id, reason, kind) {
    const card = this.deps.cards.get(id);
    return Object.freeze({ id, label: card.label_ru, status: 'skipped', reason, kind, claims: [], dropped: [], flags: [], tools_called: [], card_badge: '⛔', usage: { input_tokens: 0, output_tokens: 0 }, calls: 0, summary: '', limits: [], fields: undefined, stats: { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0, claim_total: 0, claim_ok: 0 }, latency_ms: 0 });
  }

  async runAgent(id, base, results) {
    if (typeof base.cancelled === 'function' && base.cancelled()) return this.skipped(id, 'анализ отменён', 'cancelled');
    const deps = SPECS[id].depends_on;
    const live = deps.map((d) => results.get(d)).filter((r) => r && (r.status === 'ok' || r.status === 'degraded'));
    if (deps.length && live.length === 0 && deps.some((d) => results.has(d))) return this.skipped(id, `нет результатов вышестоящих агентов (${deps.join(', ')})`, 'upstream');
    return this.runner.run(this.deps.cards.get(id), this.contextFor(id, base, results));
  }

  // Основной запуск L2. onProgress({layer, agent, done, total, status}) — для Dynamic Island.
  async runDomain(agentIds, base, onProgress, results) {
    const res = results === undefined ? new Map() : results;
    const ids = agentIds.filter((id) => SPECS[id] !== undefined);
    const total = ids.length;
    let done = 0;
    for (const level of levelsOf(ids)) {
      await pool(level, this.concurrency, async (id) => {
        if (onProgress) onProgress({ layer: 'L2', agent: id, done, total, status: 'running' });
        let r;
        try { r = await this.runAgent(id, base, res); } catch (e) {
          r = { ...this.skipped(id, e && e.message ? e.message : String(e), 'internal'), status: 'failed' };
        }
        res.set(id, r);
        done += 1;
        if (onProgress) onProgress({ layer: 'L2', agent: id, done, total, status: r.status });
      });
    }
    return res;
  }

  // L3: Рефлектор (k выборок + консенсус) → Тера-навигатор. Возвращает { reflector, thera }.
  async synthesize(base, results, onProgress) {
    if (typeof base.cancelled === 'function' && base.cancelled()) return { reflector: Object.freeze({ id: 'Reflector', status: 'skipped', reason: 'анализ отменён', kind: 'cancelled', card_badge: '⛔', usage: { input_tokens: 0, output_tokens: 0 }, calls: 0, flags: [], verdicts: [], axes: [], contradictions: [], limits: [] }), thera: Object.freeze({ id: 'TheraNavigator', status: 'skipped', reason: 'анализ отменён', kind: 'cancelled', card_badge: '⛔', usage: { input_tokens: 0, output_tokens: 0 }, calls: 0, flags: [], plan: [], limits: [] }) };
    const index = claimIndexOf([...results.values()]);
    const empty = (id, reason) => Object.freeze({ id, status: 'skipped', reason, kind: 'no_claims', card_badge: '⛔', usage: { input_tokens: 0, output_tokens: 0 }, calls: 0, flags: [], verdicts: [], axes: [], contradictions: [], plan: [], limits: [reason] });
    if (index.size === 0) return { reflector: empty('Reflector', 'нет утверждений агентов для синтеза'), thera: empty('TheraNavigator', 'нет утверждений агентов для плана') };
    const cardR = this.deps.cards.get('Reflector');
    const cardT = this.deps.cards.get('TheraNavigator');
    const ctxBase = { lines: base.lines, focus: base.focus, mode: base.mode, claimIndex: index, l1Notes: base.l1Notes };
    const samples = [];
    const failures = [];
    for (let i = 0; i < this.k; i += 1) {
      if (onProgress) onProgress({ layer: 'L3', agent: `Reflector ${i + 1}/${this.k}`, done: i, total: this.k + 1, status: 'running' });
      const r = await this.runner.run(cardR, { ...ctxBase, chain: modelsFor(cardR.model_policy, base.selectedModel, this.deps.models), prompt: this.promptFor('Reflector', base.overrides), effort: 'high' }, REFLECTOR_SPEC);
      if (r.status === 'ok') samples.push(r); else failures.push(r);
      if (r.kind === 'auth' || r.kind === 'network') break; // без API незачем повторять
    }
    let reflector;
    if (samples.length === 0) {
      const f = failures[0];
      reflector = Object.freeze({ id: 'Reflector', status: 'failed', reason: f ? f.reason : 'нет выборок', kind: f ? f.kind : 'internal', card_badge: '⛔', usage: f ? f.usage : { input_tokens: 0, output_tokens: 0 }, calls: failures.reduce((a, x) => a + x.calls, 0), flags: [], verdicts: [], axes: [], contradictions: [], limits: [] });
    } else {
      const cv = consensus(samples, (s) => s.verdicts, verdictKey);
      const ca = consensus(samples, (s) => s.axes, axisKey);
      const contra = new Map();
      samples.forEach((s) => s.contradictions.forEach((c) => contra.set([c.a, c.b].sort().join('|'), c)));
      const usage = samples.concat(failures).reduce((a, s) => ({ input_tokens: a.input_tokens + (s.usage.input_tokens || 0), output_tokens: a.output_tokens + (s.usage.output_tokens || 0) }), { input_tokens: 0, output_tokens: 0 });
      reflector = Object.freeze({ id: 'Reflector', status: samples.length === this.k ? 'ok' : 'degraded', reason: samples.length === this.k ? '' : `успешных выборок ${samples.length} из ${this.k}`, kind: '', model: samples[0].model, fallback: samples.some((s) => s.fallback), usage, calls: samples.concat(failures).reduce((a, s) => a + s.calls, 0), k: this.k, k_ok: samples.length,
        verdicts: [...cv.stable, ...cv.unstable], axes: [...ca.stable, ...ca.unstable], contradictions: [...contra.values()], unstable: cv.unstable.length + ca.unstable.length, limits: [...new Set(samples.flatMap((s) => s.limits))], flags: [], card_badge: samples[0].card_badge });
    }
    if (onProgress) onProgress({ layer: 'L3', agent: 'TheraNavigator', done: this.k, total: this.k + 1, status: 'running' });
    const thera = await this.runner.run(cardT, { ...ctxBase, chain: modelsFor(cardT.model_policy, base.selectedModel, this.deps.models), prompt: this.promptFor('TheraNavigator', base.overrides), effort: 'medium' }, THERA_SPEC);
    return { reflector, thera };
  }

  judges(results) {
    return [...results.values()].map((r) => judge(r));
  }
}

// Запись результата агента в SCP: только в поля из карточки (слойное правило 3.1), плюс frames.l2.<id>; якоря → evidence[].
export function applyToScp(scp, card, result) {
  if (result.status !== 'ok' && result.status !== 'degraded') {
    return scp.with(`frames.l2.${card.id}`, { status: result.status, reason: result.reason, kind: result.kind }, `agent:${card.id}`);
  }
  const spec = SPECS[card.id];
  const allowed = (card.writes || []).map((w) => w.replace(/^scp\./, ''));
  const inScope = (path) => allowed.some((a) => path === a || path.startsWith(`${a}.`));
  let out = scp;
  const writes = [...(spec ? spec.write(result.fields) : []), [`frames.l2.${card.id}`, { status: result.status, summary: result.summary, model: result.model, fallback: result.fallback, claims: result.claims.map((c) => ({ id: c.id, text: c.text, badge: c.badge, flags: c.flags })), limits: result.limits }]];
  writes.forEach(([path, value]) => {
    if (!inScope(path)) throw new Error(`слой L2: агент ${card.id} не вправе писать в ${path}`);
    out = out.with(path, value, `agent:${card.id}`);
  });
  result.claims.forEach((c) => {
    const first = c.evidence.find((e) => e.ok);
    if (first) out = out.withEvidence({ claim_id: c.id, type: first.type === 'measure' ? 'measure' : 'quote', ref: first.type === 'measure' ? { tool: first.tool, path: first.path } : first.type === 'quote' ? { speaker: first.speaker, t: first.t, quote: first.quote } : { claim: first.ref }, badge: c.badge }, `agent:${card.id}`);
  });
  return out;
}
