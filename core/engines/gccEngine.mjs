// SMFK-100: групповой коэффициент совместимости Gcc = (Π Cr_i·Sr_i)^(1/n) × (1 − pvariance(Of)).
// Эвристика функциональной комплементарности; не клинический тест совместимости (см. схему CompatibilityArtifact.v1).
// Fail-closed при n < 3 — как в python/ataraxia_dsp/smfk.py (одна формула, одно правило).
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'gccEngine';
const FORMULA = 'prod(Cr_i*Sr_i)**(1/n) * (1 - pvariance(Of))';
const MIN_N = 3;

function unit(x) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

export class GccEngine {
  constructor(precision) {
    this.precision = typeof precision === 'number' ? precision : 6;
    Object.freeze(this);
  }

  run(input) {
    const members = input === undefined || input === null || !Array.isArray(input.members) ? [] : input.members;
    const valid = members.filter((m) => m !== null && typeof m === 'object' && unit(m.Cr) && unit(m.Sr) && unit(m.Of));
    if (valid.length < MIN_N || valid.length !== members.length) {
      return Object.freeze({
        status: 'missing',
        reason: valid.length !== members.length ? 'у участника нет Cr/Sr/Of в [0,1]' : `fail-closed: нужно ≥ ${MIN_N} участников`,
        n: members.length,
        formula: FORMULA,
        Gcc: Param.missing('index', [0, 1], TOOL, VERSION, 'нет входа').json(),
        geometric_mean_CrSr: Param.missing('index', [0, 1], TOOL, VERSION, 'нет входа').json(),
        sigma2_Of: Param.missing('index', [0, 0.25], TOOL, VERSION, 'нет входа').json()
      });
    }
    const n = valid.length;
    // Геометрическое среднее через сумму логарифмов — устойчиво к малым произведениям.
    const logSum = valid.reduce((acc, m) => acc + Math.log(Math.max(m.Cr * m.Sr, Number.MIN_VALUE)), 0);
    const geo = Math.exp(logSum / n);
    const mean = valid.reduce((acc, m) => acc + m.Of, 0) / n;
    const variance = valid.reduce((acc, m) => acc + (m.Of - mean) * (m.Of - mean), 0) / n;
    const round = (x) => Number(x.toFixed(this.precision));
    return Object.freeze({
      status: 'ok',
      reason: '',
      n,
      formula: FORMULA,
      Gcc: Param.measured(round(geo * (1 - variance)), 'index', [0, 1], TOOL, VERSION, 'функциональная комплементарность, не диагноз').json(),
      geometric_mean_CrSr: Param.measured(round(geo), 'index', [0, 1], TOOL, VERSION, '').json(),
      sigma2_Of: Param.measured(round(variance), 'index', [0, 0.25], TOOL, VERSION, 'дисперсия генеральной совокупности').json()
    });
  }
}
