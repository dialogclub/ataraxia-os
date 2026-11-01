// L3: Синтез-рефлектор и Тера-навигатор (LLM-агенты со ссылками на утверждения), консенсус k=3, Судья (детерминированная рубрика).
// Рефлектор не получает права «добавить от себя»: каждый вердикт и ось обязаны ссылаться на существующие id утверждений,
// бейдж вердикта = самый слабый бейдж ссылок, числа — только из утверждений. Судья не виден клиенту (журнал «Агенты»).
import { allowedNumbers, unsupportedNumbers, weakest, BADGE_RANK, normText } from './evidence.mjs';
import { validate, summarize } from '../jsonSchema.mjs';
import { Param } from '../param.mjs';

const REFS = { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', maxLength: 60 } };
const ID = { type: 'string', pattern: '^[a-z0-9_]{1,24}$' };
const AXES = ['сознание', 'тело', 'социальное поле', 'нарратив'];
export const MODULES = ['launch', 'analysis', 'profile', 'speech', 'tests', 'body', 'practice', 'clinic', 'memory', 'agents', 'synthesis', 'narrative', 'none'];

export const REFLECTOR_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdicts', 'axes', 'contradictions', 'limits'],
  properties: {
    verdicts: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'claim_refs'], properties: { id: ID, text: { type: 'string', minLength: 3, maxLength: 320 }, claim_refs: REFS } } },
    axes: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['axis', 'text', 'claim_refs'], properties: { axis: { enum: AXES }, text: { type: 'string', minLength: 3, maxLength: 320 }, claim_refs: REFS } } },
    contradictions: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['a', 'b', 'note'], properties: { a: { type: 'string', maxLength: 60 }, b: { type: 'string', maxLength: 60 }, note: { type: 'string', maxLength: 240 } } } },
    limits: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 200 } }
  }
};

export const THERA_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['plan', 'next_question', 'limits'],
  properties: {
    plan: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['step', 'why', 'claim_refs', 'module'], properties: { step: { type: 'string', minLength: 3, maxLength: 240 }, why: { type: 'string', maxLength: 240 }, claim_refs: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 60 } }, module: { enum: MODULES } } } },
    next_question: { type: ['string', 'null'], maxLength: 300 },
    limits: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 200 } }
  }
};

// Реестр утверждений для ссылок: Map id → { badge, text }.
export function claimIndexOf(results) {
  const m = new Map();
  results.filter((r) => r.status === 'ok' || r.status === 'degraded').forEach((r) => r.claims.forEach((c) => m.set(c.id, { badge: c.badge, text: c.text, agent: r.id })));
  return m;
}

function checkRefs(refs, index, where, errors) {
  refs.forEach((r) => { if (!index.has(r)) errors.push(`${where}: ссылка ${r} не найдена среди утверждений`); });
}

function refsBadge(refs, index) {
  return weakest(refs.map((r) => (index.has(r) ? index.get(r).badge : '⛔')));
}

function claimsListing(index) {
  return [...index.entries()].map(([id, c]) => `- ${id} ${c.badge}: ${c.text}`).join('\n');
}

function numberGuard(texts, ctx) {
  const allowed = allowedNumbers(new Map(), ctx.lines || [], [...ctx.claimIndex.values()].map((c) => c.text));
  return texts.flatMap((t) => unsupportedNumbers(t, allowed));
}

