// Стадия L2/L3 для интерфейса: оркестратор агентов + представление результатов карточками (грамматика 4.3).
// Интерфейс ничего не вычисляет: бейджи, консенсус, судья и проверки якорей приходят из core/agents.
// Без выбранной модели или при отказе API агенты получают ⛔ с причиной, отчёт собирается из L1 (инвариант 7).
import { L2Orchestrator, Router, applyToScp } from '../core/agents/orchestrator.mjs';

const KIND_TEXT = Object.freeze({
  no_model: 'модель не выбрана — L2 не вызывается; отчёт собран из L1',
  auth: 'Claude API отклонил запрос: нет ключа или шлюза (ключ вводится в «Настройках», хранится только в памяти вкладки)',
  network: 'нет связи с Claude API',
  timeout: 'Claude API не ответил за 90 с',
  rate: 'лимит запросов Claude API исчерпан после повторов',
  overloaded: 'Claude API перегружен после повторов',
  model_unavailable: 'выбранная модель недоступна, откат не помог',
  refusal: 'модель отказалась отвечать на этот материал',
  truncated: 'ответ модели оборван по длине',
  bad_request: 'Claude API отклонил форму запроса',
  invalid_response: 'ответ модели не прошёл проверку по схеме',
  upstream: 'нет результатов вышестоящих агентов',
  cancelled: 'анализ отменён',
  no_claims: 'нет утверждений агентов для синтеза',
  internal: 'внутренняя ошибка стадии'
});

export function kindText(kind) {
  return KIND_TEXT[kind] === undefined ? '' : KIND_TEXT[kind];
}

// Клиент-заглушка: вызывать его нельзя; нужен, чтобы оркестратор мог формировать «пропущенные» результаты без модели.
class DisabledClient {
  async complete() {
    throw new Error('модель не выбрана');
  }
}

export class L2Stage {
  // config: { cards: Map id → карточка, models: реестр моделей, prompts: реестр промптов, toolbox, client(): клиент | undefined, k, concurrency }
  constructor(config) {
    this.config = config;
    this.state = { results: new Map(), reflector: undefined, thera: undefined, judges: [] };
    Object.freeze(this);
  }

  reset() {
    this.state.results.clear();
    this.state.reflector = undefined;
    this.state.thera = undefined;
    this.state.judges = [];
  }

  orchestrator() {
    const c = this.config;
    const live = c.client();
    const client = live === undefined ? new DisabledClient() : live;
    const orch = new L2Orchestrator({ client, toolbox: c.toolbox, models: c.models, cards: c.cards, prompts: c.prompts }, { k: c.k, concurrency: c.concurrency });
    return { orch, live: live !== undefined };
  }

  plan(options) {
    return Router.plan(options);
  }

  async runAll(ids, base, onProgress) {
    const { orch, live } = this.orchestrator();
    this.reset();
    if (!live) ids.forEach((id) => this.state.results.set(id, orch.skipped(id, kindText('no_model'), 'no_model')));
    else await orch.runDomain(ids, base, onProgress, this.state.results);
    this.state.judges = orch.judges(this.state.results);
  }

  async runOne(id, base) {
    const { orch, live } = this.orchestrator();
    const r = live ? await orch.runAgent(id, base, this.state.results) : orch.skipped(id, kindText('no_model'), 'no_model');
    this.state.results.set(id, r);
    this.state.judges = orch.judges(this.state.results);
    return r;
  }

  async synthesize(base, onProgress) {
    const { orch, live } = this.orchestrator();
    this.state.reflector = undefined;
    this.state.thera = undefined;
    if (!live) {
      const none = (id) => Object.freeze({ id, status: 'skipped', reason: kindText('no_model'), kind: 'no_model', card_badge: '⛔', usage: { input_tokens: 0, output_tokens: 0 }, calls: 0, flags: [], verdicts: [], axes: [], contradictions: [], plan: [], limits: [] });
      this.state.reflector = none('Reflector');
      this.state.thera = none('TheraNavigator');
      return;
    }
    const out = await orch.synthesize(base, this.state.results, onProgress);
    this.state.reflector = out.reflector;
    this.state.thera = out.thera;
  }

  // Применить результаты в SCP: запись только в поля карточек агентов (слойное правило).
  applyAll(scp) {
    let out = scp;
    this.state.results.forEach((r, id) => { out = applyToScp(out, this.config.cards.get(id), r); });
    return out;
  }

  live() {
    return Array.from(this.state.results.values()).filter((r) => r.status === 'ok' || r.status === 'degraded');
  }

