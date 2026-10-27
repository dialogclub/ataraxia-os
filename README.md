# ATARAXIA OS — вертикальный срез

«От инженерии человека внешнего — к инженерии человека внутреннего.»

Это исполненный мастер-промпт: мультиагентное ядро, уникальный harness на каждую функцию, командный центр.

## Что живое в этом срезе

- Агенты с `harness/*.yaml` + `harness/*.eval.json` (ключ `agent_id`)
- Контракты: PersonVector, SpectrogramCard, CompatibilityArtifact, SessionReport, JourneyState
- Python DSP: 12 полос (словарь Академии Пульса, границы наши: inferred). Без `consent.audio` карточка пустая. Модули `oscillators.py`, `indices.py`, `pulse.py` реализованы заново (см. `docs/ataraxia-os-oscillators-indices.md`); оригинальные исходники не найдены. СМФК-100 работает автономно.
- СМФК-100: `Gcc = ∏(Cr·Sr)^{1/n} · (1 − σ²(Of))`, fail-closed при n<3. Фикстура → **Gcc = 0.842491** (вычислено формулой, `tests/test_gcc.py`). Значение 0.928 из платформенного документа **не воспроизводится** ни по этой формуле, ни по этой фикстуре; в расчётах не используется (метка: reported, не подтверждено).
- Command Center: `apps/command-center/index.html`

## Красные линии

Не диагноз. Не назначение. Не лабораторные гормоны/гены. Нет данных без согласия.
При кризисе — 988 / Украина 7333, без методов.

## Запуск

```bash
python3 tests/test_gcc.py
python3 tests/test_oscillators.py
python3 services/dsp/analyze_synth.py
python3 services/dsp/analyze_synth.py --consent
python3 -m http.server 8765 --directory apps/command-center
```
