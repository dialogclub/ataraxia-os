// Хронометраж Башкина: 1 игровая минута ≈ 60 дней биографического времени.
// Калибровочная оговорка: коэффициент 60 — конвенция методологии, не измерение.
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'chronometry';
const DAYS_PER_MINUTE = 60;
const DAYS_PER_YEAR = 365.25;

export class Chronometry {
  constructor(daysPerMinute) {
    this.daysPerMinute = typeof daysPerMinute === 'number' && daysPerMinute > 0 ? daysPerMinute : DAYS_PER_MINUTE;
    Object.freeze(this);
  }

  // Игровые минуты → биографические дни и годы.
  run(input) {
    const src = input === undefined || input === null ? {} : input;
    const m = src.game_minutes;
    if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) {
      return Object.freeze({
        status: 'missing',
        reason: 'нет игровых минут',
        days: Param.missing('days', [0, 36525], TOOL, VERSION, 'нет входа').json(),
        years: Param.missing('years', [0, 100], TOOL, VERSION, 'нет входа').json(),
        version: VERSION
      });
    }
    const days = m * this.daysPerMinute;
    return Object.freeze({
      status: 'ok',
      reason: '',
      days: Param.measured(days, 'days', [0, 36525], TOOL, VERSION, `${this.daysPerMinute} дней за минуту`).json(),
      years: Param.measured(days / DAYS_PER_YEAR, 'years', [0, 100], TOOL, VERSION, 'год = 365,25 дня').json(),
      version: VERSION
    });
  }

  // Обратное преобразование: биографический возраст → игровое время.
  minutesFor(years) {
    if (typeof years !== 'number' || !Number.isFinite(years) || years < 0) return Param.missing('min', [0, 600], TOOL, VERSION, 'нет входа').json();
    return Param.measured((years * DAYS_PER_YEAR) / this.daysPerMinute, 'min', [0, 600], TOOL, VERSION, '').json();
  }
}
