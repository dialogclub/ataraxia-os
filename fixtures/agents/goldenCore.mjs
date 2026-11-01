// Золотые сценарии агентов (чистый модуль без node:fs — работает и в харнессе, и в браузерном аудите интерфейса).
// Это тестовый двойник модели: он проверяет КОНТРАКТ рантайма. Живое качество модели не измеряет (live_eval: not_run).
// Цитаты — дословно из демо-транскрипта core/demo.mjs.
import { Transcript } from '../../core/transcript.mjs';
import { DEMO_TRANSCRIPT } from '../../core/demo.mjs';

export const LINES = new Transcript(DEMO_TRANSCRIPT).lines;
export const BASE = Object.freeze({ lines: LINES, focus: 'К.', mode: 'session', cascade: Object.freeze({ A: 0.85, D: 0.78, C: 0.79, phi: 0.65, form: 'none' }), audio: undefined, selectedModel: 'claude-opus-5-5', overrides: undefined, l1Notes: 'просодика ⛔: нет аудио' });

const Q = (quote, t, speaker) => ({ type: 'quote', quote, speaker: speaker === undefined ? 'К.' : speaker, t });
const M = (tool, path) => ({ type: 'measure', tool, path });
const C = (ref) => ({ type: 'claim', ref });

// payload(tools: Map имя → вывод) → объект submit_result. expect — ожидаемые бейджи утверждений и бейдж карточки.
export const GOLDEN = Object.freeze({
  Requestor: { tools: ['lexisTool'], expect: { badges: { c1: '🟡', c2: '🟡', c3: '🟢' }, card: '🟢' },
    payload: () => ({ summary: 'Явный запрос — усталость и отсутствие желаний; скрытый — быть увиденным без необходимости «держать» образ.',
      claims: [
        { id: 'c1', text: 'Явный запрос: участник называет усталость и отсутствие желаний.', evidence: [Q('Я просто устал. Ничего не хочу', '[10:02]')] },
        { id: 'c2', text: 'Скрытый запрос — перестать «держать» образ; это гипотеза по фразе о «делаю вид».', evidence: [Q('делаю вид, что держу', '[10:03]')] },
        { id: 'c3', text: 'В речи участника заметна модальность долженствования.', evidence: [M('lexisTool', 'modality.must')] }],
      fields: { explicit: 'Устал, ничего не хочу', latent: 'Быть увиденным, а не «держать» образ (гипотеза)' }, limits: [] }) },
  Veritas: { tools: ['lexisTool'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Один эпизод смещённой речи: на вопрос о реакции жены участник переводит разговор на работу.',
      claims: [{ id: 'c1', text: 'Смещённая речь: уход от вопроса о том, что будет, если жена узнает.', evidence: [Q('Давайте лучше про работу поговорим', '[10:07]')] }],
      fields: { veracity_level: 'средняя', displacements: [{ quote: 'Давайте лучше про работу поговорим', speaker: 'К.', t: '[10:07]', away_from: 'вопрос о реакции жены' }] }, limits: ['просодика ⛔: нет аудио'] }) },
  Obstacle: { tools: ['lexisTool'], expect: { badges: { c1: '🟡', c2: '🔵' }, card: '🟡' },
    payload: () => ({ summary: 'Внутреннее препятствие — установка «должен тянуть».',
      claims: [
        { id: 'c1', text: 'Внутреннее препятствие: убеждение, что нужно «тянуть» несмотря на усталость.', evidence: [Q('Но я должен тянуть', '[10:09]')] },
        { id: 'c2', text: 'Возможный страх раскрытия слабости перед женой.', evidence: [] }],
      fields: { kind: 'внутреннее', description: 'Установка «должен тянуть»' }, limits: [] }) },
  Insight: { tools: ['lexisTool'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Озарение близко: «должен» — слово отца.',
      claims: [{ id: 'c1', text: 'Озарение: «должен» принадлежит отцу, а не участнику.', evidence: [Q('Отца. Он всегда так говорил', '[10:12]'), C('Obstacle.c1')] }],
      fields: { intuitive_solution: 'Рассказать жене об усталости и пересмотреть, чья это обязанность «тянуть»', insight: '«Должен» — голос отца: «Я и не заметил, как стал им»' }, limits: [] }) },
  Libertas: { tools: ['groundingClassifier'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Выход через переосмысление «должен» как чужой установки.',
      claims: [{ id: 'c1', text: 'Вариант Б: переосмыслить «должен» как установку отца.', evidence: [Q('Он всегда так говорил', '[10:12]'), C('Obstacle.c1')] }],
      fields: { options: [{ mode: 'А', text: 'Побыть с усталостью, не оценивая её' }, { mode: 'Б', text: 'Переосмыслить «должен» как чужую установку' }, { mode: 'В', text: 'Решить о разговоре с женой' }], recommended_mode: 'Б' }, limits: [] }) },
  Qualitas: { tools: [], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Нужно качество — право не соответствовать чужому «должен».',
      claims: [{ id: 'c1', text: 'Новое качество: право на несоответствие унаследованному «должен».', evidence: [C('Libertas.c1'), C('Insight.c1')] }],
      fields: { new_quality: 'Право не соответствовать унаследованному «должен»', rationale: 'Озарение об отце снимает необходимость «тянуть» любой ценой' }, limits: [] }) },
  Grounding: { tools: ['groundingClassifier'], expect: { badges: { c1: '🟢' }, card: '🟢' },
    payload: (t) => { const o = t.get('groundingClassifier'); const gap = o.gap === '' ? 'нет' : o.gap; const mode = o.liberty_mode === '' ? 'нет' : o.liberty_mode; return { summary: `ЦЗИ-8 прочитан по высказываниям участника; разрыв: ${gap}.`,
      claims: [{ id: 'c1', text: `Профиль контуров получен инструментом; разрыв контура — ${gap}, модус — ${mode}.`, evidence: [M('groundingClassifier', 'classified')] }],
      fields: { entry_level: 'K2', gap, liberty_mode: mode }, limits: ['имена контуров K2–K7 и модусы — реконструкция 🔵'] }; } },
  CascadeABC: { tools: ['cascadeEngine'], expect: { badges: { c1: '🟢', c2: '🟢' }, card: '🟢' },
    payload: () => ({ summary: 'Φ-порог ограничивает поведенческий выход сильнее остальных факторов.',
      claims: [
        { id: 'c1', text: 'Каскад даёт B = 0,34 при Φ = 0,65.', evidence: [M('cascadeEngine', 'B')] },
        { id: 'c2', text: 'Φ-порог — самый низкий из факторов, он сильнее всего сдерживает B.', evidence: [M('cascadeEngine', 'contributions.phi')] }],
      fields: { reading: 'Резерв роста B — в повышении осознанности (Φ).' }, limits: [] }) },
  Drives: { tools: ['lexisTool'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Доминирует драйв Phobon: страх раскрытия при «держании» образа.',
      claims: [{ id: 'c1', text: 'Phobon: страх раскрытия слабости стоит за «делаю вид».', evidence: [Q('делаю вид, что держу', '[10:03]')] }],
      fields: { dominant: 'Phobon', notes: 'Числовых оценок драйвов нет: инструмент драйвов ⛔' }, limits: ['числа драйвов ⛔: инструмента нет'] }) },
  Chronotope: { tools: ['lexisTool'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Ориентация на настоящее с признаками «замороженного времени».',
      claims: [{ id: 'c1', text: 'Время «застыло» в режиме «держу»: состояние длится уже несколько месяцев.', evidence: [Q('месяца три назад', '[10:03]')] }],
      fields: { orientation: 'настоящее', frozen_time: true }, limits: ['Zimbardo-прокси 🔵: лексические маркеры'] }) },
  Berne: { tools: ['lexisTool'], expect: { badges: { c1: '🟡' }, card: '🟡' },
    payload: () => ({ summary: 'Гипотеза сценария: «тяну ради других».',
      claims: [{ id: 'c1', text: 'Сценарная гипотеза: поддерживается образ благополучия для жены.', evidence: [Q('Она думает, что я справляюсь', '[10:05]')] }],
      fields: { script_hypothesis: 'Тяну ради других', games: ['Держу фасад'] }, limits: [] }) },
  Archetype: { tools: [], expect: { badges: { c1: '🔵' }, card: '🔵' },
    payload: () => ({ summary: 'Метафорически близок архетип Опекуна.',
      claims: [{ id: 'c1', text: 'Архетип Опекуна — метафорический слой без прямого якоря.', evidence: [] }],
      fields: { archetypes: ['Опекун'] }, limits: ['метафорический слой 🔵'] }) },
  Memory: { tools: ['memorySearchTool'], expect: { badges: { c1: '🟢' }, card: '🟢' },
    payload: (t) => { const hit = t.get('memorySearchTool').hits[0]; return { summary: `Ближайший кейс индекса — ${hit.id} (${hit.archetype}).`,
      claims: [{ id: 'c1', text: `Найден ближайший кейс ${hit.id}; исход приведён из индекса.`, evidence: [M('memorySearchTool', 'hits[0].score')] }],
      fields: { similar: [{ id: hit.id, relevance: `исход в индексе: ${hit.outcome}` }] }, limits: ['индекс LOCAL: синтетические демо-кейсы'] }; } },
  Reflector: { tools: [], expect: {},
    payload: () => ({ verdicts: [
        { id: 'v1', text: 'Запрос об усталости маскирует конфликт с установкой «должен тянуть».', claim_refs: ['Requestor.c1', 'Obstacle.c1', 'Insight.c1'] },
        { id: 'v2', text: 'Смещённая речь указывает на тему, от которой участник уходит.', claim_refs: ['Veritas.c1'] }],
      axes: [
        { axis: 'сознание', text: 'Озарение об отце — точка роста.', claim_refs: ['Insight.c1'] },
        { axis: 'социальное поле', text: 'Сценарий «тяну ради других» поддерживает образ благополучия.', claim_refs: ['Berne.c1'] },
        { axis: 'нарратив', text: 'Метафорический слой: Опекун.', claim_refs: ['Archetype.c1'] }],
      contradictions: [], limits: ['тело ⛔: нет данных канала'] }) },
  TheraNavigator: { tools: [], expect: {},
    payload: () => ({ plan: [
        { step: 'Вернуться к вопросу о реакции жены, от которого участник ушёл', why: 'смещённая речь на [10:07]', claim_refs: ['Veritas.c1'], module: 'analysis' },
        { step: 'Исследовать «должен» как слово отца', why: 'озарение на [10:12]', claim_refs: ['Insight.c1', 'Libertas.c1'], module: 'profile' }],
      next_question: 'Что изменилось бы, если бы «тянуть» перестало быть обязанностью?', limits: [] }) }
});

