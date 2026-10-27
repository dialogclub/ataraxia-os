"""Вариабельность пульса (PRV) по РЕАЛЬНОМУ PPG-ряду. Только при согласии, только из переданных отсчётов.

Метки: HR, SDNN, RMSSD, pNN50 по межпиковым интервалам — [observed] (Task Force of ESC/NASPE 1996; для PPG это PRV, а не
HRV: во временной области совпадает с ЭКГ-HRV, в частотной (LF/HF) — нет, поэтому LF/HF здесь НЕ считается,
Pulse rate variability vs HRV, PubMed 24111246 [reported]).
Спектральная «12-осцилляторная» модель ПМА (Академия Пульса) требует их 12 позиций/датчика и не реализуема по одному PPG;
здесь не воспроизводится. Не диагноз, не назначение. Никаких симуляций: нет ряда/согласия/достаточного числа ударов -> None.
"""
from __future__ import annotations

import math
import numpy as np

MIN_BEATS = 20
MIN_SECONDS = 30.0
HR_RANGE = (30.0, 220.0)


def _closed(reason: str) -> dict:
    return {"fail_closed": True, "reason": reason, "hr_bpm": None, "sdnn_ms": None, "rmssd_ms": None, "pnn50": None,
            "epistemic": {"hr_bpm": "observed", "sdnn_ms": "observed", "rmssd_ms": "observed", "pnn50": "observed"}}


def detect_peaks(ppg, fs: float) -> list[int]:
    """Пики систолы: скользящее среднее 0.25 с как опора, порог = среднее + 0.3*std, рефрактерный период 0.3 с."""
    x = np.asarray(ppg, dtype=float)
    w = max(3, int(0.25 * fs))
    base = np.convolve(x, np.ones(w) / w, mode="same")
    d = x - base
    thr = 0.3 * np.std(d)
    refr = int(0.3 * fs)
    peaks: list[int] = []
    for i in range(1, len(d) - 1):
        if d[i] > thr and d[i] >= d[i - 1] and d[i] > d[i + 1]:
            if not peaks or i - peaks[-1] >= refr:
                peaks.append(i)
            elif d[i] > d[peaks[-1]]:
                peaks[-1] = i
    return peaks


def prv_time_domain(ppg, fs: float, consent: dict | None = None) -> dict:
    if not (consent or {}).get("ppg"):
        return _closed("missing_consent.ppg")
    if ppg is None or fs is None or not (isinstance(fs, (int, float)) and fs > 0):
        return _closed("no_signal")
    x = np.asarray(ppg, dtype=float)
    if x.ndim != 1 or x.size == 0:
        return _closed("no_signal")
    if not np.all(np.isfinite(x)):
        return _closed("nonfinite_signal")
    if x.size / fs < MIN_SECONDS:
        return _closed("too_short")
    peaks = detect_peaks(x, fs)
    if len(peaks) < MIN_BEATS:
        return _closed("too_few_beats")
    rr = np.diff(peaks) / fs * 1000.0
    hr_lo, hr_hi = HR_RANGE
    ok = (rr >= 60000.0 / hr_hi) & (rr <= 60000.0 / hr_lo)
    # Ectopic/артефакт: отклонение > 20 % от локальной медианы (практика Task Force) — отбрасываем, но считаем долю
    med = float(np.median(rr[ok])) if ok.any() else 0.0
    if med <= 0:
        return _closed("no_valid_intervals")
    ok &= np.abs(rr - med) <= 0.2 * med
    clean = rr[ok]
    if clean.size < MIN_BEATS - 1:
        return _closed("too_many_artifacts")
    d = np.diff(clean)
    return {
        "fail_closed": False, "reason": None,
        "n_beats": int(len(peaks)), "n_intervals_used": int(clean.size),
        "artifact_fraction": float(1.0 - clean.size / rr.size),
        "hr_bpm": float(60000.0 / np.mean(clean)),
        "sdnn_ms": float(np.std(clean, ddof=1)),
        "rmssd_ms": float(math.sqrt(float(np.mean(d ** 2)))),
        "pnn50": float(np.mean(np.abs(d) > 50.0)),
        "kind": "PRV (из PPG), не ЭКГ-HRV",
        "epistemic": {"hr_bpm": "observed", "sdnn_ms": "observed", "rmssd_ms": "observed", "pnn50": "observed",
                      "interpretation": "hypothetical"},
        "disclaimer": "Исследовательский показатель. Не диагноз и не назначение.",
    }
