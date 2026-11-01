// Compare functional outcomes against current passports, excluding measured timings.
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export function normalizeReport(report, passports) {
  assert.equal(report.partial, false, 'report is incomplete');
  assert.equal(report.red, 0, 'report contains failures');
  assert.ok(passports.length > 0, 'no harness passports found');
  const expected = new Map(passports.map((passport) => [passport.fn, passport]));
  assert.equal(expected.size, passports.length, 'duplicate harness passports');
  assert.equal(report.functions.length, expected.size, 'unexpected suite count');
  assert.equal(report.green, expected.size, 'unexpected green count');
  const seen = new Set();
  const normalized = report.functions.map((fn) => {
    assert.ok(!seen.has(fn.fn), `duplicate suite: ${fn.fn}`);
    seen.add(fn.fn);
    const passport = expected.get(fn.fn);
    assert.ok(passport, `unexpected suite: ${fn.fn}`);
    for (const field of ['type', 'layer', 'version']) assert.equal(fn[field], passport[field], `${fn.fn}: ${field} mismatch`);
    assert.equal(fn.status, 'green');
    assert.ok(fn.checks.length > 0 && fn.checks.every((check) => check.ok === true), `${fn.fn}: empty or failed checks`);
    return {
      fn: fn.fn, type: fn.type, layer: fn.layer, version: fn.version, status: fn.status,
      checks: fn.checks.map(({ name, ok }) => ({ name, ok }))
    };
  });
  return normalized.sort((a, b) => a.fn.localeCompare(b.fn));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = new URL('../harness/', import.meta.url);
  const passports = readdirSync(directory).filter((name) => name.endsWith('.harness.json'))
    .map((name) => JSON.parse(readFileSync(new URL(name, directory), 'utf8')));
  const normalize = (path) => normalizeReport(JSON.parse(readFileSync(path, 'utf8')), passports);
  assert.deepEqual(normalize(process.argv[2]), normalize(process.argv[3]));
  console.log('Repeated runs match current passports, checks and outcomes (timings excluded).');
}