export const REFLECTOR_SPEC = Object.freeze({
  schema: REFLECTOR_SCHEMA,
  userMessage: (card, ctx) => `Утверждения агентов (используй только эти id в claim_refs):\n${claimsListing(ctx.claimIndex)}\n\nСведи их в вердикты и четыре оси «изнутри наружу» (сознание, тело, социальное поле, нарратив), отметь противоречия и передай через submit_result.${ctx.l1Notes ? `\n\nЗамечания по каналам: ${ctx.l1Notes}` : ''}`,
  evaluate(card, schema, input, st, ctx) {
    const errors = validate(schema, input).map((e) => `схема: ${e}`);
    if (errors.length) return { errors, hard: true };
    const idx = ctx.claimIndex;
    input.verdicts.forEach((v, i) => checkRefs(v.claim_refs, idx, `verdicts[${i}]`, errors));
    input.axes.forEach((a, i) => checkRefs(a.claim_refs, idx, `axes[${i}]`, errors));
    input.contradictions.forEach((c, i) => checkRefs([c.a, c.b], idx, `contradictions[${i}]`, errors));
    const dupAxes = input.axes.map((a) => a.axis).filter((a, i, arr) => arr.indexOf(a) !== i);
    if (dupAxes.length) errors.push(`ось повторяется: ${dupAxes.join(', ')}`);
    if (errors.length) return { errors, hard: true };
    const nums = numberGuard([...input.verdicts.map((v) => v.text), ...input.axes.map((a) => a.text)], ctx);
    const verdicts = input.verdicts.map((v) => ({ ...v, badge: refsBadge(v.claim_refs, idx), flags: numberGuard([v.text], ctx).length ? ['unsupported_number'] : [] }));
    const axes = input.axes.map((a) => ({ ...a, badge: refsBadge(a.claim_refs, idx), flags: numberGuard([a.text], ctx).length ? ['unsupported_number'] : [] }));
    verdicts.concat(axes).forEach((x) => { if (x.flags.length && BADGE_RANK[x.badge] > BADGE_RANK['🔵']) x.badge = '🔵'; });
    return { errors: [], hard: false, verdicts, axes, contradictions: input.contradictions, limits: input.limits, unsupported: nums };
  },
  assemble: (card, st, ev, elapsed) => Object.freeze({ id: card.id, label: card.label_ru, status: 'ok', reason: '', kind: '', model: st.model, fallback: st.fallback, usage: st.usage, calls: st.nCalls, rounds: st.rounds, submit_attempts: st.submitAttempts, tools_called: st.calls, verdicts: ev.verdicts, axes: ev.axes, contradictions: ev.contradictions, limits: ev.limits, flags: ev.unsupported.length ? [`unsupported_number:${ev.unsupported.join(',')}`] : [], latency_ms: Math.round(elapsed), card_badge: ev.verdicts.length ? ev.verdicts.reduce((a, v) => (BADGE_RANK[v.badge] > BADGE_RANK[a] ? v.badge : a), '🔵') : '⛔' })
});

export const THERA_SPEC = Object.freeze({
  schema: THERA_SCHEMA,
  userMessage: (card, ctx) => `Утверждения и вердикты (используй только эти id в claim_refs):\n${claimsListing(ctx.claimIndex)}\n\nСоставь план следующего шага для клинициста и передай через submit_result.`,
  evaluate(card, schema, input, st, ctx) {
    const errors = validate(schema, input).map((e) => `схема: ${e}`);
    if (errors.length) return { errors, hard: true };
    input.plan.forEach((p, i) => checkRefs(p.claim_refs, ctx.claimIndex, `plan[${i}]`, errors));
    if (errors.length) return { errors, hard: true };
    const plan = input.plan.map((p) => {
      const bad = numberGuard([p.step, p.why], ctx).length > 0;
      const b = refsBadge(p.claim_refs, ctx.claimIndex);
      return { ...p, badge: bad && BADGE_RANK[b] > BADGE_RANK['🔵'] ? '🔵' : b, flags: bad ? ['unsupported_number'] : [] };
    });
    return { errors: [], hard: false, plan, next_question: input.next_question, limits: input.limits };
  },
  assemble: (card, st, ev, elapsed) => Object.freeze({ id: card.id, label: card.label_ru, status: 'ok', reason: '', kind: '', model: st.model, fallback: st.fallback, usage: st.usage, calls: st.nCalls, rounds: st.rounds, submit_attempts: st.submitAttempts, tools_called: st.calls, plan: ev.plan, next_question: ev.next_question, limits: ev.limits, flags: [], latency_ms: Math.round(elapsed), card_badge: ev.plan.length ? ev.plan.reduce((a, p) => (BADGE_RANK[p.badge] > BADGE_RANK[a] ? p.badge : a), '🔵') : '⛔' })
});

