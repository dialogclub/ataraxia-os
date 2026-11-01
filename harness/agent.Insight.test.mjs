import { Harness } from './Harness.mjs';
import { readFileSync } from 'node:fs';
import { domainAgentChecks } from './agentHarness.mjs';

const passport = JSON.parse(readFileSync(new URL('./agent.Insight.harness.json', import.meta.url), 'utf8'));
export const harness = new Harness(passport, domainAgentChecks('Insight'));
