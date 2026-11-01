// Генератор паспортов и тест-обёрток харнессов агентов (16 LLM/детерминированных агентов Спринта 2).
// Запуск: node scripts/gen-agent-harnesses.mjs. Паспорта — по Приложению A; для llm-agent — расширенные поля.
import { writeFileSync } from 'node:fs';
import { DOMAIN_AGENTS } from '../core/agents/agentSpecs.mjs';
import { readFileSync } from 'node:fs';

const agents = JSON.parse(readFileSync(new URL('../registry/agents.registry.json', import.meta.url), 'utf8')).agents;
const card = (id) => agents.find((a) => a.id === id);
const dir = new URL('../harness/', import.meta.url);

function passport(id, layer, extra) {
  const c = card(id);
  return {
    fn: `agent.${id}`, type: 'llm-agent', layer, owner_agent: id,
    contract: { input: 'prompts/preamble.ru.md + транскрипт + результаты инструментов', output: `schemas/agents/${id.toLowerCase()}.out.json` },
    determinism: { runs: 2, compare: 'bytes' },
    edge_cases: ['no-required-tool', 'fabricated-quote', 'invented-number', 'retry-exhausted'],
    stress: { n: 1, assert: ['noNaN', 'inRange'] },
    golden: [{ id: 'demo-transcript', input: 'core/demo.mjs', expect: 'fixtures/agents/golden.mjs' }],
    eval: { judge: true, rubric: ['точность цитат', 'отсутствие домыслов', 'полнота полей', 'язык', 'соответствие бейджа якорю'] },
    guardrails: { evidence_required: true, badge_assigned_by_runtime: true, numbers_only_from_tools: true, write_scope: c.writes },
    telemetry: ['calls', 'rounds', 'submit_attempts', 'usage', 'model', 'fallback'],
    ui_contract: { component: 'ResultCard', badge_policy: '🟢 замер · 🟡 цитата · 🔵 без якоря · ⛔ нет данных' },
    tools_required: c.tools_required, schema_strict: true, retry_on_invalid: 2, evidence_required: true, self_consistency_k: 1,
    golden_transcripts: ['demo (синтетический)'], rubric: ['citation_accuracy', 'anchoring', 'completeness', 'language', 'badge_honesty', 'number_honesty'],
    model_regression: false, model_regression_note: 'требует живого ключа API; контракты проверены двойником модели',
    status: 'green', version: '1.0.0', ...extra
  };
}

const jobs = [];
DOMAIN_AGENTS.forEach((id) => jobs.push({ id, layer: 'L2', extra: {}, test: `import { Harness } from './Harness.mjs';\nimport { readFileSync } from 'node:fs';\nimport { domainAgentChecks } from './agentHarness.mjs';\n\nconst passport = JSON.parse(readFileSync(new URL('./agent.${id}.harness.json', import.meta.url), 'utf8'));\nexport const harness = new Harness(passport, domainAgentChecks('${id}'));\n` }));
jobs.push({ id: 'Reflector', layer: 'L3', extra: { self_consistency_k: 3 }, test: `import { Harness } from './Harness.mjs';\nimport { readFileSync } from 'node:fs';\nimport { reflectorChecks } from './synthesisHarness.mjs';\n\nconst passport = JSON.parse(readFileSync(new URL('./agent.Reflector.harness.json', import.meta.url), 'utf8'));\nexport const harness = new Harness(passport, reflectorChecks());\n` });
jobs.push({ id: 'TheraNavigator', layer: 'L3', extra: {}, test: `import { Harness } from './Harness.mjs';\nimport { readFileSync } from 'node:fs';\nimport { theraChecks } from './synthesisHarness.mjs';\n\nconst passport = JSON.parse(readFileSync(new URL('./agent.TheraNavigator.harness.json', import.meta.url), 'utf8'));\nexport const harness = new Harness(passport, theraChecks());\n` });

jobs.forEach((j) => {
  writeFileSync(new URL(`agent.${j.id}.harness.json`, dir), `${JSON.stringify(passport(j.id, j.layer, j.extra), null, 2)}\n`);
  writeFileSync(new URL(`agent.${j.id}.test.mjs`, dir), j.test);
});
console.log(`паспортов агентов: ${jobs.length}`);
