// AgentRunner — исполнение одного агента L2: ReAct-цикл (≤ 3 раундов вызова инструментов), обязательные инструменты,
// строгая схема со счётчиком повторов (≤ 2), проверка якорей, честные бейджи, защита чисел, согласованность с инструментами.
// Модель отвечает единственным способом — инструментом submit_result; рантайм принимает ответ, только если он проходит все проверки.
// Принятие ответа — детерминированный код: LLM не может «назначить» себе бейдж или выдумать цитату.
import { validate, summarize } from '../jsonSchema.mjs';
import { verifyEvidence, claimBadge, allowedNumbers, unsupportedNumbers, BADGE_RANK, strongest, weakest } from './evidence.mjs';
import { compact } from './toolbox.mjs';
import { SPECS, buildAgentSchema } from './agentSpecs.mjs';
import { ModelError } from './modelClient.mjs';

export const LIMITS = Object.freeze({ toolRounds: 3, submitRetries: 2, maxCalls: 7, toolResultChars: 12000 });
const SUBMIT = 'submit_result';

function submitDef(schema) {
  return { name: SUBMIT, description: 'Передать итог работы строго по схеме. Вызывай один раз, после обязательных инструментов. При ошибке валидации вернётся список проблем — исправь и вызови снова.', input_schema: schema };
}

function optionalName(n) {
  return n.endsWith('?') ? n.slice(0, -1) : n;
}

export function buildUserMessage(card, ctx, requiredTools) {
  const lines = ctx.lines.map((l) => `${l.t} ${l.speaker}: ${l.text}`).join('\n');
  const up = (ctx.upstream || []).flatMap((u) => u.claims.map((c) => `- ${c.id} ${c.badge}: ${c.text}`));
  return [
    `Режим: ${ctx.mode || 'session'}. Фокус-участник: ${ctx.focus || '—'}.`,
    'Транскрипт (таймкод и спикер — ровно как здесь, их нужно повторять в цитатах):',
    lines,
    up.length ? `Утверждения вышестоящих агентов (ссылка якорем type=claim, ref=<id>):\n${up.join('\n')}` : '',
    requiredTools.length ? `Обязательные инструменты: ${requiredTools.join(', ')}. Вызови их до submit_result.` : 'Обязательных инструментов нет.',
    `Задача агента «${card.id}»: выполни по системной инструкции и передай итог через submit_result.`
  ].filter(Boolean).join('\n\n');
}

export class AgentRunner {
  // client: { complete(req, chain) → { response, model, fallback, from } }; toolbox: Toolbox; now: () => мс.
  constructor(client, toolbox, options) {
    const o = options === undefined || options === null ? {} : options;
    this.client = client;
    this.toolbox = toolbox;
    this.now = typeof o.now === 'function' ? o.now : () => (globalThis.performance ? globalThis.performance.now() : Date.now());
    this.maxTokens = typeof o.maxTokens === 'number' ? o.maxTokens : 8000;
    Object.freeze(this);
  }

  // card — карточка из agents.registry.json; ctx — { lines, focus, mode, cascade, audio, chain[], prompt:{preamble, task}, upstream[], effort }
  async run(card, ctx, customSpec) {
    const spec = customSpec === undefined ? SPECS[card.id] : customSpec;
    if (spec === undefined) throw new Error(`нет спецификации агента ${card.id}`);
    return this.execute(card, spec, spec.schema === undefined ? buildAgentSchema(spec.fields) : spec.schema, ctx);
  }

