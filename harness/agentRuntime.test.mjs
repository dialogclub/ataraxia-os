import { readFileSync } from 'node:fs';
import { Harness, assert } from './Harness.mjs';
import { GOLDEN, BASE, CARDS, REG, makeToolbox, toolUse } from '../fixtures/agents/golden.mjs';
import { AgentRunner, LIMITS } from '../core/agents/agentRunner.mjs';
import { HttpModelClient, ResilientClient, ScriptedClient, ModelError, API_VERSION, DEFAULT_ENDPOINT } from '../core/agents/modelClient.mjs';
import { judge } from '../core/agents/synthesis.mjs';

const passport = JSON.parse(readFileSync(new URL('./agentRuntime.harness.json', import.meta.url), 'utf8'));
const GOOD = () => GOLDEN.Requestor.payload();
const T = (i) => ({ content: [toolUse(`t${i === undefined ? 1 : i}`, 'lexisTool', {})], stop_reason: 'tool_use' });
const S = (payload) => ({ content: [toolUse('s1', 'submit_result', payload)], stop_reason: 'tool_use' });
const ERR = (kind, extra) => ({ error: { kind, ...(extra === undefined ? {} : extra) } });

function rig(steps, options) {
  const o = options === undefined ? {} : options;
  const inner = new ScriptedClient(steps);
  const sleeps = [];
  const client = new ResilientClient(inner, { retries: o.retries, sleep: async (ms) => { sleeps.push(ms); } });
  const runner = new AgentRunner(client, makeToolbox(), { now: () => 0 });
  const card = CARDS.get('Requestor');
  const ctx = () => ({ lines: BASE.lines, focus: 'К.', mode: 'session', cascade: BASE.cascade, chain: o.chain === undefined ? ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-6'] : o.chain, prompt: { preamble: REG.prompts.preamble, task: REG.prompts.tasks.Requestor }, upstream: [], effort: 'medium' });
  return { inner, client, runner, card, sleeps, run: () => runner.run(card, ctx()) };
}

const okBody = () => ({ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, model: 'claude-opus-5-5' });
function stubFetch(status, body, headers) {
  const seen = [];
  const f = async (url, init) => { seen.push({ url, init }); return { ok: status >= 200 && status < 300, status, headers: { get: (k) => (headers === undefined || headers[k.toLowerCase()] === undefined ? null : headers[k.toLowerCase()]) }, json: async () => body }; };
  return { f, seen };
}
async function kindOf(client, req) {
  try { await client.complete(req); return 'ok'; } catch (e) { return e instanceof ModelError ? e : `other:${e.message}`; }
}
const REQ = { model: 'claude-opus-5-5', system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 };

export const harness = new Harness(passport, [
  // ---------- ReAct и приём ответа ----------
  Harness.custom('ReAct: ≤ 3 раундов инструментов; четвёртый отклоняется, ответ всё равно принимается', async () => {
    const r = rig([T(1), T(2), T(3), T(4), S(GOOD())]);
    const res = await r.run();
    assert(res.status === 'ok', `${res.status}: ${res.reason}`);
    assert(res.rounds === 4, `раундов ${res.rounds}`);
    const lastUser = r.inner.calls[4].messages[r.inner.calls[4].messages.length - 1].content;
    assert(lastUser.some((b) => b.is_error && /Лимит ReAct/.test(b.content)), 'нет сообщения о лимите ReAct');
    return `раундов ${res.rounds}, лимит ${LIMITS.toolRounds} обозначен ошибкой инструмента`;
  }),
  Harness.custom('невалидный submit_result: не более 2 повторов, затем провал; на 2-й попытке — успех', async () => {
    const bad = { summary: 'x' };
    const fail = await rig([T(), S(bad), S(bad), S(bad)]).run();
    assert(fail.status === 'failed' && fail.kind === 'invalid' && fail.submit_attempts === 3, `${fail.status}/${fail.kind}/${fail.submit_attempts}`);
    const okr = await rig([T(), S(bad), S(GOOD())]).run();
    assert(okr.status === 'ok' && okr.submit_attempts === 1, `${okr.status}/${okr.submit_attempts}`);
    return `провал после ${fail.submit_attempts} попыток; успех со 2-й (повторов ${okr.submit_attempts})`;
  }),
  Harness.custom('ответ текстом без submit_result: напоминание, затем принято', async () => {
    const res = await rig([T(), { content: [{ type: 'text', text: 'Готово, вот мой вывод…' }], stop_reason: 'end_turn' }, S(GOOD())]).run();
    assert(res.status === 'ok' && res.submit_attempts === 1, `${res.status}/${res.submit_attempts}`);
    return 'напоминание отправлено, затем ok';
  }),
  Harness.custom('самооценка бейджа: без якоря claimed_badge 🟢 → 🔵 + флаг; с цитатой 🟢 → 🟡; Судья снижает честность', async () => {
    const p = GOOD();
    p.claims[0].claimed_badge = '🟢';
    p.claims.push({ id: 'c4', text: 'Скрытая гипотеза без якоря.', evidence: [], claimed_badge: '🟢' });
    const res = await rig([T(), S(p)]).run();
    assert(res.status === 'ok', res.reason);
    const c1 = res.claims.find((c) => c.local === 'c1'); const c4 = res.claims.find((c) => c.local === 'c4');
    assert(c1.badge === '🟡' && c1.flags.some((f) => f.startsWith('overclaimed_badge')), `c1 ${c1.badge} ${c1.flags}`);
    assert(c4.badge === '🔵' && c4.flags.some((f) => f.startsWith('overclaimed_badge')), `c4 ${c4.badge} ${c4.flags}`);
    const j = judge(res);
    assert(j.rubric.badge_honesty.value < 1, `честность ${j.rubric.badge_honesty.value}`);
    return `c1 ${c1.badge}, c4 ${c4.badge}, честность бейджей ${j.rubric.badge_honesty.value}`;
  }),
  Harness.custom('якорь-замер на несуществующий путь и на невызванный инструмент отклоняется', async () => {
    const p1 = GOOD(); p1.claims[2].evidence = [{ type: 'measure', tool: 'lexisTool', path: 'нет.такого.пути' }];
    const r1 = await rig([T(), S(p1), S(p1), S(p1)]).run();
    assert(r1.status === 'degraded' && !r1.claims.some((c) => c.local === 'c3'), `${r1.status}: c3 должен быть отброшен`);
    const p2 = GOOD(); p2.claims[2].evidence = [{ type: 'measure', tool: 'cascadeEngine', path: 'B' }];
    const r2 = await rig([T(), S(p2), S(p2), S(p2)]).run();
    assert(r2.status === 'degraded' && !r2.claims.some((c) => c.local === 'c3'), 'невызванный инструмент принят');
    return 'c3 отброшен в обоих случаях (degraded)';
  }),
  Harness.custom('недоступный агенту и неизвестный инструменты возвращают is_error', async () => {
    const r = rig([{ content: [toolUse('a', 'cascadeEngine', {}), toolUse('b', 'dropDatabase', {}), toolUse('c', 'lexisTool', {})], stop_reason: 'tool_use' }, S(GOOD())]);
    const res = await r.run();
    assert(res.status === 'ok', res.reason);
    const results = r.inner.calls[1].messages[r.inner.calls[1].messages.length - 1].content;
    assert(results.length === 3 && results[0].is_error && results[1].is_error && !results[2].is_error, 'ожидалось: ошибка, ошибка, успех в одном сообщении');
    return 'все tool_result в одном сообщении: 2 ошибки, 1 успех';
  }),
  Harness.custom('история только дописывается; блоки ассистента (в т.ч. thinking) возвращаются без правок', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig-1' };
    const r = rig([{ content: [thinking, toolUse('t1', 'lexisTool', {})], stop_reason: 'tool_use' }, S(GOOD())]);
    await r.run();
    const [c1, c2] = r.inner.calls;
    assert(JSON.stringify(c2.messages.slice(0, c1.messages.length)) === JSON.stringify(c1.messages), 'префикс истории изменился');
    const asst = c2.messages[1].content;
    assert(JSON.stringify(asst[0]) === JSON.stringify(thinking), 'thinking-блок изменён или потерян');
    return `префикс ${c1.messages.length} сообщений неизменен; thinking возвращён как есть`;
  }),
  Harness.custom('запрос: effort и система передаются, forced tool_choice не используется', async () => {
    const r = rig([T(), S(GOOD())]);
    await r.run();
    assert(r.inner.calls.every((c) => c.effort === 'medium' && c.tools.includes('submit_result')), 'effort/tools');
    assert(r.inner.calls[0].tools.includes('lexisTool') && !r.inner.calls[0].tools.includes('cascadeEngine'), 'набор инструментов агента неверен');
    return `tools: ${r.inner.calls[0].tools.join(', ')}`;
  }),
  // ---------- Транспорт: повторы, откат, предохранитель ----------
  Harness.custom('429 дважды → успех; паузы 1000 и 2000 мс; retry-after приоритетнее', async () => {
    const r = rig([ERR('rate'), ERR('rate'), T(), S(GOOD())]);
    const res = await r.run();
    assert(res.status === 'ok' && JSON.stringify(r.sleeps) === '[1000,2000]', `${res.status} ${r.sleeps}`);
    const r2 = rig([ERR('rate', { retryAfterMs: 7000 }), T(), S(GOOD())]);
    await r2.run();
    assert(JSON.stringify(r2.sleeps) === '[7000]', `retry-after ${r2.sleeps}`);
    return `паузы ${r.sleeps} · retry-after ${r2.sleeps}`;
  }),
  Harness.custom('529 ×3 на основной модели → откат на следующую; флаг fallback', async () => {
    const r = rig([ERR('overloaded'), ERR('overloaded'), ERR('overloaded'), T(), S(GOOD())]);
    const res = await r.run();
    assert(res.status === 'ok' && res.fallback === true && res.model === 'claude-sonnet-5-5', `${res.status} ${res.fallback} ${res.model}`);
    assert(r.inner.calls.slice(0, 3).every((c) => c.model === 'claude-opus-5-5') && r.inner.calls[3].model === 'claude-sonnet-5-5', 'порядок моделей');
    assert(r.inner.calls[4].model === 'claude-sonnet-5-5', 'после отката модель не возвращается на основную в рамках запуска');
    return `откат ${r.inner.calls[0].model} → ${res.model}`;
  }),
  Harness.custom('отказ модели (refusal) → немедленный откат без повторов', async () => {
    const r = rig([ERR('refusal', { category: 'bio' }), T(), S(GOOD())]);
    const res = await r.run();
    assert(res.status === 'ok' && res.fallback && r.sleeps.length === 0, `${res.status} ${res.fallback} паузы ${r.sleeps}`);
    return `модель ${res.model}, пауз ${r.sleeps.length}`;
  }),
  Harness.custom('auth: провал без повторов; предохранитель — следующий вызов не доходит до модели', async () => {
    const r = rig([ERR('auth', { status: 401 })]);
    const first = await r.run();
    assert(first.status === 'failed' && first.kind === 'auth' && r.inner.calls.length === 1, `${first.status}/${first.kind}/${r.inner.calls.length}`);
    const second = await r.run();
    assert(second.status === 'failed' && second.kind === 'auth' && r.inner.calls.length === 1, 'повторный вызов дошёл до модели');
    return 'вызовов модели: 1 на два запуска';
  }),
  Harness.custom('network: 2 попытки, затем предохранитель', async () => {
    const r = rig([ERR('network'), ERR('network')]);
    const res = await r.run();
    assert(res.status === 'failed' && res.kind === 'network' && r.inner.calls.length === 2 && r.client.dead() !== undefined, `${res.kind}/${r.inner.calls.length}`);
    return `попыток ${r.inner.calls.length}, клиент помечен недоступным`;
  }),
  Harness.custom('timeout повторяется; bad_request и truncated — без повторов', async () => {
    const t = rig([ERR('timeout'), T(), S(GOOD())]);
    assert((await t.run()).status === 'ok' && t.sleeps.length === 1, 'timeout не повторён');
    const b = rig([ERR('bad_request', { status: 400 })]);
    const rb = await b.run();
    assert(rb.status === 'failed' && rb.kind === 'bad_request' && b.inner.calls.length === 1, 'bad_request повторялся');
    const x = rig([ERR('truncated')]);
    const rx = await x.run();
    assert(rx.status === 'failed' && rx.kind === 'truncated' && x.inner.calls.length === 1, 'truncated повторялся');
    return 'timeout +1 повтор; bad_request/truncated — 1 вызов';
  }),
  Harness.custom('вся цепочка перегружена: 3 модели × 3 попытки, затем провал overloaded', async () => {
    const r = rig(Array.from({ length: 9 }, () => ERR('overloaded')));
    const res = await r.run();
    assert(res.status === 'failed' && res.kind === 'overloaded' && r.inner.calls.length === 9, `${res.kind}/${r.inner.calls.length}`);
    return `вызовов ${r.inner.calls.length}; пауз ${r.sleeps.length}`;
  }),
  // ---------- HTTP-клиент (форма запроса и разбор ответов) ----------
  Harness.custom('HttpModelClient: форма запроса — версия API, ключ, effort; без temperature/top_p/top_k/thinking', async () => {
    const { f, seen } = stubFetch(200, okBody());
    const c = new HttpModelClient({ fetchImpl: f, apiKey: 'sk-test' });
    const res = await c.complete({ ...REQ, tools: [{ name: 'x', description: 'd', input_schema: { type: 'object' } }], effort: 'medium' });
    const { url, init } = seen[0];
    const body = JSON.parse(init.body);
    assert(url === DEFAULT_ENDPOINT && init.method === 'POST', 'URL/метод');
    assert(init.headers['anthropic-version'] === API_VERSION && API_VERSION === '2026-10-21', 'версия API');
    assert(init.headers['x-api-key'] === 'sk-test' && init.headers['content-type'] === 'application/json', 'заголовки');
    assert(body.output_config.effort === 'medium' && body.max_tokens === 100, 'effort/max_tokens');
    ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice'].forEach((k) => assert(!(k in body), `запрещённый параметр ${k}`));
    assert(res.stop_reason === 'end_turn' && res.model === 'claude-opus-5-5', 'ответ не нормализован');
    const noKey = stubFetch(200, okBody());
    await new HttpModelClient({ fetchImpl: noKey.f }).complete(REQ);
    assert(!('x-api-key' in noKey.seen[0].init.headers), 'x-api-key без ключа (шлюз песочницы подставляет сам)');
    return `версия ${API_VERSION}; тело: ${Object.keys(body).join(', ')}`;
  }),
  Harness.custom('HttpModelClient: классификация ошибок и разбор refusal/max_tokens/сети/таймаута', async () => {
    const cases = [
      [401, { error: { message: 'bad key' } }, 'auth'], [403, {}, 'auth'], [429, {}, 'rate'], [529, {}, 'overloaded'], [500, {}, 'overloaded'],
      [404, { error: { message: 'model: claude-x not found' } }, 'model_unavailable'], [400, { error: { message: 'model is not supported' } }, 'model_unavailable'], [400, { error: { message: 'max_tokens too large' } }, 'bad_request']
    ];
    for (const [status, body, kind] of cases) {
      const e = await kindOf(new HttpModelClient({ fetchImpl: stubFetch(status, body).f }), REQ);
      assert(e.kind === kind, `HTTP ${status}: ${e.kind} ≠ ${kind}`);
    }
    const ra = await kindOf(new HttpModelClient({ fetchImpl: stubFetch(429, {}, { 'retry-after': '3' }).f }), REQ);
    assert(ra.retryAfterMs === 3000, `retry-after ${ra.retryAfterMs}`);
    const ref = await kindOf(new HttpModelClient({ fetchImpl: stubFetch(200, { ...okBody(), stop_reason: 'refusal', stop_details: { category: 'cyber' } }).f }), REQ);
    assert(ref.kind === 'refusal' && ref.category === 'cyber', 'refusal');
    const tr = await kindOf(new HttpModelClient({ fetchImpl: stubFetch(200, { ...okBody(), stop_reason: 'max_tokens' }).f }), REQ);
    assert(tr.kind === 'truncated', 'max_tokens');
    const net = await kindOf(new HttpModelClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), REQ);
    assert(net.kind === 'network', 'network');
    const slow = await kindOf(new HttpModelClient({ timeoutMs: 20, fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }), REQ);
    assert(slow.kind === 'timeout', 'timeout');
    const bad = await kindOf(new HttpModelClient({ fetchImpl: stubFetch(200, { foo: 1 }).f }), REQ);
    assert(bad.kind === 'invalid_response', 'ответ без content');
    return `${cases.length} кодов HTTP + retry-after + refusal + max_tokens + сеть + таймаут + пустой ответ`;
  }),
  Harness.custom('PII не попадает в промпт агента: маска применяется до L2 (проверка пользовательского сообщения)', async () => {
    const { maskPii } = await import('../core/pii.mjs');
    const lines = BASE.lines.map((l, i) => (i === 1 ? { ...l, text: maskPii('Звоните +380 67 123 45 67 или a.b@mail.ua, Иван сказал так.', { knownNames: ['Иван'] }).text } : l));
    const inner = new ScriptedClient([T(), S(GOOD())]);
    const runner = new AgentRunner(new ResilientClient(inner, { sleep: async () => {} }), makeToolbox(), { now: () => 0 });
    await runner.run(CARDS.get('Requestor'), { lines, focus: 'К.', mode: 'session', cascade: BASE.cascade, chain: ['claude-opus-5-5'], prompt: { preamble: REG.prompts.preamble, task: '' }, upstream: [] });
    const sent = JSON.stringify(inner.calls[0].messages);
    assert(!/380|@mail|Иван/.test(sent) && /\[PHONE\]/.test(sent) && /\[EMAIL\]/.test(sent) && /\[ИМЯ1\]/.test(sent), 'в промпт попали персональные данные');
    return 'телефон, email и имя из списка заменены метками';
  })
]);
