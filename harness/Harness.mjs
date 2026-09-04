// Харнесс-фреймворк: паспорт + контракт + детерминизм + edge-cases + стресс + golden + ограждения.
// Нет харнесса — нет функции (инвариант 2). Один красный пункт → status: red → функция скрыта в UI.

// Детерминированный ГПСЧ (mulberry32): стресс-прогоны воспроизводимы.
export class Rng {
  constructor(seed) {
    this.state = { s: seed >>> 0 };
    Object.freeze(this);
  }

  next() {
    let t = (this.state.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}

// Обход объекта: ищем NaN/Infinity и выходы за диапазон в Param-подобных узлах.
export function scan(value, path, out) {
  const p = path === undefined ? '$' : path;
  const acc = out === undefined ? { nan: [], outOfRange: [] } : out;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) acc.nan.push(p);
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${p}[${i}]`, acc));
    return acc;
  }
  if (value !== null && typeof value === 'object') {
    // Param: value === null допустим только с бейджем ⛔.
    if ('badge' in value && 'range' in value) {
      if (value.value === null && value.badge !== '⛔') acc.nan.push(`${p}.value(null без ⛔)`);
      if (typeof value.value === 'number' && (value.value < value.range[0] || value.value > value.range[1])) acc.outOfRange.push(p);
    }
    Object.keys(value).forEach((k) => scan(value[k], `${p}.${k}`, acc));
  }
  return acc;
}

export class Check {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
    Object.freeze(this);
  }

  async run() {
    const t0 = performance.now();
    try {
      const detail = await this.fn();
      return { name: this.name, ok: true, detail: detail === undefined ? '' : String(detail), ms: Math.round((performance.now() - t0) * 10) / 10 };
    } catch (e) {
      return { name: this.name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Math.round((performance.now() - t0) * 10) / 10 };
    }
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

export class Harness {
  constructor(passport, checks) {
    this.passport = Object.freeze(JSON.parse(JSON.stringify(passport)));
    this.checks = Object.freeze(checks.slice());
    Object.freeze(this);
  }

  async run() {
    const results = [];
    for (const c of this.checks) results.push(await c.run());
    const red = results.filter((r) => !r.ok);
    return Object.freeze({
      fn: this.passport.fn,
      type: this.passport.type,
      layer: this.passport.layer,
      version: this.passport.version,
      status: red.length === 0 ? 'green' : 'red',
      checks: results,
      total_ms: Math.round(results.reduce((a, r) => a + r.ms, 0) * 10) / 10
    });
  }

  // --- Фабрики стандартных проверок по типам харнессов (3.7) ---

  // Тип 1: два прогона байт-в-байт.
  static determinism(runFn, inputs, runs) {
    const n = runs === undefined ? 2 : runs;
    return new Check(`детерминизм ×${n}`, () => {
      inputs.forEach((input, i) => {
        const first = JSON.stringify(runFn(input));
        for (let r = 1; r < n; r += 1) assert(JSON.stringify(runFn(input)) === first, `вход #${i}: прогон ${r + 1} отличается`);
      });
      return `${inputs.length} входов × ${n} прогонов, байт-в-байт`;
    });
  }

  // Edge-cases: каждый должен вернуть объект без NaN и без исключения.
  static edges(runFn, cases) {
    return new Check(`edge-cases ×${cases.length}`, () => {
      cases.forEach((c) => {
        const out = runFn(c.input);
        const s = scan(out);
        assert(s.nan.length === 0, `${c.name}: NaN в ${s.nan.join(', ')}`);
        if (c.expect !== undefined) c.expect(out, assert);
      });
      return cases.map((c) => c.name).join(' · ');
    });
  }

  // Стресс: N случайных входов — 0 NaN, 0 вне диапазона, время < бюджета.
  static stress(runFn, gen, n, budgetMs, seed) {
    return new Check(`стресс n=${n}`, () => {
      const rng = new Rng(seed === undefined ? 42 : seed);
      let nan = 0;
      let out = 0;
      let worst = 0;
      for (let i = 0; i < n; i += 1) {
        const input = gen(rng, i);
        const t0 = performance.now();
        const res = runFn(input);
        const dt = performance.now() - t0;
        worst = Math.max(worst, dt);
        const s = scan(res);
        nan += s.nan.length;
        out += s.outOfRange.length;
      }
      assert(nan === 0, `NaN: ${nan}`);
      assert(out === 0, `вне диапазона: ${out}`);
      assert(worst < budgetMs, `худшее время ${worst.toFixed(2)} мс ≥ ${budgetMs} мс`);
      return `${n} прогонов · 0 NaN · 0 вне диапазона · худшее ${worst.toFixed(2)} мс < ${budgetMs} мс`;
    });
  }

  // Golden-векторы: ожидание задаётся функцией или интервалом.
  static golden(runFn, cases) {
    return new Check(`golden ×${cases.length}`, () => {
      const lines = cases.map((c) => {
        const out = runFn(c.input);
        const got = c.pick(out);
        assert(typeof got === 'number' && Number.isFinite(got), `${c.id}: значение не число`);
        assert(got >= c.expect[0] && got <= c.expect[1], `${c.id}: ${got} ∉ [${c.expect[0]}, ${c.expect[1]}]`);
        return `${c.id}=${got}`;
      });
      return lines.join(' · ');
    });
  }

  static custom(name, fn) {
    return new Check(name, fn);
  }
}

export { assert };
