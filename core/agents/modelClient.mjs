// Клиенты модели для слоя L2/L3. Сеть — только Claude API (инвариант 6); всё остальное считается локально.
//  · HttpModelClient     — POST /v1/messages через fetch (в песочнице артефактов Claude.ai шлюз подставляет ключ;
//                          вне песочницы ключ задаёт клиницист в «Настройках», хранится только в памяти сессии).
//  · ResilientClient     — таймаут, повтор на 429/5xx с экспоненциальной паузой, цепочка отката по моделям, предохранитель.
//  · ScriptedClient      — тестовый двойник для харнесса (детерминированные сценарии); в интерфейс не подключается.
// Не отправляем temperature/top_p/top_k/budget_tokens: на текущих моделях это 400. Толщина мышления — через effort.

export const API_VERSION = '2026-10-21';
export const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class ModelError extends Error {
  // kind: auth | bad_request | model_unavailable | rate | overloaded | timeout | network | refusal | truncated | invalid_response
  constructor(kind, message, details) {
    super(message);
    const d = details === undefined ? {} : details;
    this.name = 'ModelError';
    this.kind = kind;
    this.status = typeof d.status === 'number' ? d.status : 0;
    this.category = d.category === undefined ? '' : String(d.category);
    this.retryAfterMs = typeof d.retryAfterMs === 'number' ? d.retryAfterMs : 0;
  }

  retryable() {
    return this.kind === 'rate' || this.kind === 'overloaded' || this.kind === 'timeout' || this.kind === 'network';
  }
}

function classify(status, bodyMessage) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 529 || status === 500 || status === 502 || status === 503 || status === 504) return 'overloaded';
  if (status === 404 || (status === 400 && /model/i.test(bodyMessage) && /(not found|not supported|unknown|invalid|does not exist)/i.test(bodyMessage))) return 'model_unavailable';
  return 'bad_request';
}

export function textOf(content) {
  return (Array.isArray(content) ? content : []).filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
}

export class HttpModelClient {
  constructor(options) {
    const o = options === undefined || options === null ? {} : options;
    this.endpoint = typeof o.endpoint === 'string' && o.endpoint !== '' ? o.endpoint : DEFAULT_ENDPOINT;
    this.apiKey = typeof o.apiKey === 'string' ? o.apiKey : '';
    this.apiVersion = typeof o.apiVersion === 'string' && o.apiVersion !== '' ? o.apiVersion : API_VERSION;
    this.timeoutMs = typeof o.timeoutMs === 'number' && o.timeoutMs > 0 ? o.timeoutMs : 90000;
    this.fetchImpl = typeof o.fetchImpl === 'function' ? o.fetchImpl : undefined;
    Object.freeze(this);
  }

  // req: { model, system, messages, tools, maxTokens, effort }
  async complete(req) {
    const doFetch = this.fetchImpl === undefined ? globalThis.fetch : this.fetchImpl;
    if (typeof doFetch !== 'function') throw new ModelError('network', 'fetch недоступен в этой среде');
    const body = { model: req.model, max_tokens: req.maxTokens === undefined ? 8000 : req.maxTokens, messages: req.messages };
    if (req.system) body.system = req.system;
    if (Array.isArray(req.tools) && req.tools.length) body.tools = req.tools;
    if (req.effort) body.output_config = { effort: req.effort };
    const headers = { 'content-type': 'application/json', 'anthropic-version': this.apiVersion };
    if (this.apiKey !== '') {
      headers['x-api-key'] = this.apiKey;
      // Прямой вызов из браузера с собственным ключом требует явного согласия (иначе API отклоняет CORS-запрос).
      if (typeof window !== 'undefined') headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = ctl === undefined ? undefined : setTimeout(() => ctl.abort(), this.timeoutMs);
    let res;
    try {
      res = await doFetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl === undefined ? undefined : ctl.signal });
    } catch (e) {
      if (timer !== undefined) clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new ModelError('timeout', `таймаут ${Math.round(this.timeoutMs / 1000)} с`);
      throw new ModelError('network', `сеть: ${e && e.message ? e.message : String(e)}`);
    }
    if (timer !== undefined) clearTimeout(timer);
    let json;
    try { json = await res.json(); } catch { json = undefined; }
    if (!res.ok) {
      const msg = json && json.error && json.error.message ? String(json.error.message) : `HTTP ${res.status}`;
      const retryAfter = Number(res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : 0);
      throw new ModelError(classify(res.status, msg), msg, { status: res.status, retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : 0 });
    }
    if (!json || !Array.isArray(json.content)) throw new ModelError('invalid_response', 'ответ без content');
    if (json.stop_reason === 'refusal') throw new ModelError('refusal', 'модель отклонила запрос', { category: json.stop_details && json.stop_details.category });
    if (json.stop_reason === 'max_tokens') throw new ModelError('truncated', 'ответ оборван по max_tokens');
    return Object.freeze({ content: json.content, stop_reason: json.stop_reason, usage: json.usage === undefined ? {} : json.usage, model: json.model === undefined ? req.model : json.model });
  }
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

