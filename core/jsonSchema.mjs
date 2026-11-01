// Минимальный валидатор JSON Schema (подмножество, достаточное для строгих выходов агентов).
// Поддержано: type (в т.ч. массив типов), enum, const, required, properties, additionalProperties:false,
// items, minItems/maxItems, minLength/maxLength, minimum/maximum, pattern. Без $ref/oneOf — схемы агентов плоские.
// Возвращает массив строк-ошибок с путями; пустой массив = валидно. Детерминирован, без зависимостей.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

export function validate(schema, value, path) {
  const p = path === undefined ? '$' : path;
  const errors = [];
  if (schema === undefined || schema === null || typeof schema !== 'object') return errors;
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${p}: ожидалось ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${p}: значение вне перечня ${JSON.stringify(schema.enum)}`);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) { errors.push(`${p}: тип ${typeOf(value)}, ожидался ${types.join('|')}`); return errors; }
  }
  const actual = typeOf(value);
  if (actual === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${p}: строка короче ${schema.minLength}`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${p}: строка длиннее ${schema.maxLength}`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${p}: не соответствует шаблону ${schema.pattern}`);
  }
  if (actual === 'number' || actual === 'integer') {
    if (!Number.isFinite(value)) errors.push(`${p}: не конечное число`);
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${p}: меньше ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${p}: больше ${schema.maximum}`);
  }
  if (actual === 'array') {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${p}: элементов меньше ${schema.minItems}`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${p}: элементов больше ${schema.maxItems}`);
    if (schema.items !== undefined) value.forEach((item, i) => errors.push(...validate(schema.items, item, `${p}[${i}]`)));
  }
  if (actual === 'object') {
    const props = schema.properties === undefined ? {} : schema.properties;
    (Array.isArray(schema.required) ? schema.required : []).forEach((k) => { if (!(k in value)) errors.push(`${p}.${k}: обязательное поле отсутствует`); });
    Object.keys(value).forEach((k) => {
      if (props[k] !== undefined) errors.push(...validate(props[k], value[k], `${p}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${p}.${k}: лишнее поле`);
    });
  }
  return errors;
}

// Для сообщений модели: не более n ошибок, чтобы не раздувать контекст.
export function summarize(errors, n) {
  const limit = n === undefined ? 6 : n;
  return errors.length <= limit ? errors.join('; ') : `${errors.slice(0, limit).join('; ')}; …ещё ${errors.length - limit}`;
}
