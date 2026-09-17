// memorySearchTool: семантическая память кейсов. Два режима с одним контрактом ответа:
// LOCAL — feature-hashing по словам + символьные триграммы, L2-норма, косинус (демо/тесты);
// MCP — боевой вектор-индекс 11 000 кейсов. Точка замены ◇ MCP-SWAP — одна строка в фабрике.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'memorySearchTool';
const DIM = 1024;

// Детерминированный хэш строки (FNV-1a 32 бит).
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function tokens(text) {
  return String(text).toLowerCase().replace(/[^a-zа-яёіїєґ0-9\s]/gi, ' ').split(/\s+/).filter((t) => t.length > 1);
}

function trigrams(word) {
  const padded = `_${word}_`;
  const out = [];
  for (let i = 0; i + 3 <= padded.length; i += 1) out.push(padded.slice(i, i + 3));
  return out;
}

// Вектор текста: слова весом 1, триграммы весом 0,5; нормирован по L2.
export function embed(text) {
  const v = new Float64Array(DIM);
  tokens(text).forEach((w) => {
    v[fnv(`w:${w}`) % DIM] += 1;
    trigrams(w).forEach((g) => { v[fnv(`g:${g}`) % DIM] += 0.5; });
  });
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i += 1) v[i] /= norm;
  return v;
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < DIM; i += 1) s += a[i] * b[i];
  return Math.min(1, Math.max(-1, s));
}

function passes(item, filters) {
  const f = filters === undefined || filters === null ? {} : filters;
  if (typeof f.crisis === 'boolean' && item.crisis !== f.crisis) return false;
  if (typeof f.age_band === 'string' && f.age_band !== '' && item.age_band !== f.age_band) return false;
  if (Array.isArray(f.tags) && f.tags.length > 0 && !f.tags.every((t) => item.tags.includes(t))) return false;
  return true;
}

export class LocalMemory {
  constructor(cases) {
    const list = Array.isArray(cases) ? cases : [];
    this.index = Object.freeze(list.map((c) => Object.freeze({
      id: c.id, archetype: c.archetype, crisis: c.crisis === true, age_band: c.age_band === undefined ? '' : c.age_band,
      tags: Object.freeze(Array.isArray(c.tags) ? c.tags.slice() : []), summary: c.summary, outcome: c.outcome,
      vector: embed(`${c.summary} ${(c.tags || []).join(' ')} ${c.archetype}`)
    })));
    Object.freeze(this);
  }

  mode() {
    return 'LOCAL';
  }

  // Контракт ответа общий для LOCAL и MCP: { mode, query, hits[], total }.
  search(query, k, filters) {
    const q = typeof query === 'string' ? query : '';
    const top = typeof k === 'number' && k > 0 ? Math.floor(k) : 5;
    if (tokens(q).length === 0 || this.index.length === 0) {
      return Object.freeze({ mode: 'LOCAL', query: q, hits: [], total: this.index.length, version: VERSION,
        reason: this.index.length === 0 ? 'индекс пуст' : 'пустой запрос' });
    }
    const qv = embed(q);
    const hits = this.index
      .filter((c) => passes(c, filters))
      .map((c) => ({ id: c.id, archetype: c.archetype, crisis: c.crisis, age_band: c.age_band, tags: c.tags.slice(), outcome: c.outcome,
        score: Param.measured(Number(cosine(qv, c.vector).toFixed(4)), 'cos', [-1, 1], TOOL, VERSION, 'LOCAL: hashing + триграммы').json() }))
      .sort((a, b) => b.score.value - a.score.value || a.id.localeCompare(b.id))
      .slice(0, top);
    return Object.freeze({ mode: 'LOCAL', query: q, hits, total: this.index.length, version: VERSION, reason: '' });
  }
}

// Боевой режим: контракт тот же, реализация — MCP-клиент. В Спринте 0 клиента нет → честный ⛔.
export class McpMemory {
  constructor(client) {
    this.client = client;
    Object.freeze(this);
  }

  mode() {
    return 'MCP';
  }

  search(query, k) {
    if (this.client === undefined || this.client === null || typeof this.client.search !== 'function') {
      return Object.freeze({ mode: 'MCP', query: String(query), hits: [], total: 0, version: VERSION, reason: '⛔ MCP-клиент не подключён' });
    }
    return this.client.search(query, k);
  }
}

// ◇ MCP-SWAP: единственная строка, которую меняют при переходе на боевой индекс.
export function memoryFor(cases, mcpClient) {
  return mcpClient === undefined ? new LocalMemory(cases) : new McpMemory(mcpClient);
}