  // Итоги прогона: модель, откат, токены, число успешных агентов.
  summary() {
    const all = [...this.state.results.values(), ...(this.state.reflector === undefined ? [] : [this.state.reflector]), ...(this.state.thera === undefined ? [] : [this.state.thera])];
    // Модель считается использованной только если хоть один ответ принят: у упавших агентов model — лишь первая в цепочке.
    const used = all.filter((r) => (r.status === 'ok' || r.status === 'degraded') && typeof r.model === 'string' && r.model !== '');
    return {
      total: this.state.results.size,
      ok: this.state.results.size === 0 ? 0 : this.live().length,
      model: used.length ? used[0].model : '',
      fallback: used.some((r) => r.fallback === true),
      input_tokens: all.reduce((a, r) => a + ((r.usage && r.usage.input_tokens) || 0), 0),
      output_tokens: all.reduce((a, r) => a + ((r.usage && r.usage.output_tokens) || 0), 0),
      calls: all.reduce((a, r) => a + (r.calls || 0), 0)
    };
  }
}

// --- Представление результатов (спецификации ResultCard) ---
export function agentCard(result, card, hooks) {
  const h = hooks === undefined ? {} : hooks;
  const live = result.status === 'ok' || result.status === 'degraded';
  if (!live) {
    return { badge: '⛔', title: `L2 · ${result.id}`, source: `${card.label_ru} · ${result.status}`, verdict: `⛔ ${result.reason || kindText(result.kind) || 'агент не отработал'}`,
      limit: kindText(result.kind), json: { status: result.status, kind: result.kind, reason: result.reason, calls: result.calls, reads: card.reads, writes: card.writes, tools_required: card.tools_required } };
  }
  const anchors = result.id === 'Veritas' && result.fields !== undefined && Array.isArray(result.fields.displacements)
    ? result.fields.displacements.map((d) => ({ quote: d.quote, speaker: d.speaker, t: d.t, strong: true, away_from: d.away_from })) : [];
  const limits = [...(result.limits || [])];
  if (result.status === 'degraded') limits.push(result.reason);
  if (result.dropped && result.dropped.length) limits.push(`отброшено утверждений без подтверждённого якоря: ${result.dropped.length}`);
  return { badge: result.card_badge, title: `L2 · ${result.id}`, source: `${card.label_ru} · ${result.model}${result.fallback ? ' (откат)' : ''} · ${result.latency_ms} мс · вызовов ${result.calls}`,
    verdict: result.summary, anchors, claims: result.claims, onJump: h.onJump, onRetry: h.onRetry, limit: limits.join(' · '),
    json: { status: result.status, model: result.model, fallback: result.fallback, tools_called: result.tools_called, stats: result.stats, fields: result.fields, usage: result.usage } };
}

const refsAsEvidence = (refs, index) => refs.map((ref) => ({ type: 'claim', ref, ok: true, badge: index.has(ref) ? index.get(ref).badge : '⛔' }));

// Герой синтеза: вердикты Рефлектора (с опорой на утверждения), либо детерминированный отчёт, если синтеза нет.
export function heroCard(reflector, thera, index, measured, hooks) {
  const h = hooks === undefined ? {} : hooks;
  const ok = reflector !== undefined && (reflector.status === 'ok' || reflector.status === 'degraded') && reflector.verdicts.length > 0;
  if (!ok) {
    const why = reflector === undefined ? '' : (reflector.reason || kindText(reflector.kind));
    return { badge: measured.length ? '🟢' : '⛔', hero: true, title: 'L3 · Детерминированный отчёт', source: 'без Reflector', verdict: measured.length ? `Измерено ${measured.length}: ${measured.join(', ')}. Интерпретации нет — синтез недоступен.` : 'Нет измерений', onRetry: h.onRetry, limit: why };
  }
  // Первый вердикт уже вынесен в заголовок героя: в списке остаются его якоря без повтора текста.
  const claims = reflector.verdicts.map((v, i) => ({ id: v.id, text: v.text, badge: v.badge, evidence: refsAsEvidence(v.claim_refs, index), flags: v.flags || [], hideText: i === 0 }));
  const limits = [...reflector.limits];
  if (reflector.status === 'degraded') limits.push(reflector.reason);
  if (reflector.unstable) limits.push(`нестабильных между выборками элементов: ${reflector.unstable} (понижены до 🔵)`);
  return { badge: reflector.card_badge, hero: true, title: 'L3 · Синтез-рефлектор', source: `${reflector.model}${reflector.fallback ? ' (откат)' : ''} · консенсус ${reflector.k_ok} из ${reflector.k} · вызовов ${reflector.calls}`,
    verdict: reflector.verdicts[0].text, claims, onRetry: h.onRetry, limit: limits.join(' · '), json: { verdicts: reflector.verdicts, contradictions: reflector.contradictions, usage: reflector.usage } };
}

export function indexOfResults(results) {
  const m = new Map();
  results.filter((r) => r.status === 'ok' || r.status === 'degraded').forEach((r) => r.claims.forEach((c) => m.set(c.id, { badge: c.badge, text: c.text, agent: r.id })));
  return m;
}
