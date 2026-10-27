# ATARAXIA OS — вертикальный срез

«От инженерии человека внешнего — к инженерии человека внутреннего.»

Это исполненный мастер-промпт: мультиагентное ядро, уникальный harness на каждую функцию, командный центр.

## Что живое в этом срезе

- Агенты с `harness/*.yaml` + `harness/*.eval.json` (ключ `agent_id`)
- Контракты: PersonVector, SpectrogramCard, CompatibilityArtifact, SessionReport, JourneyState
- Python DSP: 12 полос Академии Пульса. Без `consent.audio` карточка пустая. **Статус: не запускается** (нет `oscillators.py` и `indices.py`); СМФК-100 работает автономно.
- СМФК-100: `Gcc = ∏(Cr·Sr)^{1/n} · (1 − σ²(Of))`, fail-closed при n<3. Фикстура → **Gcc = 0.842491** (вычислено формулой, `tests/test_gcc.py`). Значение 0.928 из платформенного документа **не воспроизводится** ни по этой формуле, ни по этой фикстуре; в расчётах не используется (метка: reported, не подтверждено).
- Command Center: `apps/command-center/index.html`

## Красные линии

Не диагноз. Не назначение. Не лабораторные гормоны/гены. Нет данных без согласия.
При кризисе — 988 / Украина 7333, без методов.

## Запуск

```bash
python3 tests/test_gcc.py
# tests/test_oscillators.py отсутствует: модули oscillators.py и indices.py в репозитории не найдены (ни в main, ни в PR #1, ни в истории git)
python3 services/dsp/analyze_synth.py
python3 services/dsp/analyze_synth.py --consent
python3 -m http.server 8765 --directory apps/command-center
```
