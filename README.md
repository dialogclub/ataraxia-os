# ATARAXIA OS — вертикальный срез

«От инженерии человека внешнего — к инженерии человека внутреннего.»

## Живое

- Command Center: `apps/command-center/index.html`
- СМФК-100: `Gcc = ∏(Cr·Sr)^{1/n} · (1 − σ²(Of))`, fail-closed при n<3
- Фикстура команды → **0.842491** (документ заявлял 0.928)
- DSP: без consent.audio чисел нет
- 12 полос Академии Пульса залокены тестом

## Запуск

```bash
python3 tests/test_gcc.py
python3 tests/test_oscillators.py
python3 services/dsp/analyze_synth.py
python3 services/dsp/analyze_synth.py --consent
python3 -m http.server 8765 --directory apps/command-center
```

Не диагноз. Не медицинское изделие.
