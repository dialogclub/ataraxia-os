// Compare functional outcomes; timestamps and measured timings vary per run.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const normalize = (path) => {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(report.partial, false);
  assert.equal(report.red, 0);
  assert.equal(report.functions.length, 11);
  assert.equal(report.green, 11);
  for (const fn of report.functions) {
    assert.equal(fn.status, 'green');
    assert.ok(fn.checks.length > 0 && fn.checks.every(check => check.ok === true));
  }
  return report.functions.map((fn) => ({
    fn: fn.fn, type: fn.type, layer: fn.layer, version: fn.version, status: fn.status,
    checks: fn.checks.map(({ name, ok }) => ({ name, ok }))
  }));
};
assert.deepEqual(normalize(process.argv[2]), normalize(process.argv[3]));
console.log('Repeated runs have identical suites, checks and outcomes (timings excluded).');
