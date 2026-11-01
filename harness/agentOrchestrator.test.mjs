import { readFileSync } from 'node:fs';
import { Harness, assert } from './Harness.mjs';
import { GOLDEN, BASE, CARDS, GoldenClient, makeOrchestrator, DOMAIN_ORDER, stable, toolUse } from '../fixtures/agents/golden.mjs';
import { ModelError } from '../core/agents/modelClient.mjs';
import { applyToScp, chainOf } from '../core/agents/orchestrator.mjs';
import { Scp } from '../core/scp.mjs';
import { judge } from '../core/agents/synthesis.mjs';

const passport = JSON.parse(readFileSync(new URL('./agentOrchestrator.harness.json', import.meta.url), 'utf8'));
const fresh = () => Scp.fresh({ mode: 'session', model: 'claude-opus-5-5', created: '2026-11-01T00:00:00.000Z', input_hash: 'test', alias: 'К.' });
const failWith = (kind, status) => () => { throw new ModelError(kind, `${kind} (тест)`, { status }); };

export const harness = new Harness(passport, [
  Harness.custom('DAG: Insight после Requestor и Obstacle, Libertas после Obstacle, Qualitas последним', async () => {
    const gc = new GoldenClient();
    const { orch } = makeOrchestrator(gc);
    await orch.runDomain(DOMAIN_ORDER, BASE);
    const first = (id) => gc.calls.findIndex((c) => c.id === id);
    const last = (id) => gc.calls.map((c) => c.id).lastIndexOf(id);
    assert(first('Insight') > last('Requestor') && first('Insight') > last('Obstacle'), 'Insight раньше зависимостей');
    assert(first('Libertas') > last('Obstacle'), 'Libertas раньше Obstacle');
    assert(first('Qualitas') > last('Libertas') && first('Qualitas') > last('Insight'), 'Qualitas раньше зависимостей');
    return `порядок первых вызовов: ${[...new Set(gc.calls.map((c) => c.id))].join(' → ')}`;
  }),
  Harness.custom('полный отчёт: 13 агентов ok, бейджи по политике, итоговые вызовы модели', async () => {
    const gc = new GoldenClient();
    const { orch } = makeOrchestrator(gc);
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    assert(res.size === 13 && [...res.values()].every((r) => r.status === 'ok'), `статусы ${[...res.values()].map((r) => r.status).join(',')}`);
    const badges = [...res.values()].map((r) => r.card_badge).join('');
    const expected = DOMAIN_ORDER.map((id) => GOLDEN[id].expect.card);
    assert([...res.values()].every((r) => r.card_badge === GOLDEN[r.id].expect.card), `бейджи карточек ${badges} ≠ ${expected.join('')}`);
    return `13/13 ok · вызовов модели ${gc.calls.length}`;
  }),
  Harness.custom('ошибка одного агента не прячет результаты остальных', async () => {
    const { orch } = makeOrchestrator(new GoldenClient({ overrides: { Veritas: failWith('bad_request', 400) } }));
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    assert(res.get('Veritas').status === 'failed' && res.get('Veritas').kind === 'bad_request', 'Veritas');
    assert([...res.values()].filter((r) => r.status === 'ok').length === 12, 'остальные 12 должны быть ok');
    return 'Veritas failed/bad_request; ok: 12';
  }),
  Harness.custom('все вышестоящие провалились → зависимые пропускаются (skipped), а не работают вслепую', async () => {
    const { orch } = makeOrchestrator(new GoldenClient({ overrides: { Requestor: failWith('bad_request', 400), Obstacle: failWith('bad_request', 400) } }));
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    ['Insight', 'Libertas', 'Qualitas'].forEach((id) => assert(res.get(id).status === 'skipped', `${id}: ${res.get(id).status}`));
    assert(res.get('Qualitas').reason.includes('вышестоящ'), 'причина пропуска');
    return 'Insight/Libertas/Qualitas → skipped';
  }),
  Harness.custom('нет API (auth): каждый агент ⛔ с причиной, к модели доходит не больше параллелизма', async () => {
    let n = 0;
    const inner = { complete: async () => { n += 1; throw new ModelError('auth', 'шлюз не подставил ключ', { status: 401 }); } };
    const { orch } = makeOrchestrator(inner, { concurrency: 4 });
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    assert([...res.values()].every((r) => (r.status === 'failed' && r.kind === 'auth') || r.status === 'skipped'), 'статусы');
    assert(n <= 4, `вызовов модели ${n} > 4`);
    const syn = await orch.synthesize(BASE, res);
    assert(syn.reflector.status === 'skipped' && syn.thera.status === 'skipped', 'синтез без утверждений должен быть пропущен');
    return `вызовов модели: ${n}; failed ${[...res.values()].filter((r) => r.status === 'failed').length}, skipped ${[...res.values()].filter((r) => r.status === 'skipped').length}`;
  }),
  Harness.custom('повтор одного агента: вызывается только он, остальные результаты не затронуты', async () => {
    const gc = new GoldenClient();
    const { orch } = makeOrchestrator(gc);
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    const before = stable(res.get('Requestor'));
    const callsBefore = gc.calls.length;
    const again = await orch.runAgent('Veritas', BASE, res);
    assert(again.status === 'ok', again.status);
    const added = gc.calls.slice(callsBefore);
    assert(added.length === 2 && added.every((c) => c.id === 'Veritas'), `дополнительные вызовы: ${added.map((c) => c.id)}`);
    assert(stable(res.get('Requestor')) === before, 'Requestor изменился');
    return `доп. вызовов ${added.length} (инструмент + submit), все — Veritas`;
  }),
  Harness.custom('самосогласованность: Рефлектор вызывается k=3 раза', async () => {
    const gc = new GoldenClient();
    const { orch } = makeOrchestrator(gc, { k: 3 });
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    await orch.synthesize(BASE, res);
    assert(gc.calls.filter((c) => c.id === 'Reflector').length === 3, 'вызовов Reflector ≠ 3');
    assert(gc.calls.filter((c) => c.id === 'TheraNavigator').length === 1, 'вызовов TheraNavigator ≠ 1');
    return 'Reflector ×3, TheraNavigator ×1';
  }),
  Harness.custom('SCP: запись всех агентов, evidence[] с якорями, audit по авторам, JSON round-trip', async () => {
    const { orch } = makeOrchestrator(new GoldenClient());
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    let scp = fresh();
    res.forEach((r, id) => { scp = applyToScp(scp, CARDS.get(id), r); });
    const d = scp.data;
    assert(d.request.explicit.length > 0 && d.obstacle.kind === 'внутреннее' && d.liberty.recommended_mode === 'Б', 'поля агентов не записаны');
    assert(d.request.displacements.length === 1 && d.request.displacements[0].t === '[10:07]', 'смещённая речь не записана');
    assert(d.evidence.length >= 12 && d.evidence.every((e) => ['quote', 'measure'].includes(e.type)), `evidence ${d.evidence.length}`);
    assert(d.audit.every((a) => a.who.startsWith('agent:')), 'аудит без автора-агента');
    assert(Scp.fromJson(scp.text()).text() === scp.text(), 'round-trip');
    return `evidence ${d.evidence.length} · аудит ${d.audit.length} записей`;
  }),
  Harness.custom('слойное правило: запись вне полей карточки — ошибка', async () => {
    const { orch } = makeOrchestrator(new GoldenClient());
    const res = await orch.runDomain(['Requestor'], BASE);
    const narrowed = { ...CARDS.get('Requestor'), writes: ['scp.request.explicit'] };
    let threw = false;
    try { applyToScp(fresh(), narrowed, res.get('Requestor')); } catch (e) { threw = /не вправе/.test(e.message); }
    assert(threw, 'агент записал в чужое поле');
    return 'request.latent вне области → исключение';
  }),
  Harness.custom('Судья скрыт от клиента и не ломается на failed/skipped', async () => {
    const { orch } = makeOrchestrator(new GoldenClient({ overrides: { Veritas: failWith('bad_request', 400) } }));
    const res = await orch.runDomain(DOMAIN_ORDER, BASE);
    const js = orch.judges(res);
    assert(js.length === 13, `оценок ${js.length}`);
    assert(js.filter((j) => j.status === 'ok').every((j) => j.hidden_from_client === true), 'ok-оценки должны быть hidden_from_client');
    assert(js.find((j) => j.agent === 'Veritas').status === 'n/a', 'failed → n/a');
    return `оценок ${js.length}; n/a: ${js.filter((j) => j.status === 'n/a').length}`;
  }),
  Harness.custom('цепочки моделей из реестра: без циклов, стартовая первой, откат по fallback', async () => {
    const { REG } = await import('../fixtures/agents/golden.mjs');
    const c = chainOf(REG.models, 'claude-opus-5-5');
    assert(c.join('>') === 'claude-opus-5-5>claude-sonnet-5-5>claude-sonnet-4-6', c.join('>'));
    assert(chainOf(REG.models, 'нет-такой')[0] === REG.models.default, 'неизвестная модель → по умолчанию');
    const loop = { default: 'a', models: [{ id: 'a', fallback: 'b' }, { id: 'b', fallback: 'a' }] };
    assert(chainOf(loop, 'a').join('>') === 'a>b', 'цикл не оборван');
    return c.join(' → ');
  })
]);