export const DOMAIN_ORDER = ['Requestor', 'Veritas', 'Obstacle', 'Insight', 'Libertas', 'Qualitas', 'Grounding', 'CascadeABC', 'Drives', 'Chronotope', 'Berne', 'Archetype', 'Memory'];

const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });

// Клиент-двойник, ведущий себя как «хорошая» модель по золотым сценариям. overrides[agentId](req, turn, ctx) → шаг | undefined
// позволяет подмешать нештатное поведение (выдуманная цитата, пропуск инструмента, ошибка транспорта).
export class GoldenClient {
  constructor(options) {
    const o = options === undefined ? {} : options;
    if (o.toolbox === undefined) throw new Error('GoldenClient: нужен toolbox');
    this.toolbox = o.toolbox;
    this.base = o.base === undefined ? BASE : o.base;
    this.overrides = o.overrides === undefined ? {} : o.overrides;
    this.calls = [];
    Object.freeze(this);
  }

  agentOf(req) {
    const all = [...String(req.system).matchAll(/\(([A-Za-z0-9]+)\)\./g)];
    return all.length ? all[all.length - 1][1] : '';
  }

  async complete(req) {
    const id = this.agentOf(req);
    const turn = req.messages.filter((m) => m.role === 'assistant').length;
    this.calls.push({ id, turn, model: req.model });
    const g = GOLDEN[id];
    if (g === undefined) throw new Error(`нет золотого сценария для «${id}»`);
    const ov = this.overrides[id];
    if (typeof ov === 'function') { const step = ov(req, turn, g, this); if (step !== undefined) return step; }
    const usage = { input_tokens: 100, output_tokens: 50 };
    if (turn === 0 && g.tools.length) return { content: g.tools.map((n, i) => toolUse(`t${i + 1}`, n, {})), stop_reason: 'tool_use', usage, model: req.model };
    const outputs = new Map(g.tools.map((n) => [n, this.toolbox.run(n, {}, this.base)]));
    return { content: [toolUse('s1', 'submit_result', g.payload(outputs))], stop_reason: 'tool_use', usage, model: req.model };
  }
}

export { toolUse };