  async execute(card, spec, schema, ctx) {
    const t0 = this.now();
    const required = (card.tools_required || []).filter((n) => !n.endsWith('?'));
    const optional = (card.tools_required || []).filter((n) => n.endsWith('?')).map(optionalName);
    const tools = [...this.toolbox.defs([...required, ...optional]), submitDef(schema)];
    const userText = typeof spec.userMessage === 'function' ? spec.userMessage(card, ctx) : buildUserMessage(card, ctx, required);
    const system = `${ctx.prompt.preamble}\n\nАгент: ${card.label_ru} (${card.id}).\n${ctx.prompt.task}`;
    const messages = [{ role: 'user', content: userText }];
    const st = { called: new Map(), calls: [], rounds: 0, submitAttempts: 0, nCalls: 0, usage: { input_tokens: 0, output_tokens: 0 }, model: ctx.chain[0], fallback: false, chain: ctx.chain.slice(), lastCandidate: undefined, lastErrors: [] };
    const upstreamBadges = new Map((ctx.upstream || []).flatMap((u) => u.claims.map((c) => [c.id, c.badge])));
    const upstreamTexts = (ctx.upstream || []).flatMap((u) => u.claims.map((c) => c.text));
    const fail = (kind, reason) => this.failed(card, st, kind, reason, this.now() - t0);

    while (st.nCalls < LIMITS.maxCalls) {
      st.nCalls += 1;
      let r;
      try {
        r = await this.client.complete({ model: st.chain[0], system, messages, tools, maxTokens: this.maxTokens, effort: ctx.effort }, st.chain);
      } catch (e) {
        const err = e instanceof ModelError ? e : new ModelError('invalid_response', e && e.message ? e.message : String(e));
        return fail(err.kind, err.message);
      }
      st.model = r.model;
      st.fallback = st.fallback || r.fallback;
      if (r.fallback) st.chain = st.chain.slice(Math.max(0, st.chain.indexOf(r.model)));
      const u = r.response.usage || {};
      st.usage.input_tokens += u.input_tokens || 0;
      st.usage.output_tokens += u.output_tokens || 0;
      // Контент ассистента возвращается без правок (в т.ч. thinking-блоки) — история только дописывается.
      messages.push({ role: 'assistant', content: r.response.content });
      const uses = r.response.content.filter((b) => b && b.type === 'tool_use');
      if (uses.length === 0) {
        st.submitAttempts += 1;
        st.lastErrors = ['ответ без submit_result'];
        if (st.submitAttempts > LIMITS.submitRetries) return this.finalize(card, spec, schema, st, ctx, upstreamBadges, upstreamTexts, t0, 'no_submit');
        messages.push({ role: 'user', content: 'Ответ принимается только через инструмент submit_result. Вызови его строго по схеме.' });
        continue;
      }
      const results = [];
      const others = uses.filter((b) => b.name !== SUBMIT);
      const submits = uses.filter((b) => b.name === SUBMIT);
      if (others.length) st.rounds += 1;
      for (const b of others) {
        if (st.rounds > LIMITS.toolRounds) { results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: `Лимит ReAct (${LIMITS.toolRounds} раунда) исчерпан. Вызови submit_result.` }); continue; }
        if (![...required, ...optional].includes(b.name)) { results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: `Инструмент ${b.name} недоступен этому агенту.` }); continue; }
        try {
          const out = this.toolbox.run(b.name, b.input, ctx);
          st.called.set(b.name, out);
          st.calls.push({ name: b.name, input: b.input === undefined ? {} : b.input, status: out && out.status ? out.status : 'ok' });
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(compact(out)).slice(0, LIMITS.toolResultChars) });
        } catch (e) {
          st.calls.push({ name: b.name, input: b.input === undefined ? {} : b.input, status: 'error' });
          results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: `Ошибка инструмента: ${e && e.message ? e.message : String(e)}` });
        }
      }
      let accepted;
      for (const b of submits) {
        const ev = typeof spec.evaluate === 'function' ? spec.evaluate(card, schema, b.input, st, ctx, upstreamTexts) : this.evaluate(card, spec, schema, b.input, st, ctx, upstreamBadges, upstreamTexts, false);
        if (ev.errors.length === 0 && accepted === undefined) { accepted = ev; results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Принято.' }); } else {
          st.submitAttempts += 1;
          st.lastCandidate = b.input;
          st.lastErrors = ev.errors.length ? ev.errors : ['повторный submit_result в том же ходе'];
          results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: `Не принято: ${summarize(st.lastErrors, 8)}. Исправь и вызови submit_result снова.` });
        }
      }
      messages.push({ role: 'user', content: results });
      if (accepted !== undefined) return typeof spec.assemble === 'function' ? spec.assemble(card, st, accepted, this.now() - t0) : this.success(card, spec, st, accepted, 'ok', [], this.now() - t0);
      if (st.submitAttempts > LIMITS.submitRetries) return this.finalize(card, spec, schema, st, ctx, upstreamBadges, upstreamTexts, t0, 'invalid');
    }
    return this.finalize(card, spec, schema, st, ctx, upstreamBadges, upstreamTexts, t0, 'max_calls');
  }

  // Проверки в порядке жёсткости. lenient=true: мягкие ошибки якорей не отклоняют ответ, а отбрасывают утверждения.
  evaluate(card, spec, schema, input, st, ctx, upstreamBadges, upstreamTexts, lenient) {
    const errors = [];
    const schemaErrors = validate(schema, input);
    if (schemaErrors.length) return { errors: schemaErrors.map((e) => `схема: ${e}`), hard: true };
    const required = (card.tools_required || []).filter((n) => !n.endsWith('?'));
    const missing = required.filter((n) => !st.called.has(n));
    if (missing.length) return { errors: [`сначала вызови обязательные инструменты: ${missing.join(', ')}`], hard: true };
    const allowed = allowedNumbers(st.called, ctx.lines, upstreamTexts);
    const claimBadges = new Map(upstreamBadges);
    const ids = new Set();
    const claims = [];
    const dropped = [];
    const stats = { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0, claim_total: 0, claim_ok: 0 };
    input.claims.forEach((c, i) => {
      if (ids.has(c.id)) { errors.push(`claims[${i}].id=${c.id} повторяется`); return; }
      ids.add(c.id);
      const evidence = [];
      let bad = 0;
      c.evidence.forEach((ev, j) => {
        const shape = ev.type === 'quote' ? ['quote', 'speaker', 't'] : ev.type === 'measure' ? ['tool', 'path'] : ['ref'];
        const lacking = shape.filter((k) => typeof ev[k] !== 'string' || ev[k] === '');
        const r = lacking.length ? { ok: false, badge: '⛔', reason: `не заполнено: ${lacking.join(', ')}` } : verifyEvidence(ev, { lines: ctx.lines, toolOutputs: st.called, claimBadges });
        stats[`${ev.type}_total`] += 1;
        if (r.ok) stats[`${ev.type}_ok`] += 1; else { bad += 1; errors.push(`claims[${i}] (${c.id}) якорь ${j + 1}: ${r.reason}`); }
        evidence.push({ ...ev, ok: r.ok, badge: r.badge, reason: r.reason });
      });
      const flags = [];
      const rs = evidence.map((e) => ({ kind: e.type, ok: e.ok, badge: e.badge }));
      let badge = claimBadge(rs, card.badge_policy);
      const nums = unsupportedNumbers(c.text, allowed);
      if (nums.length) { flags.push(`unsupported_number:${nums.join(',')}`); if (BADGE_RANK[badge] > BADGE_RANK['🔵']) badge = '🔵'; }
      if (c.claimed_badge !== undefined && BADGE_RANK[c.claimed_badge] > BADGE_RANK[badge]) flags.push(`overclaimed_badge:${c.claimed_badge}>${badge}`);
      const gid = `${card.id}.${c.id}`;
      if (lenient && bad > 0) { dropped.push({ id: gid, reason: 'якорь не подтверждён' }); return; }
      claimBadges.set(gid, badge);
      claims.push({ id: gid, local: c.id, text: c.text, badge, evidence, flags });
    });
    // Якоря внутри полей (смещённая речь): тоже цитаты.
    let fields = input.fields;
    if (typeof spec.extraEvidence === 'function') {
      const evs = spec.extraEvidence(fields);
      const badIdx = [];
      evs.forEach((ev, i) => {
        stats.quote_total += 1;
        const r = verifyEvidence(ev, { lines: ctx.lines, toolOutputs: st.called, claimBadges });
        if (r.ok) stats.quote_ok += 1; else { badIdx.push(i); errors.push(`fields.displacements[${i}]: ${r.reason}`); }
      });
      if (lenient && badIdx.length) fields = { ...fields, displacements: fields.displacements.filter((_, i) => !badIdx.includes(i)) };
    }
    const hard = [];
    if (typeof spec.consistency === 'function') spec.consistency(fields, st.called).forEach((e) => hard.push(`согласованность: ${e}`));
    if (spec.requiresMeasureTool) {
      const out = st.called.get(spec.requiresMeasureTool);
      if (out && out.status === 'ok' && !claims.some((c) => c.evidence.some((e) => e.type === 'measure' && e.tool === spec.requiresMeasureTool && e.ok))) hard.push(`нужна хотя бы одна опора на замер ${spec.requiresMeasureTool}`);
    }
    const flagsAll = [];
    const sumNums = unsupportedNumbers(input.summary, allowed);
    if (sumNums.length) flagsAll.push(`summary_unsupported_number:${sumNums.join(',')}`);
    const all = [...hard, ...errors];
    return { errors: lenient ? hard : all, hard: hard.length > 0, claims, fields, dropped, stats, flags: flagsAll, softErrors: errors, summary: input.summary, limits: input.limits };
  }

  // Исчерпаны повторы: если остались только мягкие ошибки (якоря) — отдаём сохранившееся (degraded), иначе провал.
  finalize(card, spec, schema, st, ctx, upstreamBadges, upstreamTexts, t0, kind) {
    const elapsed = this.now() - t0;
    if (typeof spec.evaluate === 'function') return this.failed(card, st, kind, `ответ не прошёл проверки: ${summarize(st.lastErrors, 6)}`, elapsed);
    if (st.lastCandidate !== undefined) {
      const lenient = this.evaluate(card, spec, schema, st.lastCandidate, st, ctx, upstreamBadges, upstreamTexts, true);
      if (lenient.errors.length === 0 && lenient.claims !== undefined && (lenient.claims.length > 0 || lenient.dropped.length === 0)) {
        return this.success(card, spec, st, lenient, 'degraded', lenient.softErrors || [], elapsed);
      }
      st.lastErrors = lenient.errors.length ? lenient.errors : st.lastErrors;
    }
    return this.failed(card, st, kind, `ответ не прошёл проверки: ${summarize(st.lastErrors, 6)}`, elapsed);
  }

  success(card, spec, st, ev, status, notes, elapsed) {
    const anchored = ev.claims.filter((c) => c.evidence.some((e) => e.ok));
    return Object.freeze({
      id: card.id, label: card.label_ru, status, reason: status === 'degraded' ? `часть утверждений отброшена: ${notes.slice(0, 3).join('; ')}` : '', kind: '',
      model: st.model, fallback: st.fallback, usage: st.usage, calls: st.nCalls, rounds: st.rounds, submit_attempts: st.submitAttempts,
      tools_called: st.calls, summary: ev.summary, limits: ev.limits, fields: ev.fields, claims: ev.claims, dropped: ev.dropped, flags: ev.flags, stats: ev.stats,
      card_badge: ev.claims.length ? (anchored.length ? strongest(anchored.map((c) => c.badge)) : '🔵') : '⛔', latency_ms: Math.round(elapsed)
    });
  }

  failed(card, st, kind, reason, elapsed) {
    return Object.freeze({
      id: card.id, label: card.label_ru, status: 'failed', reason, kind, model: st.model, fallback: st.fallback, usage: st.usage, calls: st.nCalls,
      rounds: st.rounds, submit_attempts: st.submitAttempts, tools_called: st.calls, summary: '', limits: [], fields: undefined, claims: [], dropped: [], flags: [],
      stats: { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0, claim_total: 0, claim_ok: 0 }, card_badge: '⛔', latency_ms: Math.round(elapsed)
    });
  }
}
