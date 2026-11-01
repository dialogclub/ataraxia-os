// Узловая обвязка золотых сценариев (чтение реестров из файлов, фабрики оркестратора). Чистая часть — goldenCore.mjs.
import { readFileSync } from 'node:fs';
import { Toolbox } from '../../core/agents/toolbox.mjs';
import { LexisTool } from '../../core/engines/lexisTool.mjs';
import { GroundingClassifier } from '../../core/engines/groundingClassifier.mjs';
import { CascadeEngine } from '../../core/engines/cascadeEngine.mjs';
import { LocalMemory } from '../../core/engines/memorySearchTool.mjs';
import { PhonoSemTool } from '../../core/engines/phonoSemTool.mjs';
import { ProsodyTool } from '../../core/engines/prosodyTool.mjs';
import { L2Orchestrator } from '../../core/agents/orchestrator.mjs';
import { ResilientClient } from '../../core/agents/modelClient.mjs';
import { SPECS } from '../../core/agents/agentSpecs.mjs';
import { GoldenClient as CoreGoldenClient, BASE, LINES, GOLDEN, DOMAIN_ORDER, toolUse } from './goldenCore.mjs';

export { BASE, LINES, GOLDEN, DOMAIN_ORDER, toolUse };

const read = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));
export const REG = Object.freeze({ agents: read('registry/agents.registry.json').agents, models: read('registry/models.registry.json'), prompts: read('registry/prompts.registry.json'), memory: read('fixtures/memory.cases.json') });
export const CARDS = new Map(REG.agents.map((a) => [a.id, a]));

export function makeToolbox() {
  return new Toolbox({ lexis: new LexisTool(), grounding: new GroundingClassifier(), cascadeCtor: CascadeEngine, memory: new LocalMemory(REG.memory.cases), phono: new PhonoSemTool(), prosody: new ProsodyTool() });
}

export class GoldenClient extends CoreGoldenClient {
  constructor(options) {
    const o = options === undefined ? {} : options;
    super({ ...o, toolbox: o.toolbox === undefined ? makeToolbox() : o.toolbox });
  }
}

// Оркестратор поверх произвольного внутреннего клиента (по умолчанию — золотой), без реальных пауз.
export function makeOrchestrator(inner, options) {
  const o = options === undefined ? {} : options;
  const client = new ResilientClient(inner === undefined ? new GoldenClient() : inner, { sleep: async () => {}, retries: o.retries });
  return { client, orch: new L2Orchestrator({ client, toolbox: makeToolbox(), models: REG.models, cards: CARDS, prompts: REG.prompts }, { k: o.k === undefined ? 1 : o.k, concurrency: o.concurrency }) };
}

// Транзитивные зависимости агента в порядке запуска (для проверки одного агента вместе с вышестоящими).
export function chainFor(id, seen) {
  const s = seen === undefined ? new Set() : seen;
  if (s.has(id)) return [];
  s.add(id);
  return [...(SPECS[id] ? SPECS[id].depends_on : []).flatMap((d) => chainFor(d, s)), id];
}

// Копия результата без времён: для сравнения запусков.
export function stable(result) {
  return JSON.stringify(result, (k, v) => (k === 'latency_ms' ? undefined : v));
}
