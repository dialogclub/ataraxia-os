import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Harness, Check } from '../harness/Harness.mjs';
import { normalizeReport } from '../scripts/compare-reports.mjs';

const passport = { fn: 'sample', type: 'unit', layer: 'L1', version: '1' };
const check = { name: 'result', ok: true, detail: 'timing text', ms: 1 };
const suite = { ...passport, status: 'green', checks: [check], total_ms: 1 };
const report = () => ({ partial: false, red: 0, green: 1, functions: [structuredClone(suite)] });

test('empty harness cannot be green', () => assert.throws(() => new Harness(passport, [])));
test('custom false result fails', async () => assert.equal((await new Check('false', () => false).run()).ok, false));
test('async rejection becomes a failed check', async () => assert.equal((await new Check('reject', async () => { throw new Error('sentinel'); }).run()).ok, false));
test('async nondeterminism is detected', async () => {
  let value = 0;
  assert.equal((await Harness.determinism(async () => ({ value: value += 1 }), [{}]).run()).ok, false);
});
test('async deterministic engine passes', async () => assert.equal((await Harness.determinism(async () => ({ value: 1 }), [{}]).run()).ok, true));
test('empty determinism and single run are rejected', () => {
  assert.throws(() => Harness.determinism(() => 1, []));
  assert.throws(() => Harness.determinism(() => 1, [{}], 1));
});
test('edge case rejects a value outside its Param range', async () => {
  const result = await Harness.edges(() => ({ value: 2, range: [0, 1], badge: 'measured' }), [{ name: 'range', input: {} }]).run();
  assert.equal(result.ok, false);
});
test('async edge expectation is awaited', async () => {
  const result = await Harness.edges(async () => ({}), [{ name: 'async', input: {}, expect: async () => { throw new Error('sentinel'); } }]).run();
  assert.equal(result.ok, false);
});
test('false edge expectation fails', async () => assert.equal((await Harness.edges(() => ({}), [{ name: 'false', input: {}, expect: () => false }]).run()).ok, false));
test('empty edge and golden cases are rejected', () => {
  assert.throws(() => Harness.edges(() => ({}), []));
  assert.throws(() => Harness.golden(() => ({}), []));
});
test('async golden values are checked', async () => {
  const cases = [{ id: 'gold', input: {}, pick: (out) => out.x, expect: [1, 1] }];
  assert.equal((await Harness.golden(async () => ({ x: 1 }), cases).run()).ok, true);
  assert.equal((await Harness.golden(async () => ({ x: 2 }), cases).run()).ok, false);
});
test('async stress detects non-finite output', async () => assert.equal((await Harness.stress(async () => ({ x: Infinity }), () => ({}), 1, 1000).run()).ok, false));
test('invalid stress counts and budgets are rejected', () => {
  for (const n of [0, -1, 1.5, NaN]) assert.throws(() => Harness.stress(() => ({}), () => ({}), n, 10));
  for (const budget of [0, -1, Infinity, NaN]) assert.throws(() => Harness.stress(() => ({}), () => ({}), 1, budget));
});
test('report supports a newly added suite without a hard-coded count', () => assert.equal(normalizeReport(report(), [passport]).length, 1));
test('partial and failed reports are rejected', () => {
  assert.throws(() => normalizeReport({ ...report(), partial: true }, [passport]));
  assert.throws(() => normalizeReport({ ...report(), red: 1 }, [passport]));
});
test('duplicate suite cannot substitute for a missing suite', () => {
  const data = { ...report(), green: 2, functions: [suite, suite] };
  assert.throws(() => normalizeReport(data, [passport, { ...passport, fn: 'other' }]));
});
test('passport version mismatch fails', () => assert.throws(() => normalizeReport(report(), [{ ...passport, version: '2' }])));
test('empty or failed checks cannot be green', () => {
  for (const checks of [[], [{ ...check, ok: false }]]) {
    const data = report(); data.functions[0].checks = checks;
    assert.throws(() => normalizeReport(data, [passport]));
  }
});
test('timing differences are ignored but changed check names are retained', () => {
  const first = report(); const second = report();
  second.functions[0].checks[0].ms = 999;
  second.functions[0].checks[0].detail = 'different elapsed time';
  assert.deepEqual(normalizeReport(first, [passport]), normalizeReport(second, [passport]));
  second.functions[0].checks[0].name = 'different check';
  assert.notDeepEqual(normalizeReport(first, [passport]), normalizeReport(second, [passport]));
});
test('runner writes a red report on import error and continues other suites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atmaraksi-runner-'));
  try {
    copyFileSync(new URL('../harness/runner.mjs', import.meta.url), join(dir, 'runner.mjs'));
    writeFileSync(join(dir, 'broken.harness.json'), JSON.stringify({ ...passport, fn: 'broken' }));
    writeFileSync(join(dir, 'sample.harness.json'), JSON.stringify(passport));
    writeFileSync(join(dir, 'sample.test.mjs'), `export const harness = { run: async () => (${JSON.stringify(suite)}) };`);
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report()));
    const result = spawnSync(process.execPath, [join(dir, 'runner.mjs'), 'all'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    const data = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(data.partial, false);
    assert.equal(data.red, 1); assert.equal(data.green, 1);
    assert.equal(data.functions.find((fn) => fn.fn === 'broken').status, 'red');
    assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /broken/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runner rejects inconsistent green results and mismatched passports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atmaraksi-runner-'));
  try {
    copyFileSync(new URL('../harness/runner.mjs', import.meta.url), join(dir, 'runner.mjs'));
    writeFileSync(join(dir, 'sample.harness.json'), JSON.stringify(passport));
    for (const result of [{ ...suite, checks: [] }, { ...suite, version: 'wrong' }, { ...suite, checks: [{ ...check, ok: false }] }]) {
      writeFileSync(join(dir, 'sample.test.mjs'), `export const harness = { run: async () => (${JSON.stringify(result)}) };`);
      const run = spawnSync(process.execPath, [join(dir, 'runner.mjs'), 'all'], { encoding: 'utf8', timeout: 10000 });
      assert.equal(run.status, 1, run.stderr);
      assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).red, 1);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('malformed passport cannot leave a previous successful report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atmaraksi-runner-'));
  try {
    copyFileSync(new URL('../harness/runner.mjs', import.meta.url), join(dir, 'runner.mjs'));
    writeFileSync(join(dir, 'broken.harness.json'), '{');
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report()));
    const run = spawnSync(process.execPath, [join(dir, 'runner.mjs'), 'all'], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(run.status, 0);
    const data = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(data.partial, true); assert.equal(data.green, 0);
    assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /ещё не завершён/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
