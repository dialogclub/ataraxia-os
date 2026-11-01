import { Harness } from './Harness.mjs';
import { readFileSync } from 'node:fs';
import { reflectorChecks } from './synthesisHarness.mjs';

const passport = JSON.parse(readFileSync(new URL('./agent.Reflector.harness.json', import.meta.url), 'utf8'));
export const harness = new Harness(passport, reflectorChecks());
