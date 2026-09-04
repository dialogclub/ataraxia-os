// Генератор реестров из компактных таблиц раздела 3 мастер-промпта. Запуск: node scripts/gen-registries.mjs
// Источник истины — этот файл; JSON в registry/ — производные и коммитятся рядом.
import { writeFileSync, readdirSync } from 'node:fs';

const out = (name, data) => writeFileSync(new URL(`../registry/${name}`, import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
const harnessed = new Set(readdirSync(new URL('../harness/', import.meta.url)).filter((f) => f.endsWith('.harness.json')).map((f) => f.replace('.harness.json', '')));

// ---------- Агенты (3.3): id · домен · подпись · читает · пишет · инструменты · политика модели ----------
const A = (id, domain, label_ru, reads, writes, tools, model_policy, cost_tier) => ({
  id, domain, label_ru, reads, writes, tools_required: tools,
  prompt_ref: `prompts/${id.toLowerCase()}.ru.md`, output_schema: `schemas/agents/${id.toLowerCase()}.out.json`,
  badge_policy: { with_quote: '🟡', with_measure: '🟢', none: '🔵' },
  cost_tier: cost_tier === undefined ? 'L2' : cost_tier, model_policy: model_policy === undefined ? 'default' : model_policy,
  editable_in_ui: domain !== 'system', harness: `harness/${id}.harness.json`,
  status: harnessed.has(id) ? 'green' : 'hidden_by_harness'
});
const agents = [
  A('Router', 'system', 'Интент → контур и состав агентов', ['scp.inputs', 'scp.meta.mode'], ['scp.meta.mode'], [], 'cheap'),
  A('Reflector', 'system', 'Сводит противоречия, требует якоря', ['scp.*'], ['scp.synthesis.verdicts'], [], 'strong', 'L3'),
  A('TheraNavigator', 'system', 'План, следующий шаг, «что дальше»', ['scp.synthesis', 'scp.request'], ['scp.synthesis.plan'], [], 'default', 'L3'),
  A('Judge', 'system', 'Оценка выходов агентов по рубрике (не виден клиенту)', ['scp.evidence', 'scp.audit'], [], [], 'cheap', 'L3'),
  A('Budget', 'system', 'Модель, стоимость, параллелизм', ['scp.meta'], ['scp.meta.model', 'scp.meta.fallback'], [], 'cheap'),
  A('Memory', 'system', 'Похожие кейсы и реальные исходы', ['scp.request', 'scp.frames'], ['scp.memory.similar'], ['memorySearchTool'], 'cheap'),
  A('Safety', 'system', 'Кризис, противопоказания, гейты', ['scp.clinic', 'scp.practice'], ['scp.clinic.crisis', 'scp.synthesis.risks'], ['stimulusGate', 'riskEngine?'], 'strong'),
  A('Requestor', 'core', 'Явный и скрытый запрос', ['scp.inputs.transcript', 'scp.lexis'], ['scp.request.explicit', 'scp.request.latent'], ['lexisTool']),
  A('Veritas', 'core', 'Достоверность речи и смещённая речь', ['scp.lexis', 'scp.signals.prosody', 'scp.inputs.transcript'], ['scp.request.veracity', 'scp.request.displacements'], ['lexisTool', 'prosodyTool?']),
  A('Obstacle', 'core', 'Внутреннее и внешнее препятствие', ['scp.request', 'scp.inputs.transcript'], ['scp.obstacle'], ['lexisTool']),
  A('Insight', 'core', 'Интуитивное решение и озарение', ['scp.request', 'scp.obstacle'], ['scp.intuition', 'scp.insight'], ['lexisTool']),
  A('Libertas', 'core', 'Свобода воли: модусы А/Б/В/Г', ['scp.czi8', 'scp.obstacle'], ['scp.liberty'], ['groundingClassifier']),
  A('Qualitas', 'core', 'Новое качество личности для решения', ['scp.liberty', 'scp.insight'], ['scp.quality'], []),
  A('Grounding', 'core', 'ЦЗИ-8: контуры K1–K8, разрыв', ['scp.inputs.transcript'], ['scp.czi8'], ['groundingClassifier']),
  A('CascadeABC', 'core', 'Каскад АВС: A, D, C, Φ → B', ['scp.frames', 'scp.drives'], ['scp.cascade'], ['cascadeEngine'], 'default', 'L3'),
  A('Drives', 'core', 'Драйвы Theromata/Alligantia/Phobon/Dominix/Agonix', ['scp.inputs.transcript', 'scp.lexis'], ['scp.drives'], ['lexisTool']),
  A('Persona6', 'core', 'Шестиосевая интерпретация V10', ['scp.frames', 'scp.lexis'], ['scp.frames.persona6'], ['phonoSemTool?']),
  A('ICD11Contour', 'core', 'МКБ-11 контур на цикле переработки (гипотеза, не диагноз)', ['scp.clinic', 'scp.frames'], ['scp.frames.icd11'], ['scaleScorer?']),
  A('Cognitome', 'core', 'Когнитом: 28 КОГ × 7 уровней', ['scp.frames'], ['scp.frames.cognitome'], []),
  A('Lowen', 'body', 'Характерные структуры Лоуэна (5)', ['scp.inputs', 'scp.signals'], ['scp.body.lowen'], ['prosodyTool?']),
  A('Reich', 'body', 'Сегменты панциря Райха (7)', ['scp.inputs', 'scp.body'], ['scp.body.reich'], []),
  A('Somatics', 'body', 'Тело как детектор смещённой речи', ['scp.request.displacements', 'scp.signals'], ['scp.body.somatics'], ['prosodyTool?']),
  A('PulseMeridian', 'body', '12 осцилляторов (Grade D-метка)', ['scp.signals.ppg'], ['scp.body.meridians'], ['ppgTool']),
  A('Risk', 'body', 'Риски 14 геропатологий', ['scp.body', 'scp.subject'], ['scp.body.risk'], ['riskEngine']),
  A('Wearables', 'body', 'Биопаспорт: носимые устройства', ['scp.signals.wearables'], ['scp.body.biopassport'], ['scaleScorer?']),
  A('Fusion', 'body', 'vMed: фьюжн каналов', ['scp.signals', 'scp.clinic'], ['scp.clinic.scales'], ['fusionEngine']),
  A('Graphology', 'body', 'Графология 2 канала, Δ-флаг', ['scp.inputs.handwriting'], ['scp.clinic.delta_flags'], []),
  A('Drawing', 'body', 'Проективный рисунок (дерево Коха)', ['scp.inputs.drawing'], ['scp.frames.koch'], []),
  A('Breath', 'practice', 'Подбор дыхательного паттерна из 72', ['scp.body', 'scp.practice'], ['scp.practice.breath'], ['stimulusGate']),
  A('Stimulus', 'practice', 'Звук, свет, EMDR — под гейтом', ['scp.practice'], ['scp.practice.stimulus'], ['stimulusGate']),
  A('Mindfulness', 'practice', 'Практики осознанности (Берзин)', ['scp.frames'], ['scp.practice.mindfulness'], []),
  A('Abhidharma52', 'practice', '52 фактора Абхидхармы', ['scp.frames'], ['scp.frames.abhidharma'], []),
  A('Semiosphere', 'practice', 'Семиосферы', ['scp.lexis'], ['scp.frames.semiosphere'], ['phonoSemTool?']),
  A('Cycle8', 'practice', 'Цикл-8', ['scp.czi8'], ['scp.frames.cycle8'], ['groundingClassifier']),
  A('Berne', 'love', 'Сценарии, игры, матрица игнорирования', ['scp.inputs.transcript'], ['scp.frames.berne'], ['lexisTool']),
  A('Gottman', 'love', 'Четыре всадника и ремонт', ['scp.inputs.transcript'], ['scp.frames.gottman'], ['lexisTool']),
  A('Vaillant', 'love', 'Иерархия защит', ['scp.inputs.transcript'], ['scp.frames.vaillant'], ['lexisTool']),
  A('Panksepp', 'love', 'Семь аффективных систем', ['scp.signals', 'scp.lexis'], ['scp.frames.panksepp'], ['prosodyTool?']),
  A('Attachment', 'love', 'Привязанность', ['scp.inputs.transcript'], ['scp.frames.attachment'], ['lexisTool']),
  A('EriksonMarcia', 'love', 'Стадии Эриксона и статус идентичности Марсиа', ['scp.subject', 'scp.frames'], ['scp.frames.erikson'], []),
  A('Intraktom', 'social', 'Роли, коалиции, tension-партитура', ['scp.inputs.transcript'], ['scp.narrative.intraktom'], ['lexisTool', 'gccEngine?']),
  A('Cashflow', 'social', 'Финансовый паттерн, хронометраж', ['scp.inputs.transcript'], ['scp.frames.cashflow'], ['chronometry']),
  A('Gallup34', 'social', 'Таланты Gallup-34', ['scp.inputs.scales'], ['scp.frames.gallup34'], ['scaleScorer']),
  A('Belbin', 'social', 'Командные роли Белбина', ['scp.inputs.scales'], ['scp.frames.belbin'], ['scaleScorer']),
  A('Fincast', 'social', 'Касты Кроля × Маслоу × десятина', ['scp.frames.cashflow'], ['scp.frames.fincast'], []),
  A('Chronotope', 'social', 'Zimbardo + вертикаль времени Анохина', ['scp.lexis.zimbardo'], ['scp.frames.chronotope'], ['lexisTool']),
  A('Archetype', 'narrative', 'Юнг / Болен / Вулф / Эстес', ['scp.inputs.transcript', 'scp.memory'], ['scp.narrative.archetypes'], ['memorySearchTool?']),
  A('HeroPath', 'narrative', 'Путь героя: 17 стадий', ['scp.narrative'], ['scp.narrative.hero_path'], []),
  A('Optika', 'narrative', 'Кино-аппарат ОПТИКА', ['scp.narrative'], ['scp.narrative.optika'], []),
  A('Motif', 'narrative', 'Мотивы Березкина', ['scp.narrative'], ['scp.narrative.motifs'], []),
  A('Mythodesign', 'narrative', 'Мифодизайн', ['scp.narrative'], ['scp.narrative.mythodesign'], [])
];
out('agents.registry.json', { version: '1.0', note: 'Реестр агентов (3.3). status = hidden_by_harness, пока нет зелёного харнесса типа llm-agent (Спринт 2).', agents });

// ---------- Инструменты (3.4) ----------
const T = (id, label_ru, layer, io, vectors, module) => ({
  id, label_ru, layer, type: id === 'stimulusGate' ? 'stimulus' : id === 'prosodyTool' || id === 'ppgTool' ? 'dsp' : 'deterministic',
  io, test_vectors: vectors, module: module === undefined ? '' : module,
  harness: harnessed.has(id) ? `harness/${id}.harness.json` : '', status: harnessed.has(id) ? 'green' : 'hidden_by_harness'
});
const tools = [
  T('prosodyTool', 'ХРОНОС — просодика', 'L1', 'PCM → F0, вариативность, RMS, паузы, темп, F1–F4, центроид, наклон, HNR, джиттер, шиммер; спектрограмма 0–5 кГц', ['тон 150 Гц → F0 150 ± 1', 'тишина → паузы 100 %', 'белый шум → HNR < 5 дБ', 'джиттер 2 % → 0,02 ± 0,003', '1000 буферов — 0 NaN']),
  T('lexisTool', 'ЛЕКСИС — лексика', 'L1', 'транскрипт → местоимения, модальность, Zimbardo-прокси, спикер-баланс, инициативность, тепловая карта 24 ч', ['golden-транскрипт с долями', 'пустой ввод → нули с ⛔', 'смешанные RU/UA']),
  T('phonoSemTool', 'VAAL — фоносемантика', 'L1', 'текст → 25 шкал (z-score), полярность, значимые, Шалак 8, Плутчик 8, Белянин, TTR/hapax', ['детерминизм', 'RU/UA/EN', 'мягкий vs грубый различаются', '1000 текстов — 0 NaN, [−100, 100]']),
  T('cascadeEngine', 'Каскад АВС', 'L3', 'A, D, C, Φ, форма → B, вклад, версия', ['Φ = 0 → B = 0', 'монотонность', '[0, 1]', 'golden Константин 27.08.2026 → B = 0,34'], 'core/engines/cascadeEngine.mjs'),
  T('groundingClassifier', 'ЦЗИ-8 классификатор', 'L1', 'высказывания → K1–K8, разрыв, модус А/Б/В/Г', ['golden ≥ 8 × 10', 'монотонность', 'устойчивость к перестановке']),
  T('scaleScorer', 'Шкалы и нормы', 'L1', 'ответы → PHQ-9, GAD-7, SCL-90, MBI, TAS-20, Мадди, Gallup-34, IST, Big Five, 16PF, Леонгард, Рокич, Белбин', ['эталонные ключи', 'граничные баллы', 'неполный опросник → ⛔']),
  T('ppgTool', 'PPG камерой', 'L1', 'кадры (R-канал) → HR, RMSSD, SDNN, ЧД, спектр F1–F12', ['синтетический пульс 72 → 72 ± 1', 'шум → «низкое качество», не число']),
  T('riskEngine', 'Риск-движок v2', 'L1', 'маркеры, SNP, антропометрия, возраст, пол → риск 14 патологий', ['форма base × LR', 'ДГПЖ у женщин → 0', 'возраст монотонен', 'чипы вклада']),
  T('fusionEngine', 'Sealed Core фьюжн', 'L1', '4 канала → шкалы с уверенностью, Δ-флаги', ['voice → PHQ-9', 'Brier/AUC на синтетике', 'отсутствие канала не роняет фьюжн']),
  T('stimulusGate', 'Гейт стимуляции', 'L1', 'мигание/звук/час → разрешено/заблокировано', ['15–25 Гц → блок', 'стоп < 100 мс', 'предел SPL 85 дБ'], 'core/engines/stimulusGate.mjs'),
  T('memorySearchTool', 'Память кейсов LOCAL/MCP', 'L1', 'запрос/профиль → top-k, исходы', ['«выгорание, нет смысла» → C002', 'пустой индекс → 0', 'MCP-контракт совместим', '2000 запросов — 0 NaN'], 'core/engines/memorySearchTool.mjs'),
  T('chronometry', 'Хронометраж Башкина', 'L1', 'игровые минуты → биографические дни/годы', ['240 мин → ≈ 40 лет'], 'core/engines/chronometry.mjs'),
  T('gccEngine', 'SMFK-100 Gcc', 'L3', 'участники Cr/Sr/Of → Gcc, geo-mean, σ²', ['фикстура core-team → 0,842491', 'один участник → ⛔', 'дубликаты → Cr·Sr'], 'core/engines/gccEngine.mjs')
];
out('tools.registry.json', { version: '1.0', note: 'Реестр инструментов L1/L3 (3.4). Без зелёного харнесса инструмент скрыт (hidden_by_harness).', tools });

// ---------- Параметры (3.5): id · подпись · рамка · слой · источник · тип · диапазон · единица · кодировка ----------
const P = (id, label_ru, framework, layer, source, type, range, unit, ui, badge) => ({
  id, label_ru, framework, layer, [layer === 'L2' ? 'agent' : 'tool']: source, type, range, unit,
  badge_policy: badge === undefined ? (layer === 'L2' ? '🟡' : '🟢') : badge, evidence_required: layer === 'L2', ui_encoding: ui, export_key: id
});
const parameters = [
  P('cascade.A', 'A — актуальность', 'Каскад АВС', 'L3', 'cascadeEngine', 'index', [0, 1], 'index', 'waterfall'),
  P('cascade.D', 'D — дефицит', 'Каскад АВС', 'L3', 'cascadeEngine', 'index', [0, 1], 'index', 'waterfall'),
  P('cascade.C', 'C — контекст', 'Каскад АВС', 'L3', 'cascadeEngine', 'index', [0, 1], 'index', 'waterfall'),
  P('cascade.phi', 'Φ-порог осознанности', 'Каскад АВС', 'L3', 'cascadeEngine', 'index', [0, 1], 'index', 'gauge'),
  P('cascade.B', 'B — поведение', 'Каскад АВС', 'L3', 'cascadeEngine', 'index', [0, 1], 'index', 'waterfall'),
  ...['Theromata', 'Alligantia', 'Phobon', 'Dominix', 'Agonix'].map((d) => P(`drives.${d}`, `Драйв ${d}`, 'Persona v12', 'L2', 'Drives', 'index', [0, 1], 'index', 'radar')),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => P(`czi8.K${k}`, `ЦЗИ-8 контур K${k}`, 'ЦЗИ-8', 'L1', 'groundingClassifier', 'level', [0, 1], 'share', 'ring')),
  P('czi8.gap', 'Разрыв контура', 'ЦЗИ-8', 'L1', 'groundingClassifier', 'enum', [1, 8], 'K', 'ring'),
  P('request.veracity', 'Степень достоверности речи', 'Аналитическая рамка', 'L2', 'Veritas', 'index', [0, 1], 'index', 'traffic'),
  P('request.displacements.count', 'Смещённая речь — число эпизодов', 'Аналитическая рамка', 'L2', 'Veritas', 'count', [0, 99], 'n', 'chip'),
  P('prosody.f0', 'F0 средняя', 'ХРОНОС', 'L1', 'prosodyTool', 'freq', [60, 500], 'Hz', 'spectrogram'),
  P('prosody.f0_sd', 'Вариативность F0', 'ХРОНОС', 'L1', 'prosodyTool', 'freq', [0, 150], 'Hz', 'chip'),
  P('prosody.rms', 'RMS-огибающая', 'ХРОНОС', 'L1', 'prosodyTool', 'level', [0, 1], 'rel', 'envelope'),
  P('prosody.pause_share', 'Доля пауз', 'ХРОНОС', 'L1', 'prosodyTool', 'percent', [0, 100], '%', 'chip'),
  P('prosody.onset_rate', 'Темп онсетов', 'ХРОНОС', 'L1', 'prosodyTool', 'rate', [0, 12], '1/s', 'chip'),
  P('prosody.hnr', 'HNR', 'ХРОНОС', 'L1', 'prosodyTool', 'level', [-10, 40], 'dB', 'chip'),
  P('prosody.jitter', 'Джиттер', 'ХРОНОС', 'L1', 'prosodyTool', 'ratio', [0, 0.1], 'ratio', 'chip'),
  P('prosody.shimmer', 'Шиммер', 'ХРОНОС', 'L1', 'prosodyTool', 'ratio', [0, 0.3], 'ratio', 'chip'),
  ...['F1', 'F2', 'F3', 'F4'].map((f, i) => P(`prosody.${f.toLowerCase()}`, `Форманта ${f}`, 'ХРОНОС', 'L1', 'prosodyTool', 'freq', [[200, 900], [900, 2500], [2500, 3500], [3500, 5000]][i], 'Hz', 'chip')),
  P('lexis.pronoun_i', 'Доля «я»', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.pronoun_we', 'Доля «мы»', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.pronoun_you', 'Доля «ты/вы»', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.pronoun_they', 'Доля «они»', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.modality_must', 'Долженствование', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.modality_can', 'Возможность', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  P('lexis.speaker_balance', 'Спикер-баланс фокуса', 'ЛЕКСИС', 'L1', 'lexisTool', 'percent', [0, 100], '%', 'chip'),
  ...['past_negative', 'past_positive', 'present_hedonistic', 'present_fatalistic', 'future'].map((z) => P(`lexis.zimbardo.${z}`, `Zimbardo-прокси: ${z}`, 'Хронотоп', 'L1', 'lexisTool', 'index', [0, 1], 'share', 'radar')),
  P('vaal.polarity', 'VAAL полярность', 'VAAL+', 'L1', 'phonoSemTool', 'index', [-100, 100], 'z', 'traffic', '🔵'),
  ...['radiant', 'mighty', 'kind', 'soft', 'joyful', 'brave', 'calm', 'bright'].map((s) => P(`vaal.scale.${s}`, `VAAL шкала ${s}`, 'VAAL+', 'L1', 'phonoSemTool', 'index', [-100, 100], 'z', 'radar', '🔵')),
  ...['joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation'].map((e) => P(`plutchik.${e}`, `Плутчик: ${e}`, 'Плутчик', 'L1', 'phonoSemTool', 'index', [0, 1], 'share', 'radar', '🔵')),
  P('memory.top1_score', 'Похожий кейс — score', 'Архив 11 000', 'L1', 'memorySearchTool', 'index', [-1, 1], 'cos', 'chip'),
  P('chrono.days', 'Биографическое время', 'Хронометраж Башкина', 'L1', 'chronometry', 'duration', [0, 36525], 'days', 'timeline'),
  P('chrono.years', 'Биографический возраст', 'Хронометраж Башкина', 'L1', 'chronometry', 'duration', [0, 100], 'years', 'timeline'),
  P('smfk.Gcc', 'Gcc групповой', 'SMFK-100', 'L3', 'gccEngine', 'index', [0, 1], 'index', 'gauge'),
  P('smfk.geo_CrSr', 'Geo-mean Cr·Sr', 'SMFK-100', 'L3', 'gccEngine', 'index', [0, 1], 'index', 'chip'),
  P('smfk.sigma2_Of', 'Дисперсия Of', 'SMFK-100', 'L3', 'gccEngine', 'index', [0, 0.25], 'index', 'chip'),
  P('gate.flicker_hz', 'Частота мигания', 'PNEUMA', 'L1', 'stimulusGate', 'freq', [0, 60], 'Hz', 'gate'),
  P('gate.spl_db', 'Громкость', 'PNEUMA', 'L1', 'stimulusGate', 'level', [0, 120], 'dB', 'gate'),
  P('gate.stop_ms', 'Латентность стопа', 'PNEUMA', 'L1', 'stimulusGate', 'duration', [0, 100], 'ms', 'chip'),
  P('clinic.phq9', 'PHQ-9', 'Клиника', 'L1', 'scaleScorer', 'score', [0, 27], 'балл', 'traffic'),
  P('clinic.gad7', 'GAD-7', 'Клиника', 'L1', 'scaleScorer', 'score', [0, 21], 'балл', 'traffic'),
  P('clinic.pcl5', 'PCL-5', 'Клиника', 'L1', 'scaleScorer', 'score', [0, 80], 'балл', 'traffic'),
  P('clinic.tas20', 'TAS-20', 'Клиника', 'L1', 'scaleScorer', 'score', [20, 100], 'балл', 'traffic'),
  P('clinic.mbi_exhaustion', 'MBI истощение', 'Маслач', 'L1', 'scaleScorer', 'score', [0, 54], 'балл', 'traffic'),
  P('body.health_score', 'Health Score', 'Pulse OS', 'L1', 'ppgTool', 'score', [0, 100], 'балл', 'gauge'),
  P('body.hr', 'ЧСС', 'PPG', 'L1', 'ppgTool', 'rate', [30, 220], 'bpm', 'chip'),
  P('body.rmssd', 'RMSSD', 'PPG', 'L1', 'ppgTool', 'duration', [0, 200], 'ms', 'chip'),
  P('body.sdnn', 'SDNN', 'PPG', 'L1', 'ppgTool', 'duration', [0, 200], 'ms', 'chip'),
  P('body.breath_rate', 'ЧД', 'PPG', 'L1', 'ppgTool', 'rate', [4, 40], '1/min', 'chip'),
  ...['CR', 'RC', 'FN', 'VB', 'SM', 'PS'].map((ax) => P(`body.3a.${ax}`, `3A-FORMULA ось ${ax}`, '3A-FORMULA', 'L2', 'Risk', 'index', [0, 1], 'index', 'radar')),
  ...['schizoid', 'oral', 'psychopathic', 'masochistic', 'rigid'].map((s) => P(`lowen.${s}`, `Лоуэн: ${s}`, 'Лоуэн', 'L2', 'Lowen', 'index', [0, 1], 'share', 'radar')),
  ...[1, 2, 3, 4, 5, 6, 7].map((s) => P(`reich.segment${s}`, `Райх: сегмент ${s}`, 'Райх', 'L2', 'Reich', 'index', [0, 1], 'index', 'bodymap')),
  ...['SEEKING', 'RAGE', 'FEAR', 'LUST', 'CARE', 'PANIC', 'PLAY'].map((s) => P(`panksepp.${s}`, `Панксепп: ${s}`, 'Панксепп', 'L2', 'Panksepp', 'index', [0, 1], 'share', 'radar')),
  ...['O', 'C', 'E', 'A', 'N'].map((b) => P(`ocean.${b}`, `Big Five ${b}`, 'OCEAN', 'L1', 'scaleScorer', 'score', [0, 100], 'балл', 'traffic')),
  P('narrative.hero_stage', 'Стадия пути героя', 'Кэмпбелл/Мёрдок', 'L2', 'HeroPath', 'enum', [1, 17], 'stage', 'timeline'),
  P('narrative.tension', 'Партитура напряжения', 'Intraktom', 'L2', 'Intraktom', 'index', [0, 1], 'index', 'timeline')
];
out('parameters.registry.json', { version: '1.0', note: `Реестр параметров (3.5). Спринт 0: ${parameters.length} записей; целевой объём 300+. Интерфейс строится из реестра.`, parameters });

// ---------- Модели (3.8): реестр, не константы. ID сверены с docs.claude.com 04.09.2026 ----------
out('models.registry.json', {
  version: '1.0',
  note: 'Реестр моделей (3.8). Значения сверены с docs.claude.com перед фиксацией. В среде артефактов ключ подставляет шлюз.',
  default: 'claude-opus-5',
  models: [
    { id: 'claude-opus-5', label: 'Opus 5', tier: 'strong', use: ['L2', 'L3'], fallback: 'claude-sonnet-5' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5', tier: 'default', use: ['L2', 'L3', 'Judge'], fallback: 'claude-sonnet-4-6' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'default', use: ['L2'], fallback: 'claude-haiku-4-5' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5', tier: 'cheap', use: ['Judge', 'Router'], fallback: '' }
  ],
  policy: { timeout_ms: 90000, retry_on: [429, 500, 502, 503, 529], backoff: 'exponential', fallback_flag: 'откат_с_Opus', l1_never_waits_model: true }
});

// ---------- Рамки интерпретации (Приложение F) ----------
const F = (id, author, axes, tool, agent, ui, grade, source) => ({ id, author, axes, tool, agent, ui_encoding: ui, default_grade: grade, source });
out('frames.registry.json', { version: '1.0', note: 'Реестр рамок интерпретации (Приложение F). Грейд по умолчанию — доказательность рамки как инструмента, не диагноза.', frames: [
  F('lowen', 'А. Лоуэн', ['шизоидная', 'оральная', 'психопатическая', 'мазохистская', 'ригидная'], '', 'Lowen', 'radar', 'C', 'Bioenergetics (1975)'),
  F('reich', 'В. Райх', ['глаза', 'рот', 'шея', 'грудь', 'диафрагма', 'живот', 'таз'], '', 'Reich', 'bodymap', 'D', 'Character Analysis (1933)'),
  F('berne', 'Э. Берн', ['сценарии', 'игры', 'матрица игнорирования'], 'lexisTool', 'Berne', 'chip', 'C', 'Games People Play (1964)'),
  F('karpman', 'С. Карпман', ['преследователь', 'спасатель', 'жертва'], 'lexisTool', 'Berne', 'chip', 'C', 'Fairy Tales and Script Drama Analysis (1968)'),
  F('gottman', 'Дж. Готтман', ['критика', 'презрение', 'защита', 'стена', 'ремонт'], 'lexisTool', 'Gottman', 'traffic', 'B', 'The Seven Principles (1999)'),
  F('vaillant', 'Дж. Вейлант', ['психотические', 'незрелые', 'невротические', 'зрелые защиты'], '', 'Vaillant', 'chip', 'B', 'Adaptation to Life (1977)'),
  F('grof', 'С. Гроф', ['БПМ I', 'БПМ II', 'БПМ III', 'БПМ IV'], '', 'Archetype', 'timeline', 'D', 'Realms of the Human Unconscious (1975)'),
  F('panksepp', 'Я. Панксепп', ['SEEKING', 'RAGE', 'FEAR', 'LUST', 'CARE', 'PANIC', 'PLAY'], 'prosodyTool', 'Panksepp', 'radar', 'B', 'Affective Neuroscience (1998)'),
  F('frankl', 'В. Франкл', ['смысл', 'экзистенциальный вакуум', 'самотрансценденция'], '', 'Insight', 'chip', 'C', 'Man\'s Search for Meaning (1946)'),
  F('graves', 'К. Грейвз / СД', ['бежевый', 'фиолетовый', 'красный', 'синий', 'оранжевый', 'зелёный', 'жёлтый', 'бирюзовый'], '', 'Persona6', 'traffic', 'D', 'Spiral Dynamics (1996)'),
  F('jung', 'К. Юнг / Болен / Вулф / Эстес', ['архетипы', 'анима/анимус', 'тень', 'самость'], 'memorySearchTool', 'Archetype', 'chip', 'D', 'Archetypes and the Collective Unconscious (1934)'),
  F('campbell', 'Дж. Кэмпбелл / М. Мёрдок', ['17 стадий пути героя', 'путь героини'], '', 'HeroPath', 'timeline', 'D', 'The Hero with a Thousand Faces (1949)'),
  F('erikson', 'Э. Эриксон', ['8 стадий психосоциального развития'], '', 'EriksonMarcia', 'timeline', 'C', 'Childhood and Society (1950)'),
  F('marcia', 'Дж. Марсиа', ['диффузия', 'предрешённость', 'мораторий', 'достижение'], '', 'EriksonMarcia', 'chip', 'B', 'Development and validation of ego-identity status (1966)'),
  F('zimbardo', 'Ф. Зимбардо', ['прошлое−', 'прошлое+', 'настоящее гедонистическое', 'настоящее фаталистическое', 'будущее'], 'lexisTool', 'Chronotope', 'radar', 'B', 'ZTPI (1999)'),
  F('anokhin', 'П. Анохин', ['афферентный синтез', 'принятие решения', 'акцептор результата', 'обратная афферентация'], '', 'Chronotope', 'timeline', 'C', 'Биология и нейрофизиология условного рефлекса (1968)'),
  F('leonhard', 'К. Леонгард', ['10 акцентуаций'], 'scaleScorer', 'Persona6', 'traffic', 'B', 'Akzentuierte Persönlichkeiten (1968)'),
  F('cattell16pf', 'Р. Кеттелл', ['16 факторов'], 'scaleScorer', 'Persona6', 'traffic', 'A', '16PF (1949)'),
  F('ocean', 'Big Five', ['O', 'C', 'E', 'A', 'N'], 'scaleScorer', 'Persona6', 'traffic', 'A', 'Costa & McCrae (1992)'),
  F('mbti', 'MBTI', ['E/I', 'S/N', 'T/F', 'J/P'], 'scaleScorer', 'Persona6', 'chip', 'D', 'Myers-Briggs (1962)'),
  F('enneagram', 'Эннеаграмма', ['9 типов'], '', 'Persona6', 'chip', 'D', 'Riso & Hudson (1996)'),
  F('rokeach', 'М. Рокич', ['терминальные', 'инструментальные ценности'], 'scaleScorer', 'Persona6', 'chip', 'B', 'The Nature of Human Values (1973)'),
  F('mbi', 'К. Маслач', ['истощение', 'деперсонализация', 'редукция достижений'], 'scaleScorer', 'Risk', 'traffic', 'A', 'MBI (1981)'),
  F('scl90', 'SCL-90', ['9 шкал симптомов', 'GSI'], 'scaleScorer', 'ICD11Contour', 'traffic', 'A', 'Derogatis (1977)'),
  F('tas20', 'TAS-20', ['трудность идентификации', 'трудность описания', 'внешне-ориентированное мышление'], 'scaleScorer', 'Somatics', 'traffic', 'A', 'Bagby (1994)'),
  F('maddi', 'С. Мадди', ['вовлечённость', 'контроль', 'принятие риска'], 'scaleScorer', 'Qualitas', 'traffic', 'B', 'Hardiness (1984)'),
  F('belbin', 'М. Белбин', ['9 командных ролей'], 'scaleScorer', 'Belbin', 'chip', 'C', 'Management Teams (1981)'),
  F('gallup34', 'Gallup', ['34 таланта', '4 домена'], 'scaleScorer', 'Gallup34', 'board', 'B', 'CliftonStrengths (2007)'),
  F('amthauer', 'Р. Амтхауэр', ['9 субтестов IST'], 'scaleScorer', 'Persona6', 'traffic', 'A', 'IST (1953)'),
  F('gardner', 'Г. Гарднер', ['8 интеллектов'], '', 'Persona6', 'radar', 'D', 'Frames of Mind (1983)'),
  F('abhidharma', 'Абхидхарма', ['52 фактора'], '', 'Abhidharma52', 'chip', 'D', 'Abhidhammattha Sangaha'),
  F('icd11', 'МКБ-11', ['главы 6, 7, 17', 'контур на цикле переработки'], 'scaleScorer', 'ICD11Contour', 'chip', 'A', 'WHO ICD-11 (2022)'),
  F('krol', 'Л. Кроль', ['касты'], '', 'Fincast', 'chip', 'D', 'Кастовая теория'),
  F('maslow_fin', 'А. Маслоу (финансовые уровни)', ['выживание', 'безопасность', 'принадлежность', 'признание', 'самоактуализация'], '', 'Fincast', 'traffic', 'D', 'Motivation and Personality (1954), адаптация'),
  F('berezkin', 'Ю. Березкин', ['мотивы фольклора'], '', 'Motif', 'chip', 'D', 'Тематическая классификация мотивов')
] });
console.log(`agents ${agents.length} · tools ${tools.length} · parameters ${parameters.length}`);
