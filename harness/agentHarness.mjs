// Фабрика проверок харнесса типа llm-agent (3.7, п. 2) для одного доменного агента.
// Двойник модели (GoldenClient) проверяет КОНТРАКТ: схема, обязательные инструменты, якоря, бейджи, числа, область записи в SCP,
// детерминизм, рубрика Судьи. Живое качество модели не измеряется (live_eval: not_run).
import { readFileSync } from 'node:fs';
import { Harness, assert } from './Harness.mjs';
import { GOLDEN, BASE, CARDS, GoldenClient, makeOrchestrator, makeToolbox, chainFor, stable, toolUse } from '../fixtures/agents/golden.mjs';
import { SPECS, buildAgentSchema } from '../core/agents/agentSpecs.mjs';
import { applyToScp } from '../core/agents/orchestrator.mjs';
import { judge } from '../core/agents/synthesis.mjs';
import { Scp } from '../core/scp.mjs';

async function runChain(id, inner) {
  const { orch } = makeOrchestrator(inner);
  const res = await orch.runDomain(chainFor(id), BASE);
  return { res, result: res.get(id) };
}

const fresh = () => Scp.fresh({ mode: 'session', model: 'claude-opus-5-5', created: '2026-11-01T00:00:00.000Z', input_hash: 'test', alias: 'К.' });

