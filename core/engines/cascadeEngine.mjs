// Каскад АВС: B = Φ × (A · D · C) — каноническая форма; вариант SESSIO-MAS: B = Φ × ∛(A · D · C).
// Обе формы — опции одного движка с явным флагом form и версией формулы в выводе.
// Калибровочная оговорка: коэффициенты A/D/C/Φ приходят из агентов L2 или ручного ввода;
// движок только считает и объясняет вклад — никакой интерпретации.
import { Param } from '../param.mjs';

const FORMULA_VERSION = '1.0';
const TOOL = 'cascadeEngine';
const FORMS = Object.freeze(['none', 'cbrt']);
const DRIVES = Object.freeze(['Theromata', 'Alligantia', 'Phobon', 'Dominix', 'Agonix']);

function unit(x) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

function product(a, d, c, form) {
  const p = a * d * c;
  return form === 'cbrt' ? Math.cbrt(p) : p;
}

export class CascadeEngine {
  constructor(form) {
    this.form = FORMS.includes(form) ? form : 'none';
    Object.freeze(this);
  }

  static forms() {
    return FORMS.slice();
  }

  // Вход: { A, D, C, phi, drives? }. Выход: объект без голых чисел.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const missing = ['A', 'D', 'C', 'phi'].filter((k) => !unit(src[k]));
    if (missing.length > 0) {
      return Object.freeze({
        status: 'missing',
        reason: `нет входа: ${missing.join(', ')}`,
        form: this.form,
        formula_version: FORMULA_VERSION,
        B: Param.missing('index', [0, 1], TOOL, FORMULA_VERSION, `нет входа: ${missing.join(', ')}`).json(),
        contributions: {},
        drives: {}
      });
    }
    const b = src.phi * product(src.A, src.D, src.C, this.form);
    // Вклад фактора = насколько вырос бы B, если бы фактор стал равен 1 (объяснимо, без весов).
    const gain = (key) => {
      const alt = { A: src.A, D: src.D, C: src.C };
      alt[key] = 1;
      return src.phi * product(alt.A, alt.D, alt.C, this.form) - b;
    };
    const contributions = {
      A: Param.measured(src.A, 'index', [0, 1], TOOL, FORMULA_VERSION, `резерв +${gain('A').toFixed(2)}`).json(),
      D: Param.measured(src.D, 'index', [0, 1], TOOL, FORMULA_VERSION, `резерв +${gain('D').toFixed(2)}`).json(),
      C: Param.measured(src.C, 'index', [0, 1], TOOL, FORMULA_VERSION, `резерв +${gain('C').toFixed(2)}`).json(),
      phi: Param.measured(src.phi, 'index', [0, 1], TOOL, FORMULA_VERSION, `Φ-порог; резерв +${(product(src.A, src.D, src.C, this.form) - b).toFixed(2)}`).json()
    };
    const drives = {};
    DRIVES.forEach((name) => {
      const v = src.drives === undefined || src.drives === null ? undefined : src.drives[name];
      drives[name] = unit(v)
        ? Param.measured(v, 'index', [0, 1], TOOL, FORMULA_VERSION, '').json()
        : Param.missing('index', [0, 1], TOOL, FORMULA_VERSION, 'драйв не задан').json();
    });
    return Object.freeze({
      status: 'ok',
      reason: '',
      form: this.form,
      formula_version: FORMULA_VERSION,
      B: Param.measured(Math.min(1, Math.max(0, b)), 'index', [0, 1], TOOL, FORMULA_VERSION, this.form === 'cbrt' ? 'B = Φ × ∛(A·D·C)' : 'B = Φ × (A·D·C)').json(),
      contributions,
      drives
    });
  }
}
