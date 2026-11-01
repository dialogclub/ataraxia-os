import { readFileSync } from 'node:fs';
import { Harness } from './Harness.mjs';
import { validate, summarize } from '../core/jsonSchema.mjs';
import { buildAgentSchema, SPECS } from '../core/agents/agentSpecs.mjs';
import { GOLDEN, makeToolbox, BASE } from '../fixtures/agents/golden.mjs';

const passport = JSON.parse(readFileSync(new URL('./jsonSchema.harness.json', import.meta.url), 'utf8'));
const run = (i) => ({ errors: validate(i.schema, i.value) });
const S = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: ['string', 'null'], maxLength: 3 }, b: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'integer', minimum: 0, maximum: 9 } }, c: { enum: ['x', 'y', null] }, d: { type: 'string', pattern: '^[a-z]+$' }, e: { type: 'number' } } };

export const harness = new Harness(passport, [
  Harness.determinism(run, [{ schema: S, value: { a: 'ab' } }, { schema: S, value: { b: [1, -1, 3], z: 1 } }]),
  Harness.edges(run, [
    { name: 'type-union', input: { schema: S, value: { a: null } }, expect: (o, a) => a(o.errors.length === 0, 'null допустим для [string, null]') },
    { name: 'enum-null', input: { schema: S, value: { a: 'x', c: null } }, expect: (o, a) => a(o.errors.length === 0, 'null в enum') },
    { name: 'required', input: { schema: S, value: {} }, expect: (o, a) => a(o.errors.length === 1 && /\$\.a/.test(o.errors[0]), o.errors.join()) },
    { name: 'additional-false', input: { schema: S, value: { a: 'x', z: 1 } }, expect: (o, a) => a(o.errors.length === 1 && /лишнее/.test(o.errors[0]), o.errors.join()) },
    { name: 'nested', input: { schema: S, value: { a: 'x', b: [1, 'q'] } }, expect: (o, a) => a(o.errors.some((e) => e.startsWith('$.b[1]')), o.errors.join()) },
    { name: 'array-bounds', input: { schema: S, value: { a: 'x', b: [] } }, expect: (o, a) => a(o.errors.length === 1, 'minItems') },
    { name: 'string-bounds', input: { schema: S, value: { a: 'abcd' } }, expect: (o, a) => a(o.errors.length === 1, 'maxLength') },
    { name: 'number-bounds', input: { schema: S, value: { a: 'x', b: [10], e: Infinity } }, expect: (o, a) => a(o.errors.length === 2, o.errors.join()) },
    { name: 'pattern', input: { schema: S, value: { a: 'x', d: 'ABC' } }, expect: (o, a) => a(o.errors.length === 1, 'pattern') }
  ]),
  Harness.custom('все золотые ответы агентов проходят схемы своих агентов', () => {
    const tb = makeToolbox();
    const ids = Object.keys(SPECS);
    ids.forEach((id) => {
      const g = GOLDEN[id];
      const p = g.payload(new Map(g.tools.map((n) => [n, tb.run(n, {}, BASE)])));
      const errs = validate(buildAgentSchema(SPECS[id].fields), p);
      if (errs.length) throw new Error(`${id}: ${summarize(errs)}`);
    });
    return `${ids.length} схем × золотой ответ — 0 ошибок`;
  }),
  Harness.custom('summarize усекает длинный список ошибок', () => {
    const s = summarize(Array.from({ length: 10 }, (_, i) => `e${i}`), 3);
    if (!/…ещё 7/.test(s)) throw new Error(s);
    return s;
  }),
  Harness.stress(run, (rng) => ({ schema: S, value: rng.pick([{}, { a: 'x' }, { a: 5 }, { a: 'xxxx' }, { b: [1, 2, 3] }, { a: 'x', b: [rng.between(-5, 15)] }, { a: 'x', c: rng.pick(['x', 'z', null]) }, [], null, 'str', 7]) }), 2000, 2, 43)
]);
