"""12 осцилляторов: полосовые энергии голосового сигнала (словарь «Академии Пульса», адаптация к голосу).

ЭПИСТЕМИЧЕСКИЕ МЕТКИ (см. docs/ataraxia-os-oscillators-indices.md):
  * энергия в полосе, доля энергии, спектр Ханна/STFT ........ [observed]  (арифметика над реальным сигналом)
  * границы полос (80 Гц ... 5 кГц, 12 полос, лог-шаг) ........ [inferred]  (инженерный выбор проекта; Академия Пульса
                                                                          таблицу частот в открытых материалах не публикует)
  * имена полос (GB, LR, LU ...) и порядок суточной циркуляции  [hypothetical] (словарь ПМА/ТКМ, НЕ клинический смысл)
Не диагноз. Не назначение. Данных без согласия нет: вызывающий код (analyze.analyze_voice) обязан проверять consent.audio.
Никаких симуляций: функции работают только с переданным массивом и бросают ValueError на NaN/Inf.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np

# Порядок: суточная циркуляция меридианов, начиная с GB (середина активности 0:00).
# Источник порядка: Академия Пульса, «Ос-Ци-Локер» v0.2.0, руководство 2024-10-11, раздел 4 [reported].
# Сопоставление «полоса k -> меридиан k» (низкие частоты -> GB ... высокие -> TE) — НАША конвенция [hypothetical].
_ORDER = (
    ("gallbladder", "GB", "Желчный пузырь"),
    ("liver", "LR", "Печень"),
    ("lung", "LU", "Лёгкие"),
    ("large_intestine", "LI", "Толстый кишечник"),
    ("stomach", "ST", "Желудок"),
    ("spleen", "SP", "Селезёнка/панкреас"),
    ("heart", "HT", "Сердце"),
    ("small_intestine", "SI", "Тонкий кишечник"),
    ("bladder", "BL", "Мочевой пузырь"),
    ("kidney", "KI", "Почки"),
    ("pericardium", "PC", "Перикард"),
    ("triple_energizer", "TE", "Три обогревателя"),
)

F_LO = 80.0     # нижняя граница диапазона, Гц (F0 взрослых >= 75 Гц, см. SpectrogramCard.f0.range_hz)
F_HI = 5000.0   # верхняя граница, Гц (спектрограмма 0-5 кГц в браузерном модуле)
N_BANDS = 12
CONFIDENCE_BAND = (80.0, 120.0)  # маркер уверенности СМФК, SpectrogramCard.smfk_confidence_band

_EDGES = [F_LO * (F_HI / F_LO) ** (k / N_BANDS) for k in range(N_BANDS + 1)]

OSCILLATOR_BANDS: dict[str, dict] = {
    key: {
        "id": code,
        "label": ru,
        "hz": (round(_EDGES[i], 3), round(_EDGES[i + 1], 3)),
        "vocabulary_only": True,
        "epistemic": {"energy": "observed", "band_edges": "inferred", "label": "hypothetical"},
    }
    for i, (key, code, ru) in enumerate(_ORDER)
}


def stft_power(audio, sr: int, n_fft: int = 4096, hop: int | None = None):
    """Средняя по кадрам мощность спектра (окно Ханна). Возвращает (freqs[Гц], power). [observed]

    Бросает ValueError: пустой/нечисловой сигнал, sr <= 0 (fail-closed, без подстановок).
    """
    x = np.asarray(audio, dtype=float)
    if x.ndim != 1 or x.size == 0:
        raise ValueError("audio must be a non-empty 1-D array")
    if not np.all(np.isfinite(x)):
        raise ValueError("audio contains NaN/Inf")
    sr = int(sr)
    if sr <= 0:
        raise ValueError("sr must be positive")
    n_fft = int(n_fft)
    if n_fft < 16:
        raise ValueError("n_fft too small")
    hop = int(hop or n_fft // 2)
    if x.size < n_fft:
        x = np.pad(x, (0, n_fft - x.size))
    win = np.hanning(n_fft)
    starts = range(0, x.size - n_fft + 1, hop)
    acc = np.zeros(n_fft // 2 + 1)
    n = 0
    for s in starts:
        seg = x[s:s + n_fft]
        seg = seg - np.mean(seg)
        spec = np.fft.rfft(seg * win)
        acc += (np.abs(spec) ** 2)
        n += 1
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    return freqs, acc / max(n, 1)


def band_energy(freqs, power, lo: float, hi: float) -> float:
    """Суммарная мощность в полуинтервале [lo, hi). [observed]"""
    f = np.asarray(freqs, dtype=float)
    p = np.asarray(power, dtype=float)
    if f.shape != p.shape:
        raise ValueError("freqs and power shape mismatch")
    if not (hi > lo):
        raise ValueError("hi must be > lo")
    m = (f >= lo) & (f < hi)
    return float(np.sum(p[m]))


def oscillator_energies(freqs, power) -> dict:
    """Доли энергии по 12 полосам (сумма = 1 по диапазону 80 Гц-5 кГц). Нет мощности -> energy=None (fail-closed).

    Возвращает {"oscillators": {key: {...,"energy"}}, "oscillators_12": [...], "confidence_band_80_120": float|None,
                "total_power": float, "epistemic": {...}}.
    """
    f = np.asarray(freqs, dtype=float)
    p = np.asarray(power, dtype=float)
    if not (np.all(np.isfinite(f)) and np.all(np.isfinite(p))):
        raise ValueError("freqs/power contain NaN/Inf")
    if np.any(p < 0):
        raise ValueError("power must be non-negative")
    raw = {k: band_energy(f, p, *v["hz"]) for k, v in OSCILLATOR_BANDS.items()}
    total = float(sum(raw.values()))
    full = float(np.sum(p))
    out: dict[str, dict] = {}
    for k, v in OSCILLATOR_BANDS.items():
        out[k] = {
            "id": v["id"], "label": v["label"], "hz": list(v["hz"]),
            "energy": (raw[k] / total) if total > 0 else None,
            "vocabulary_only": True,
        }
    conf = None
    if full > 0:
        conf = band_energy(f, p, *CONFIDENCE_BAND) / full
    return {
        "oscillators": out,
        "oscillators_12": [out[k] for k in OSCILLATOR_BANDS],
        "confidence_band_80_120": conf,
        "total_power": total,
        "epistemic": {
            "energy": "observed",
            "band_edges": "inferred",
            "labels_and_order": "hypothetical",
            "note": "Словарь, не клиника. Не диагноз, не назначение.",
        },
    }
