import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { LocalMemory, McpMemory, memoryFor } from '../core/engines/memorySearchTool.mjs';

const passport = JSON.parse(readFileSync(new URL('./memorySearchTool.harness.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(readFileSync(new URL('../fixtures/memory.cases.json', import.meta.url), 'utf8'));
const memory = new LocalMemory(corpus.cases);
const run = (input) => memory.search(input.query, input.k, input.filters);
const words = ['выгорание', 'смысл', 'отношения', 'страх', 'деньги', 'мать', 'экзамен', 'сон', 'гнев', 'бізнес', 'тривога', 'робота', 'a', 'ok', '—', '42'];

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ query: 'выгорание, нет смысла' }, { query: '' }, { query: 'страх одиночества', k: 2 }]),
  Harness.edges(run, [
    { name: 'empty-query', input: { query: '' }, expect: (o, a) => a(o.hits.length === 0 && o.reason === 'пустой запрос', 'пустой запрос → 0 совпадений, причина') },
    { name: 'empty-index', input: { query: 'x' }, expect: (o, a) => { const e = new LocalMemory([]).search('выгорание'); a(e.hits.length === 0 && e.total === 0, 'пустой индекс → 0'); } },
    { name: 'filters', input: { query: 'травма гнев', filters: { crisis: true } }, expect: (o, a) => a(o.hits.length === 1 && o.hits[0].id === 'C003', 'фильтр crisis → только C003') },
    { name: 'mixed-ru-ua', input: { query: 'тривога перед іспитом, прокрастинація' }, expect: (o, a) => a(o.hits.length > 0 && o.hits[0].id === 'C005', 'UA-запрос находит C005 по триграммам') },
    { name: 'mcp-unplugged', input: { query: 'x' }, expect: (o, a) => { const m = new McpMemory(undefined).search('x', 5); a(m.hits.length === 0 && /⛔/.test(m.reason) && Object.keys(m).join() === Object.keys(new LocalMemory([]).search('x')).join(), 'MCP без клиента → ⛔, форма ответа та же'); } }
  ]),
  Harness.custom('◇ MCP-SWAP: один и тот же контракт', () => {
    const local = memoryFor(corpus.cases);
    const mcp = memoryFor(corpus.cases, { search: (q, k) => ({ mode: 'MCP', query: q, hits: [], total: 11000, version: '1.0', reason: '' }) });
    const a = Object.keys(local.search('x', 3)).sort().join();
    const b = Object.keys(mcp.search('x', 3)).sort().join();
    if (a !== b) throw new Error(`формы различаются: ${a} vs ${b}`);
    if (local.mode() !== 'LOCAL' || mcp.mode() !== 'MCP') throw new Error('режимы не совпадают');
    return `поля ответа: ${a}`;
  }),
  Harness.stress(run, (rng) => ({ query: Array.from({ length: Math.floor(rng.between(0, 6)) }, () => rng.pick(words)).join(' '), k: Math.floor(rng.between(1, 8)) }), 2000, 50, 9),
  Harness.custom('golden: «выгорание, нет смысла» → C002 первым', () => {
    const out = run({ query: 'выгорание, нет смысла' });
    if (out.hits.length === 0 || out.hits[0].id !== 'C002') throw new Error(`первый: ${out.hits.length ? out.hits[0].id : 'нет'}`);
    return `C002 score=${out.hits[0].score.value} · далее ${out.hits.slice(1, 3).map((h) => `${h.id}=${h.score.value}`).join(', ')}`;
  })
]);
