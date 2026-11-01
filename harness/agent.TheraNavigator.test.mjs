import { Harness } from './Harness.mjs';
import { readFileSync } from 'node:fs';
import { theraChecks } from './synthesisHarness.mjs';

const passport = JSON.parse(readFileSync(new URL('./agent.TheraNavigator.harness.json', import.meta.url), 'utf8'));
export const harness = new Harness(passport, theraChecks());