export function domainAgentChecks(id) {
  const card = CARDS.get(id);
  const golden = GOLDEN[id];
  const spec = SPECS[id];
  const required = card.tools_required.filter((n) => !n.endsWith('?'));
  const tb = makeToolbox();
  const hasQuote = JSON.stringify(golden.payload(new Map(golden.tools.map((n) => [n, tb.run(n, {}, BASE)])))).includes('"quote"');
  return [
    Harness.custom('golden: статус ok, бейджи утверждений и карточки, инструменты вызваны', async () => {
      const { result } = await runChain(id);
      assert(result.status === 'ok', `статус ${result.status}: ${result.reason}`);
      Object.entries(golden.expect.badges).forEach(([local, badge]) => {
        const c = result.claims.find((x) => x.local === local);
        assert(c !== undefined, `нет утверждения ${local}`);
        assert(c.badge === badge, `${local}: бейдж ${c.badge} ≠ ${badge}`);
      });
      assert(result.claims.length === Object.keys(golden.expect.badges).length, 'число утверждений не совпало с эталоном');
      assert(result.card_badge === golden.expect.card, `бейдж карточки ${result.card_badge} ≠ ${golden.expect.card}`);
      required.forEach((n) => assert(result.tools_called.some((c) => c.name === n), `обязательный ${n} не вызван`));
      assert(result.flags.length === 0 && result.claims.every((c) => c.flags.length === 0), `флаги: ${JSON.stringify(result.claims.map((c) => c.flags))}`);
      return `${result.claims.map((c) => `${c.local}${c.badge}`).join(' ')} · карточка ${result.card_badge} · вызовов модели ${result.calls}`;
    }),
    Harness.custom('схема выхода в schemas/agents совпадает с реестром полей', () => {
      const file = JSON.parse(readFileSync(new URL(`../schemas/agents/${id.toLowerCase()}.out.json`, import.meta.url), 'utf8'));
      const { $id, ...rest } = file;
      assert($id === `atmaraksi.agents.${id}.out`, `неверный $id ${$id}`);
      assert(JSON.stringify(rest) === JSON.stringify(buildAgentSchema(spec.fields)), 'файл схемы устарел: npm run gen');
      return 'schemas/agents/' + id.toLowerCase() + '.out.json актуален';
    }),
    Harness.custom('SCP: запись только в поля карточки (+ frames.l2)', async () => {
      const { result } = await runChain(id);
      const scp = applyToScp(fresh(), card, result);
      const paths = scp.data.audit.map((a) => a.what.replace(/^write /, '')).filter((w) => !w.startsWith('evidence '));
      const allowed = card.writes.map((w) => w.replace(/^scp\./, ''));
      assert(paths.length > 0, 'агент ничего не записал');
      paths.forEach((p) => assert(allowed.some((a) => p === a || p.startsWith(`${a}.`)), `запись вне области: ${p}`));
      const ev = scp.data.evidence.filter((e) => e.claim_id.startsWith(`${id}.`));
      assert(ev.length === result.claims.filter((c) => c.evidence.some((e) => e.ok)).length, 'evidence[] не соответствует якорным утверждениям');
      return `${paths.length} записей: ${paths.join(', ')}`;
    }),
    Harness.custom('Судья: рубрика (якоря, бейджи, числа, язык)', async () => {
      const { result } = await runChain(id);
      const j = judge(result);
      const r = j.rubric;
      if (r.citation_accuracy.value !== null) assert(r.citation_accuracy.value === 1, `точность якорей ${r.citation_accuracy.value}`);
      assert(r.badge_honesty.value === 1 && r.number_honesty.value === 1, 'честность бейджей/чисел < 1');
      assert(r.language.value >= 0.9, `кириллицы ${r.language.value}`);
      assert(j.overall.value >= 0.7, `итог рубрики ${j.overall.value}`);
      return `итог ${j.overall.value} · якоря ${r.citation_accuracy.value === null ? '⛔' : r.citation_accuracy.value} · полнота ${r.completeness.value}`;
    }),
    Harness.custom('детерминизм ×2 (результаты без времён совпадают)', async () => {
      const a = stable((await runChain(id)).result);
      const b = stable((await runChain(id)).result);
      assert(a === b, 'два прогона дали разный результат');
      return `${a.length} знаков JSON, идентично`;
    }),
    ...(required.length ? [Harness.custom('агент, «посчитавший сам» (без обязательных инструментов), проваливает проверку', async () => {
      const skip = (req, turn, g, client) => ({ content: [toolUse('s1', 'submit_result', g.payload(new Map(g.tools.map((n) => [n, client.toolbox.run(n, {}, client.base)]))))], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, model: req.model });
      const { result } = await runChain(id, new GoldenClient({ overrides: { [id]: skip } }));
      assert(result.status === 'failed', `ожидался провал, статус ${result.status}`);
      assert(/обязательные инструменты/.test(result.reason), `причина: ${result.reason}`);
      return `провал: ${result.reason.slice(0, 80)}`;
    })] : []),
    ...(hasQuote ? [Harness.custom('выдуманная цитата не принимается и не попадает в отчёт', async () => {
      const fabricate = (req, turn, g, client) => {
        if (turn === 0 && g.tools.length) return undefined;
        const p = JSON.parse(JSON.stringify(g.payload(new Map(g.tools.map((n) => [n, client.toolbox.run(n, {}, client.base)])))));
        p.claims.forEach((c) => c.evidence.forEach((e) => { if (e.type === 'quote') e.quote = 'Я ненавижу свою работу и свою мать'; }));
        if (p.fields.displacements) p.fields.displacements.forEach((d) => { d.quote = 'Я ненавижу свою работу и свою мать'; });
        return { content: [toolUse('s1', 'submit_result', p)], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, model: req.model };
      };
      const { result } = await runChain(id, new GoldenClient({ overrides: { [id]: fabricate } }));
      assert(result.status === 'failed' || result.status === 'degraded', `статус ${result.status}`);
      assert(!JSON.stringify(result.claims).includes('ненавижу'), 'выдуманная цитата просочилась в утверждения');
      assert(result.submit_attempts >= 3, `повторов ${result.submit_attempts} < 3`);
      assert(result.claims.every((c) => c.evidence.every((e) => e.ok) ), 'в отчёте остался неподтверждённый якорь');
      return `${result.status}; повторов ${result.submit_attempts}; отброшено ${result.dropped.length}`;
    })] : []),
    Harness.custom('выдуманное число понижает бейдж до 🔵 и помечается флагом', async () => {
      const inflate = (req, turn, g, client) => {
        if (turn === 0 && g.tools.length) return undefined;
        const p = JSON.parse(JSON.stringify(g.payload(new Map(g.tools.map((n) => [n, client.toolbox.run(n, {}, client.base)])))));
        p.claims[0].text = `${p.claims[0].text} Это повторялось 17 раз.`;
        return { content: [toolUse('s1', 'submit_result', p)], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, model: req.model };
      };
      const { result } = await runChain(id, new GoldenClient({ overrides: { [id]: inflate } }));
      assert(result.status === 'ok', `статус ${result.status}: ${result.reason}`);
      const c = result.claims[0];
      assert(c.badge === '🔵' && c.flags.some((f) => f.startsWith('unsupported_number')), `бейдж ${c.badge}, флаги ${c.flags}`);
      return `${c.id}: ${c.badge} ${c.flags.join(',')}`;
    })
  ];
}
