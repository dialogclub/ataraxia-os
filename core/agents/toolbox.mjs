// Инструменты L1, доступные агентам L2 в ReAct-цикле. Агент не считает — он вызывает эти инструменты,
// результаты берутся из тех же детерминированных движков, что и интерфейс (одни и те же числа).
// Вход инструмента от модели ограничен безопасными параметрами; данные сессии берутся из контекста.
import { Param } from '../param.mjs';

// Компактный вид для модели: Param → { value, unit, badge, note }; тяжёлые массивы (спектрограмма, треки) отбрасываются.
export function compact(node, depth) {
  const d = depth === undefined ? 0 : depth;
  if (node === null || node === undefined) return null;
  if (typeof node === 'number') return Number.isFinite(node) ? Number(node.toFixed(4)) : null;
  if (typeof node === 'string' || typeof node === 'boolean') return node;
  if (d > 7) return '…';
  if (Array.isArray(node)) return node.length > 40 ? `[${node.length} элементов]` : node.map((x) => compact(x, d + 1));
  if (typeof node === 'object') {
    if ('badge' in node && 'range' in node && 'unit' in node) {
      return { value: typeof node.value === 'number' && Number.isFinite(node.value) ? Number(node.value.toFixed(4)) : null, unit: node.unit, badge: node.badge, ...(node.note ? { note: node.note } : {}) };
    }
    const out = {};
    Object.keys(node).forEach((k) => { if (k !== 'spectrogram' && k !== 'track' && k !== 'items') out[k] = compact(node[k], d + 1); });
    return out;
  }
  return String(node);
}

const FOCUS = { type: 'string', description: 'Спикер-фокус; по умолчанию фокус сессии' };

export const TOOL_DEFS = Object.freeze({
  lexisTool: { description: 'ЛЕКСИС (детерминированный): доли местоимений я/мы/ты/они, модальность (долженствование/возможность), Zimbardo-прокси, спикер-баланс, тепловая карта по транскрипту.', input_schema: { type: 'object', properties: { focus: FOCUS }, additionalProperties: false } },
  groundingClassifier: { description: 'ЦЗИ-8 (детерминированный): профиль долей контуров K1–K8 по высказываниям спикера, разрыв контура, модус свободы воли А/Б/В/Г.', input_schema: { type: 'object', properties: { focus: FOCUS }, additionalProperties: false } },
  cascadeEngine: { description: 'Каскад АВС (детерминированный): B = Φ × (A·D·C) по параметрам запуска; вклад факторов и резерв роста.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  memorySearchTool: { description: 'Память кейсов: top-k похожих кейсов с реальными исходами (индекс LOCAL или MCP). Пустой результат — норма; кейсы не выдумывать.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Запрос; по умолчанию речь фокус-участника' }, k: { type: 'integer', minimum: 1, maximum: 8 } }, additionalProperties: false } },
  phonoSemTool: { description: 'VAAL-lite (🔵 реконструкция): 25 шкал Журавлёва, полярность, контент-анализ, эмоции Плутчика по тексту спикера.', input_schema: { type: 'object', properties: { focus: FOCUS }, additionalProperties: false } },
  prosodyTool: { description: 'ХРОНОС (детерминированный): просодика по загруженному аудио. Без аудио возвращает status=missing — тогда просодика ⛔.', input_schema: { type: 'object', properties: {}, additionalProperties: false } }
});

export class Toolbox {
  // engines: { lexis, grounding, cascade, memory, phono, prosody } — экземпляры движков L1.
  constructor(engines) {
    this.engines = engines;
    Object.freeze(this);
  }

  names() {
    return Object.keys(TOOL_DEFS);
  }

  defs(names) {
    return names.filter((n) => TOOL_DEFS[n] !== undefined).map((n) => ({ name: n, description: TOOL_DEFS[n].description, input_schema: TOOL_DEFS[n].input_schema }));
  }

  // ctx: { lines, focus, cascade: {A,D,C,phi,form}, audio?: {pcm, sr}, memoryK? }
  run(name, input, ctx) {
    const e = this.engines;
    const inp = input !== null && typeof input === 'object' ? input : {};
    const focus = typeof inp.focus === 'string' && inp.focus !== '' ? inp.focus : ctx.focus;
    const lines = ctx.lines;
    const textOf = (spk) => lines.filter((l) => spk === undefined || spk === '' || l.speaker === spk).map((l) => l.text);
    if (name === 'lexisTool') return e.lexis.run({ lines: lines.map((l) => ({ speaker: l.speaker, text: l.text, t: l.t })), focus });
    if (name === 'groundingClassifier') { const st = textOf(focus); return e.grounding.run({ statements: st.length ? st : textOf('') }); }
    if (name === 'cascadeEngine') return new e.cascadeCtor(ctx.cascade && ctx.cascade.form === 'cbrt' ? 'cbrt' : 'none').run(ctx.cascade);
    if (name === 'memorySearchTool') {
      const q = typeof inp.query === 'string' && inp.query.trim() !== '' ? inp.query : textOf(focus).join(' ') || textOf('').join(' ');
      return e.memory.search(q, Number.isInteger(inp.k) ? inp.k : 3);
    }
    if (name === 'phonoSemTool') return e.phono.run({ text: textOf(focus).join(' ') || textOf('').join(' ') });
    if (name === 'prosodyTool') {
      if (!ctx.audio) return Object.freeze({ status: 'missing', reason: 'нет аудио', f0: { mean: Param.missing('Hz', [60, 500], 'prosodyTool', '1.0', 'нет аудио').json() } });
      return e.prosody.run({ pcm: ctx.audio.pcm, sr: ctx.audio.sr });
    }
    throw new Error(`неизвестный инструмент ${name}`);
  }
}
