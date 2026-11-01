import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { Router } from '../core/agents/orchestrator.mjs';
import { DOMAIN_AGENTS } from '../core/agents/agentSpecs.mjs';

const passport = JSON.parse(readFileSync(new URL('./agent.Router.harness.json', import.meta.url), 'utf8'));
const run = (o) => Router.plan(o);

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ mode: 'session', hasAudio: false }, { mode: 'meeting', hasAudio: true, selected: ['Veritas', 'Insight'] }, { mode: 'game', hasAudio: false }]),
  Harness.edges(run, [
    { name: 'session', input: { mode: 'session', hasAudio: true }, expect: (o, a) => a(o.agents.length === 13, `сессия: ${o.agents.length} агентов`) },
    { name: 'meeting', input: { mode: 'meeting', hasAudio: true }, expect: (o, a) => a(o.agents.length === 7 && !o.agents.includes('Insight'), 'совещание: 7 агентов без Insight') },
    { name: 'game', input: { mode: 'game', hasAudio: true }, expect: (o, a) => a(o.agents.includes('CascadeABC') && o.agents.length === 10, 'игра: каскад, 10 агентов') },
    { name: 'unknown-agents', input: { mode: 'session', hasAudio: true, selected: ['Veritas', 'Evil', 'Router'] }, expect: (o, a) => a(o.agents.join() === 'Veritas', 'неизвестные и системные агенты отфильтрованы') },
    { name: 'empty-selection', input: { mode: 'session', hasAudio: true, selected: [] }, expect: (o, a) => a(o.agents.length === 13, 'пустой выбор → состав режима') },
    { name: 'no-audio', input: { mode: 'session', hasAudio: false }, expect: (o, a) => a(/просодика ⛔/.test(o.reason) && /LLM-классификатор интента ⛔/.test(o.reason), 'объяснение называет ⛔-каналы') },
    { name: 'orphan', input: { mode: 'session', hasAudio: true, selected: ['Insight'] }, expect: (o, a) => a(/без вышестоящих/.test(o.reason), 'агент без зависимостей помечен в объяснении') }
  ]),
  Harness.stress(run, (rng) => ({ mode: rng.pick(['session', 'meeting', 'game', 'full', 'неизвестный']), hasAudio: rng.next() < 0.5, selected: rng.next() < 0.5 ? undefined : Array.from({ length: Math.floor(rng.between(0, 6)) }, () => rng.pick([...DOMAIN_AGENTS, 'Evil', ''])) }), 1000, 2, 37)
]);