// Консенсус k выборок: элемент устойчив, если его ключ встретился в большинстве успешных выборок; остальные — 🔵 «нестабильно».
export function consensus(samples, pick, keyOf) {
  const ok = samples.filter((s) => s !== undefined);
  const need = Math.floor(ok.length / 2) + 1;
  const seen = new Map();
  ok.forEach((s) => { new Set(pick(s).map(keyOf)).forEach((k) => seen.set(k, (seen.get(k) || 0) + 1)); });
  const stable = []; const unstable = []; const used = new Set();
  ok.forEach((s) => pick(s).forEach((item) => {
    const k = keyOf(item);
    if (used.has(k)) return;
    used.add(k);
    if (seen.get(k) >= need) stable.push({ ...item, votes: seen.get(k), of: ok.length }); else unstable.push({ ...item, badge: '🔵', flags: [...(item.flags || []), 'unstable_k'], votes: seen.get(k), of: ok.length });
  }));
  return { stable, unstable, need, n: ok.length };
}

export const verdictKey = (v) => [...v.claim_refs].sort().join('|');
export const axisKey = (a) => `${a.axis}:${[...a.claim_refs].sort().join('|')}`;

const METHOD_TERMS = /\b(?:Theromata|Alligantia|Phobon|Dominix|Agonix|Zimbardo|Gallup|VAAL|PHQ|GAD|SCL|MBI|TAS|IPIP|OCEAN|Big Five|ZTPI|EMDR|PNEUMA|Stanley-Brown|LOCAL|MCP|ABC|Lowen|Reich|Berne|Karpman|Gottman|Panksepp)\b/gu;

// --- Судья: детерминированная рубрика (точность цитат · якоря · полнота · язык · честность бейджа и чисел) ---
const P = (v, note) => (Number.isFinite(v) ? Param.measured(Number(v.toFixed(3)), 'share', [0, 1], 'Judge', '1.0', note).json() : Param.missing('share', [0, 1], 'Judge', '1.0', note).json());

export function judge(result) {
  if (result.status === 'failed' || result.status === 'skipped') return { agent: result.id, status: 'n/a', overall: P(Number.NaN, result.reason), rubric: {} };
  const claims = result.claims || [];
  const st = result.stats || { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0 };
  const anchors = st.quote_total + st.measure_total;
  const anchoredOk = st.quote_ok + st.measure_ok;
  const anchored = claims.filter((c) => c.evidence.some((e) => e.ok)).length;
  const fieldVals = result.fields ? Object.values(result.fields) : [];
  const filled = fieldVals.filter((v) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
  const text = [result.summary || '', ...claims.map((c) => c.text)].join(' ');
  // Термины методологии и аббревиатуры шкал сохраняются как в первоисточнике (латиницей) и язык не портят.
  const letters = text.replace(METHOD_TERMS, ' ').match(/\p{L}/gu) || [];
  const cyr = letters.filter((ch) => /[а-яёіїєґ]/iu.test(ch)).length;
  const rubric = {
    citation_accuracy: P(anchors ? anchoredOk / anchors : Number.NaN, anchors ? `${anchoredOk} из ${anchors} якорей подтверждены` : 'якорей нет'),
    anchoring: P(claims.length ? anchored / claims.length : Number.NaN, claims.length ? `${anchored} из ${claims.length} утверждений с якорем` : 'утверждений нет'),
    completeness: P(fieldVals.length ? filled / fieldVals.length : Number.NaN, `${filled} из ${fieldVals.length} полей заполнены`),
    language: P(letters.length ? cyr / letters.length : Number.NaN, 'доля кириллицы в тексте'),
    badge_honesty: P(claims.length ? 1 - claims.filter((c) => c.flags.some((f) => f.startsWith('overclaimed_badge'))).length / claims.length : Number.NaN, 'самооценка бейджа не выше назначенного'),
    number_honesty: P(claims.length ? 1 - claims.filter((c) => c.flags.some((f) => f.startsWith('unsupported_number'))).length / claims.length : Number.NaN, 'числа происходят из инструментов/транскрипта')
  };
  const vals = Object.values(rubric).map((p) => p.value).filter((v) => v !== null);
  return { agent: result.id, status: 'ok', overall: P(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : Number.NaN, 'среднее по определённым пунктам рубрики'), rubric, hidden_from_client: true };
}
