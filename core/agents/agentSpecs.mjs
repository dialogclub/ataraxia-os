// Спецификации доменных агентов L2: схема полей, зависимости, проверки согласованности с инструментами,
// запись в SCP (только в собственные поля из карточки агента). Тексты промптов — в prompts/*.ru.md → registry/prompts.registry.json.
import { verifyQuote } from './evidence.mjs';

const STR = (max) => ({ type: ['string', 'null'], maxLength: max === undefined ? 400 : max });
const MODE = { enum: ['А', 'Б', 'В', 'Г'] };
const LEVEL = { enum: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8'] };

const EVIDENCE = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { enum: ['quote', 'measure', 'claim'] },
    quote: { type: 'string', maxLength: 300 }, speaker: { type: 'string', maxLength: 24 }, t: { type: 'string', maxLength: 12 },
    tool: { type: 'string', maxLength: 40 }, path: { type: 'string', maxLength: 80 },
    ref: { type: 'string', maxLength: 60 }
  }
};

// Общая оболочка выхода: summary · claims[] · fields · limits[] (claimed_badge — самооценка модели, рантайм её не принимает на веру).
export function buildAgentSchema(fields) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'claims', 'fields', 'limits'],
    properties: {
      summary: { type: 'string', minLength: 1, maxLength: 280 },
      claims: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'evidence'], properties: {
        id: { type: 'string', pattern: '^[a-z0-9_]{1,24}$' }, text: { type: 'string', minLength: 3, maxLength: 400 },
        evidence: { type: 'array', maxItems: 4, items: EVIDENCE }, claimed_badge: { enum: ['🟢', '🟡', '🔵', '⛔'] } } } },
      fields,
      limits: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 200 } }
    }
  };
}

const obj = (props, required) => ({ type: 'object', additionalProperties: false, required: required === undefined ? Object.keys(props) : required, properties: props });
const DISPLACEMENT = obj({ quote: { type: 'string', maxLength: 300 }, speaker: { type: 'string', maxLength: 24 }, t: { type: 'string', maxLength: 12 }, away_from: { type: 'string', maxLength: 200 } });

