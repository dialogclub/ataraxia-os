import { readFileSync } from 'node:fs';
import { Harness, assert } from './Harness.mjs';
import { judge } from '../core/agents/synthesis.mjs';
import { BASE, GoldenClient, makeOrchestrator, DOMAIN_ORDER } from '../fixtures/agents/golden.mjs';

const passport = JSON.parse(readFileSync(new URL('./agent.Judge.harness.json', import.meta.url), 'utf8'));
const golden = async () => { const { orch } = makeOrchestrator(new GoldenClient()); return orch.runDomain(DOMAIN_ORDER, BASE); };
const claim = (flags, evidence) => ({ id: 'A.c', local: 'c', text: 'Участник говорит об усталости.', badge: '🔵', evidence, flags });
const result = (claims, stats, fields) => ({ id: 'A', status: 'ok', summary: 'Итог по усталости.', claims, stats, fields });
const OK = { type: 'quote', ok: true };
const BAD = { type: 'quote', ok: false };

export const harness = new Harness(passport, [
  Harness.determinism((r) => judge(r), [result([claim([], [OK])], { quote_total: 1, quote_ok: 1, measure_total: 0, measure_ok: 0 }, { a: 'x' }), { id: 'F', status: 'failed', reason: 'x' }]),
  Harness.edges((r) => judge(r), [
    { name: 'failed', input: { id: 'F', status: 'failed', reason: 'нет API' }, expect: (o, a) => a(o.status === 'n/a' && o.overall.badge === '⛔', 'failed → n/a, ⛔') },
    { name: 'skipped', input: { id: 'S', status: 'skipped', reason: 'нет вышестоящих' }, expect: (o, a) => a(o.status === 'n/a', 'skipped → n/a') },
    { name: 'no-claims', input: result([], { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0 }, { a: null }), expect: (o, a) => a(o.rubric.anchoring.badge === '⛔' && o.rubric.citation_accuracy.badge === '⛔', 'нет утверждений/якорей → ⛔, не число') },
    { name: 'overclaimed', input: result([claim(['overclaimed_badge:🟢>🔵'], [])], { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0 }, { a: 'x' }), expect: (o, a) => a(o.rubric.badge_honesty.value === 0, 'честность 0 при завышении') },
    { name: 'fabricated', input: result([claim([], [OK])], { quote_total: 2, quote_ok: 1, measure_total: 0, measure_ok: 0 }, { a: 'x' }), expect: (o, a) => a(o.rubric.citation_accuracy.value === 0.5, 'точность якорей 1 из 2') }
  ]),
  Harness.custom('golden: 13 агентов, итог рубрики ≥ 0,7, оценка скрыта от клиента', async () => {
    const res = await golden();
    const js = [...res.values()].map((r) => judge(r));
    assert(js.every((j) => j.status === 'ok' && j.hidden_from_client === true && j.overall.value >= 0.7), `минимум ${Math.min(...js.map((j) => j.overall.value))}`);
    const worst = js.reduce((a, b) => (a.overall.value <= b.overall.value ? a : b));
    return `мин ${worst.overall.value} (${worst.agent}) · среднее ${(js.reduce((a, j) => a + j.overall.value, 0) / js.length).toFixed(3)}`;
  }),
  Harness.custom('язык: латиница сверх терминов методологии снижает оценку, термины — нет', () => {
    const base = result([], { quote_total: 0, quote_ok: 0, measure_total: 0, measure_ok: 0 }, { a: 'x' });
    const ru = judge({ ...base, summary: 'Доминирует Phobon и Zimbardo-прокси при PHQ-9.' });
    const en = judge({ ...base, summary: 'The participant feels tired and keeps pretending.' });
    assert(ru.rubric.language.value === 1, `термины: ${ru.rubric.language.value}`);
    assert(en.rubric.language.value < 0.1, `английский текст: ${en.rubric.language.value}`);
    return `с терминами ${ru.rubric.language.value} · английский ${en.rubric.language.value}`;
  }),
  Harness.stress((r) => judge(r), (rng) => {
    const n = Math.floor(rng.between(0, 6));
    const claims = Array.from({ length: n }, () => claim(rng.next() < 0.3 ? ['unsupported_number:7'] : rng.next() < 0.3 ? ['overclaimed_badge:🟢>🟡'] : [], rng.next() < 0.7 ? [rng.next() < 0.8 ? OK : BAD] : []));
    const qt = Math.floor(rng.between(0, 4));
    return rng.next() < 0.1 ? { id: 'F', status: rng.pick(['failed', 'skipped']), reason: 'x' } : result(claims, { quote_total: qt, quote_ok: Math.floor(rng.between(0, qt + 1)), measure_total: 0, measure_ok: 0 }, rng.pick([{}, { a: null }, { a: 'x', b: [] }, { a: 'x', b: [1] }]));
  }, 1000, 5, 31)
]);
