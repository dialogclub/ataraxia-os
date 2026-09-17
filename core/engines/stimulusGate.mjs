// Гейт стимуляции: фотосенситивная зона 15–25 Гц непроходима, предел громкости, циркадное предупреждение.
// У объекта нет методов обхода — это проверяется харнессом (тип 5).
import { Param } from '../param.mjs';

const VERSION = '1.0';
const TOOL = 'stimulusGate';
const RULES = Object.freeze({
  flicker_block_hz: Object.freeze([15, 25]), // Harding/ISO 9241-391: зона риска фотосенситивной эпилепсии
  spl_limit_db: 85,                          // предел громкости (WHO safe listening, 85 дБ)
  spl_warn_db: 75,
  night_hours: Object.freeze([0, 5]),        // предупреждение «не своё время», не блок
  stop_budget_ms: 100
});

export class StimulusGate {
  constructor(mode) {
    this.mode = mode === 'pro' ? 'pro' : 'wellness';
    Object.freeze(this);
  }

  static rules() {
    return RULES;
  }

  // Вход: { flicker_hz, spl_db, hour_local }. Выход: решение + причины; числа как Param.
  decide(input) {
    const src = input === undefined || input === null ? {} : input;
    const blocks = [];
    const warnings = [];
    const hz = src.flicker_hz;
    const db = src.spl_db;
    const hour = src.hour_local;
    if (typeof hz === 'number' && Number.isFinite(hz)) {
      if (hz >= RULES.flicker_block_hz[0] && hz <= RULES.flicker_block_hz[1]) blocks.push(`мигание ${hz} Гц в зоне 15–25 Гц`);
      if (hz < 0) blocks.push('частота мигания отрицательна');
    } else if (hz !== undefined) {
      blocks.push('частота мигания не число');
    }
    if (typeof db === 'number' && Number.isFinite(db)) {
      if (db > RULES.spl_limit_db) blocks.push(`громкость ${db} дБ выше предела ${RULES.spl_limit_db} дБ`);
      else if (db > RULES.spl_warn_db) warnings.push(`громкость ${db} дБ: рекомендуется ниже ${RULES.spl_warn_db} дБ`);
    } else if (db !== undefined) {
      blocks.push('громкость не число');
    }
    if (typeof hour === 'number' && Number.isFinite(hour) && hour >= RULES.night_hours[0] && hour <= RULES.night_hours[1]) {
      warnings.push('циркадно «не своё» время (00:00–05:59)');
    }
    return Object.freeze({
      allowed: blocks.length === 0,
      mode: this.mode,
      blocks: Object.freeze(blocks),
      warnings: Object.freeze(warnings),
      flicker_hz: typeof hz === 'number' && Number.isFinite(hz)
        ? Param.measured(hz, 'Hz', [0, 60], TOOL, VERSION, '').json()
        : Param.missing('Hz', [0, 60], TOOL, VERSION, 'не задано').json(),
      spl_db: typeof db === 'number' && Number.isFinite(db)
        ? Param.measured(db, 'dB', [0, 120], TOOL, VERSION, '').json()
        : Param.missing('dB', [0, 120], TOOL, VERSION, 'не задано').json(),
      version: VERSION
    });
  }
}

// Аварийный стоп: сессия стимуляции проверяет флаг на каждом кадре; латентность замеряется.
export class StimulusSession {
  constructor(clock) {
    this.clock = clock;
    this.state = { running: true, pressedAt: Number.NaN, haltedAt: Number.NaN };
    Object.freeze(this);
  }

  running() {
    return this.state.running;
  }

  stop() {
    this.state.pressedAt = this.clock();
    this.state.running = false;
    this.state.haltedAt = this.clock();
    return this.latency();
  }

  // Латентность стопа в мс: обязана быть < 100 мс (харнесс типа 5).
  latency() {
    return Param.measured(this.state.haltedAt - this.state.pressedAt, 'ms', [0, RULES.stop_budget_ms], TOOL, VERSION, 'стоп: нажатие → остановка').json();
  }
}