export class ResilientClient {
  // chain: ['claude-opus-5-5', 'claude-sonnet-5-5', …]; sleep/нагрузка внедряются для детерминизма в харнессе.
  constructor(inner, options) {
    const o = options === undefined || options === null ? {} : options;
    this.inner = inner;
    this.retries = typeof o.retries === 'number' ? o.retries : 2;
    this.baseDelayMs = typeof o.baseDelayMs === 'number' ? o.baseDelayMs : 1000;
    this.sleep = typeof o.sleep === 'function' ? o.sleep : sleepReal;
    // Предохранитель: auth/сеть без шлюза не мучают остальных агентов повторами.
    this.state = { dead: undefined, networkFailures: 0 };
    Object.freeze(this);
  }

  dead() {
    return this.state.dead;
  }

  // req.model — стартовая модель; chain — последовательность отката (включая стартовую первой).
  async complete(req, chain) {
    if (this.state.dead !== undefined) throw this.state.dead;
    const models = Array.isArray(chain) && chain.length ? chain : [req.model];
    const attempts = [];
    let lastError;
    for (let mi = 0; mi < models.length; mi += 1) {
      const model = models[mi];
      for (let attempt = 0; attempt <= this.retries; attempt += 1) {
        try {
          const response = await this.inner.complete({ ...req, model });
          attempts.push({ model, ok: true, attempt });
          return { response, model, fallback: mi > 0, from: models[0], attempts };
        } catch (e) {
          lastError = e instanceof ModelError ? e : new ModelError('invalid_response', e && e.message ? e.message : String(e));
          attempts.push({ model, ok: false, attempt, kind: lastError.kind, status: lastError.status });
          if (lastError.kind === 'auth') { this.state.dead = lastError; throw lastError; }
          if (lastError.kind === 'network') {
            this.state.networkFailures += 1;
            if (attempt >= 1) { this.state.dead = lastError; throw lastError; }
          }
          if (lastError.kind === 'bad_request' || lastError.kind === 'truncated' || lastError.kind === 'invalid_response') throw lastError;
          if (lastError.kind === 'refusal' || lastError.kind === 'model_unavailable') break; // сразу к следующей модели
          if (!lastError.retryable() || attempt === this.retries) break;
          await this.sleep(lastError.retryAfterMs > 0 ? lastError.retryAfterMs : this.baseDelayMs * 2 ** attempt);
        }
      }
    }
    throw lastError;
  }
}

// Сценарный двойник. script — массив шагов: объект ответа { content, stop_reason? }, { error: {kind, message?, status?} }
// либо функция (req, n) => шаг. Исчерпание сценария — ошибка (тест не должен молча проходить).
export class ScriptedClient {
  constructor(script) {
    this.script = Array.isArray(script) ? script : [];
    this.calls = [];
    this.state = { n: 0 };
    Object.freeze(this);
  }

  async complete(req) {
    this.calls.push(JSON.parse(JSON.stringify({ model: req.model, system: req.system, messages: req.messages, tools: (req.tools || []).map((t) => t.name), effort: req.effort })));
    const i = this.state.n;
    this.state.n += 1;
    let step = this.script[i];
    if (typeof step === 'function') step = step(req, i);
    if (step === undefined) throw new ModelError('invalid_response', `сценарий исчерпан на вызове ${i + 1}`);
    if (step.error) throw new ModelError(step.error.kind, step.error.message === undefined ? step.error.kind : step.error.message, { status: step.error.status, category: step.error.category, retryAfterMs: step.error.retryAfterMs });
    return Object.freeze({ content: step.content, stop_reason: step.stop_reason === undefined ? 'tool_use' : step.stop_reason, usage: step.usage === undefined ? { input_tokens: 0, output_tokens: 0 } : step.usage, model: req.model });
  }
}