export const SPECS = Object.freeze({
  Requestor: { depends_on: [], fields: obj({ explicit: STR(), latent: STR() }),
    write: (f) => [['request.explicit', f.explicit === null ? '' : f.explicit], ['request.latent', f.latent === null ? '' : f.latent]] },
  Veritas: { depends_on: [], fields: obj({ veracity_level: { enum: ['низкая', 'средняя', 'высокая', 'не определить'] }, displacements: { type: 'array', maxItems: 5, items: DISPLACEMENT } }),
    // Каждая смещённая речь — это цитата: проверяется так же, как якорь.
    extraEvidence: (f) => f.displacements.map((d) => ({ type: 'quote', quote: d.quote, speaker: d.speaker, t: d.t })),
    write: (f) => [['request.veracity', { level: f.veracity_level }], ['request.displacements', f.displacements]] },
  Obstacle: { depends_on: [], fields: obj({ kind: { enum: ['внутреннее', 'внешнее', 'смешанное', 'не определить'] }, description: STR() }),
    write: (f) => [['obstacle', { kind: f.kind, description: f.description }]] },
  Insight: { depends_on: ['Requestor', 'Obstacle'], fields: obj({ intuitive_solution: STR(), insight: STR() }),
    write: (f) => [['intuition', { text: f.intuitive_solution }], ['insight', { text: f.insight }]] },
  Libertas: { depends_on: ['Obstacle'], fields: obj({ options: { type: 'array', maxItems: 4, items: obj({ mode: MODE, text: { type: 'string', maxLength: 300 } }) }, recommended_mode: { enum: ['А', 'Б', 'В', 'Г', null] } }),
    write: (f) => [['liberty', { options: f.options, recommended_mode: f.recommended_mode }]] },
  Qualitas: { depends_on: ['Libertas', 'Insight'], fields: obj({ new_quality: STR(), rationale: STR() }),
    write: (f) => [['quality', { new_quality: f.new_quality, rationale: f.rationale }]] },
  Grounding: { depends_on: [], fields: obj({ entry_level: { enum: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', null] }, gap: { enum: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'нет', null] }, liberty_mode: { enum: ['А', 'Б', 'В', 'Г', 'нет', null] } }),
    // Разрыв и модус — измерения инструмента; агент обязан их повторить, а не придумать.
    consistency: (f, tools) => {
      const out = tools.get('groundingClassifier');
      if (!out || out.status !== 'ok') return [];
      const errs = [];
      const gap = out.gap === '' ? 'нет' : out.gap;
      const mode = out.liberty_mode === '' ? 'нет' : out.liberty_mode;
      if (f.gap !== null && f.gap !== gap) errs.push(`fields.gap=${f.gap} расходится с groundingClassifier (${gap})`);
      if (f.liberty_mode !== null && f.liberty_mode !== mode) errs.push(`fields.liberty_mode=${f.liberty_mode} расходится с groundingClassifier (${mode})`);
      return errs;
    },
    write: (f) => [['czi8.reading', { entry_level: f.entry_level, gap: f.gap, liberty_mode: f.liberty_mode }]] },
  CascadeABC: { depends_on: [], fields: obj({ reading: STR(600) }),
    requiresMeasureTool: 'cascadeEngine',
    write: (f) => [['cascade.reading', f.reading]] },
  Drives: { depends_on: [], fields: obj({ dominant: { enum: ['Theromata', 'Alligantia', 'Phobon', 'Dominix', 'Agonix', 'не определить'] }, notes: STR() }),
    write: (f) => [['drives.reading', { dominant: f.dominant, notes: f.notes }]] },
  Chronotope: { depends_on: [], fields: obj({ orientation: { enum: ['прошлое', 'настоящее', 'будущее', 'смешанная', 'не определить'] }, frozen_time: { type: ['boolean', 'null'] } }),
    write: (f) => [['frames.chronotope', { orientation: f.orientation, frozen_time: f.frozen_time }]] },
  Berne: { depends_on: [], fields: obj({ script_hypothesis: STR(), games: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 160 } } }),
    write: (f) => [['frames.berne', { script_hypothesis: f.script_hypothesis, games: f.games }]] },
  Archetype: { depends_on: [], fields: obj({ archetypes: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 60 } } }),
    write: (f) => [['narrative.archetypes', f.archetypes]] },
  Memory: { depends_on: [], fields: obj({ similar: { type: 'array', maxItems: 5, items: obj({ id: { type: 'string', maxLength: 24 }, relevance: { type: 'string', maxLength: 240 } }) } }),
    // «Не выдумывать кейсы»: id только из результата инструмента; пустой результат → пустой список.
    consistency: (f, tools) => {
      const out = tools.get('memorySearchTool');
      if (!out) return [];
      const known = new Set((out.hits || []).map((h) => h.id));
      const errs = f.similar.filter((s) => !known.has(s.id)).map((s) => `кейс ${s.id} отсутствует в результате memorySearchTool`);
      if (known.size === 0 && f.similar.length > 0) errs.push('memorySearchTool вернул 0 совпадений — список similar должен быть пустым');
      return errs;
    },
    write: (f) => [['memory.reading', f.similar]] }
});

export const DOMAIN_AGENTS = Object.freeze(Object.keys(SPECS));

// Ссылки на расширенные якоря (смещённая речь) собираются отдельным шагом рантайма.
export function evidenceFromFields(id, fields) {
  const spec = SPECS[id];
  return spec !== undefined && typeof spec.extraEvidence === 'function' ? spec.extraEvidence(fields) : [];
}

export function checkFieldQuotes(id, fields, lines) {
  return evidenceFromFields(id, fields).map((ev) => ({ ev, ...verifyQuote(ev, lines) })).filter((r) => !r.ok);
}
