# ATARAXIA OS

«От инженерии человека внешнего — к инженерии человека внутреннего.»

Мультиагентная платформа для клинического психолога: детерминированное ядро (L1/L3), агентный слой (L2, Claude API), **харнесс на каждую функцию**, единый интерфейс (Телефон / Студия / Печать). Исследовательский интерфейс, не медицинское изделие. Мастер-промпт — `CLAUDE.md`.

## Красные линии

Не диагноз. Не назначение. Не лабораторные гормоны/гены. Нет данных без согласия. При кризисе — 988 / Украина 7333, без методов; кризисный путь Stanley-Brown всегда на экране.

## Запуск (JS-ядро, без зависимостей, Node ≥ 22)

```bash
npm run harness:all   # все харнессы: 10 инструментов + UI (скриншоты в docs/screenshots)
npm run harness -- prosodyTool
npm run check         # node --check · баланс скобок · запретные конструкции · сканер id
npm run build         # single-file артефакт dist/atmaraksi-os.html (офлайн, file://)
npm run serve         # http://127.0.0.1:8765/ui/index.html · /ui/gallery.html
```

Для UI-харнесса нужен глобальный `playwright` с Chromium.

## Python-срез (референс методологии)

```bash
python3 tests/test_gcc.py                 # СМФК-100: Gcc, fail-closed при n < 3, границы [0, 1]
python3 services/dsp/analyze_synth.py     # DSP-карточка: без consent.audio — пустая (нужен numpy)
```

СМФК-100: `Gcc = ∏(Cr·Sr)^{1/n} · (1 − σ²(Of))`, fail-closed при n < 3 — одинаково в `python/ataraxia_dsp/smfk.py` и `core/engines/gccEngine.mjs`. Фикстура `fixtures/smfk100.team.json` → **0,842491**; документ заявлял 0,928 — расхождение задокументировано, не усредняется. Модули `oscillators`/`indices`, на которые ссылается `analyze.py`, в репозитории пока отсутствуют (⛔).

## Структура

| Путь | Что |
|---|---|
| `core/` | `Param` (нет голых чисел), `EventBus`, `Scp` (иммутабельный профиль с аудитом) |
| `core/dsp.mjs` | БПФ, окно Ханна, автокорреляция, Левинсон–Дурбин, LPC-огибающая |
| `core/engines/` | `prosodyTool`, `lexisTool`, `phonoSemTool`, `groundingClassifier`, `scaleScorer`, `cascadeEngine`, `stimulusGate`, `chronometry`, `gccEngine`, `memorySearchTool` (LOCAL / ◇ MCP-SWAP) |
| `harness/` | `Harness` (детерминизм · edge-cases · стресс · golden · custom), раннер, паспорта `*.harness.json`, тесты `*.test.mjs`, `report.json` |
| `registry/` | агенты (51), инструменты (13, 10 зелёных), параметры (142), модели, рамки интерпретации (35); генератор — `scripts/gen-registries.mjs` |
| `schemas/` | SCP v1, Param, паспорт харнесса, карточка агента, контракты инструментов; PersonVector, SpectrogramCard, CompatibilityArtifact, SessionReport, JourneyState |
| `ui/` | токены 4.1, компоненты (`render/update/destroy`, ⛔-состояние, NaN-защита), галерея, оболочка `index.html` + `app.mjs`, словари RU/UA/EN |
| `scripts/` | `check`, `serve`, `screenshots` (аудит вьюпортов), `build-single` |
| `fixtures/` | golden «Константин 27.08.2026», синтетический демо-корпус памяти, SMFK-100, golden ЛЕКСИС, golden ЦЗИ-8 (8 × 10), генераторы синтетических сигналов |
| `python/`, `services/`, `tests/` | Python-референс: СМФК-100 и DSP-карточка с consent-гейтом |

## Инварианты, проверяемые харнессом

Нет харнесса — нет функции (`hidden_by_harness`). Инструменты считают, агенты интерпретируют. Каждое число — `{value, unit, range, badge, source, tool, version}`. Нет аудио — просодика ⛔. Гейт 15–25 Гц непроходим, стоп < 100 мс. Кризисный путь всегда на экране. Никакой имитации данных.
