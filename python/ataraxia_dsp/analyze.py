"""Единая точка входа DSP. Нет согласия — нет числа."""
from __future__ import annotations
from typing import Optional
import numpy as np
from .oscillators import oscillator_energies, stft_power
from .indices import research_indices

CLOSED_CARD = {
    "maturity": "R",
    "disclaimer": "Исследовательский словарь. Не диагноз. Не медицинское изделие.",
    "quality": {"fail_closed": True},
    "f0_mean": None,
    "oscillators": None,
    "indices": None,
}


def analyze_voice(
    audio: Optional[np.ndarray],
    sr: int,
    consent: dict | None = None,
    spectral_hints: dict | None = None,
) -> dict:
    consent = consent or {}
    if not consent.get("audio"):
        card = dict(CLOSED_CARD)
        card["quality"] = {"fail_closed": True, "reason": "missing_consent.audio"}
        return card
    if audio is None or len(audio) == 0:
        card = dict(CLOSED_CARD)
        card["quality"] = {"fail_closed": True, "reason": "empty_audio"}
        return card
    freqs, power = stft_power(np.asarray(audio, dtype=float), int(sr))
    osc = oscillator_energies(freqs, power)
    hints = spectral_hints or {}
    idx = research_indices({
        "f0_mean": hints.get("f0_mean", 0.0),
        "f0_std": hints.get("f0_std", 0.0),
        "jitter": hints.get("jitter", 0.0),
        "hnr": hints.get("hnr", 0.0),
        "energy_mean": float(np.mean(np.asarray(audio) ** 2)),
        "spectral_centroid": hints.get("spectral_centroid", 0.0),
    }, osc)
    return {
        "maturity": "R",
        "disclaimer": "Исследовательский словарь. Не диагноз. Не медицинское изделие.",
        "quality": {"fail_closed": bool(idx.get("fail_closed")), "sr": int(sr), "synthetic": hints.get("synthetic", False)},
        "f0_mean": hints.get("f0_mean"),
        "oscillators": osc,
        "indices": idx,
        "confidence_band_80_120": osc.get("confidence_band_80_120"),
    }
