#!/usr/bin/env python3
"""Тесты oscillators.py / indices.py / analyze.py / pulse.py. Тестовые сигналы — синтетические фикстуры ТОЛЬКО для проверки
алгоритмов (не данные человека; в карточке помечаются synthetic)."""
import sys, math
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from ataraxia_dsp.oscillators import OSCILLATOR_BANDS, oscillator_energies, stft_power, band_energy, CONFIDENCE_BAND
from ataraxia_dsp.indices import research_indices, band_entropy_norm
from ataraxia_dsp.analyze import analyze_voice
from ataraxia_dsp.pulse import prv_time_domain

SR = 16000

def tone(f, sec=2.0, amp=0.5):
    t = np.arange(int(SR * sec)) / SR
    return amp * np.sin(2 * np.pi * f * t)

def test_bands_contiguous_12():
    b = list(OSCILLATOR_BANDS.values())
    assert len(b) == 12
    assert abs(b[0]["hz"][0] - 80.0) < 1e-6 and abs(b[-1]["hz"][1] - 5000.0) < 0.5
    for a, c in zip(b, b[1:]):
        assert abs(a["hz"][1] - c["hz"][0]) < 1e-2
    assert all(v["vocabulary_only"] for v in b)
    assert [v["id"] for v in b] == ["GB","LR","LU","LI","ST","SP","HT","SI","BL","KI","PC","TE"]
    print("PASS test_bands_contiguous_12")

def test_tone_lands_in_expected_band():
    for f in (100.0, 300.0, 1000.0, 3000.0):
        fr, p = stft_power(tone(f), SR)
        osc = oscillator_energies(fr, p)["oscillators"]
        top = max(osc, key=lambda k: osc[k]["energy"])
        lo, hi = OSCILLATOR_BANDS[top]["hz"]
        assert lo <= f < hi, (f, top, lo, hi)
        assert osc[top]["energy"] > 0.9
    print("PASS test_tone_lands_in_expected_band")

def test_shares_sum_to_one_and_confidence_band():
    fr, p = stft_power(tone(100.0) + tone(1500.0, amp=0.1), SR)
    o = oscillator_energies(fr, p)
    assert abs(sum(v["energy"] for v in o["oscillators"].values()) - 1.0) < 1e-9
    assert 0.5 < o["confidence_band_80_120"] <= 1.0
    assert len(o["oscillators_12"]) == 12
    assert o["epistemic"]["band_edges"] == "inferred"
    print("PASS test_shares_sum_to_one_and_confidence_band")

def test_stft_rejects_bad_input():
    for bad in (np.array([]), np.array([1.0, float("nan")] * 4000), np.array([float("inf")] * 5000)):
        try:
            stft_power(bad, SR); raise AssertionError("must reject")
        except ValueError:
            pass
    try:
        stft_power(tone(100.0), 0); raise AssertionError("must reject sr=0")
    except ValueError:
        pass
    print("PASS test_stft_rejects_bad_input")

def test_zero_power_fail_closed():
    fr, p = stft_power(np.zeros(8000), SR)
    o = oscillator_energies(fr, p)
    assert all(v["energy"] is None for v in o["oscillators"].values())
    assert o["confidence_band_80_120"] is None
    idx = research_indices({"f0_mean": 110.0, "f0_std": 3.0, "jitter": 0.5, "hnr": 18.0}, o)
    assert idx["band_entropy_norm"] is None and "meridian_balance" not in idx
    print("PASS test_zero_power_fail_closed")

def test_indices_values_and_labels():
    fr, p = stft_power(tone(110.0) + 0.3 * tone(220.0), SR)
    o = oscillator_energies(fr, p)
    i = research_indices({"f0_mean": 110.0, "f0_std": 5.5, "jitter": 1.0, "hnr": 10.0, "energy_mean": 0.1, "spectral_centroid": 400.0}, o)
    assert not i["fail_closed"]
    assert abs(i["f0_cv"] - 0.05) < 1e-12
    # компоненты: jitter 1.0/2.0=0.5; hnr (20-10)/20=0.5; cv 0.05/0.25=0.2
    assert abs(i["stress_proxy"] - (0.5 + 0.5 + 0.2) / 3) < 1e-12
    assert i["stress_index"] == i["stress_proxy"]
    assert i["epistemic"]["stress_proxy"] == "hypothetical" and i["epistemic"]["f0_cv"] == "observed"
    assert 0.0 <= i["band_entropy_norm"] < 0.6   # две узкие линии -> низкая энтропия
    assert abs(sum(i["tridosha_shares"].values()) - 1.0) < 1e-9
    assert abs(sum(i["meridian_balance"].values())) < 1e-9
    assert "Не диагноз" in i["disclaimer"]
    print("PASS test_indices_values_and_labels")

def test_indices_fail_closed():
    assert research_indices({"f0_mean": 0.0, "f0_std": 1, "jitter": 0.5, "hnr": 15}, None)["fail_closed"]
    assert research_indices({"f0_mean": None}, None)["reason"] == "no_f0"
    assert research_indices({"f0_mean": 100, "f0_std": float("nan"), "jitter": 0.5, "hnr": 15}, None)["reason"] == "invalid_features"
    assert research_indices({"f0_mean": 100, "f0_std": 1, "jitter": -1, "hnr": 15}, None)["fail_closed"]
    print("PASS test_indices_fail_closed")

def test_entropy_bounds():
    assert abs(band_entropy_norm([1.0] * 12) - 1.0) < 1e-12
    assert abs(band_entropy_norm([1.0] + [0.0] * 11)) < 1e-12
    assert band_entropy_norm([1.0]) is None
    print("PASS test_entropy_bounds")

def test_analyze_consent_gate():
    a = tone(110.0)
    closed = analyze_voice(a, SR, consent={})
    assert closed["quality"]["fail_closed"] and closed["oscillators"] is None and closed["indices"] is None
    assert closed["quality"]["reason"] == "missing_consent.audio"
    assert analyze_voice(None, SR, consent={"audio": True})["quality"]["reason"] == "empty_audio"
    bad = analyze_voice(np.array([float("nan")] * 5000), SR, consent={"audio": True})
    assert bad["quality"]["fail_closed"] and bad["quality"]["reason"].startswith("invalid_audio")
    ok = analyze_voice(a, SR, consent={"audio": True},
                       spectral_hints={"f0_mean": 110.0, "f0_std": 4.0, "jitter": 0.6, "hnr": 16.0, "spectral_centroid": 400.0, "synthetic": True})
    assert ok["oscillators"]["oscillators"]["gallbladder"]["energy"] > 0.5
    assert ok["indices"]["stress_index"] is not None and ok["quality"]["synthetic"] is True
    print("PASS test_analyze_consent_gate")

def _pulse(fs=50, sec=60, hr=72, jitter_ms=0.0, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(int(fs * sec)) / fs
    beats, tt = [], 0.4
    while tt < sec:
        beats.append(tt); tt += 60.0 / hr + rng.normal(0, jitter_ms / 1000.0)
    x = np.zeros_like(t)
    for b in beats:
        x += np.exp(-((t - b) ** 2) / (2 * 0.06 ** 2))
    return x + 0.01 * rng.normal(size=x.size), np.array(beats)

def test_prv_consent_and_values():
    x, beats = _pulse()
    assert prv_time_domain(x, 50, consent={})["reason"] == "missing_consent.ppg"
    r = prv_time_domain(x, 50, consent={"ppg": True})
    assert not r["fail_closed"] and abs(r["hr_bpm"] - 72) < 2.0 and r["sdnn_ms"] < 25 and r["kind"].startswith("PRV")
    x2, _ = _pulse(jitter_ms=40.0, seed=3)
    r2 = prv_time_domain(x2, 50, consent={"ppg": True})
    assert r2["rmssd_ms"] > r["rmssd_ms"]
    print("PASS test_prv_consent_and_values", round(r["hr_bpm"], 1), round(r2["rmssd_ms"], 1))

def test_prv_fail_closed():
    x, _ = _pulse(sec=10)
    assert prv_time_domain(x, 50, consent={"ppg": True})["reason"] == "too_short"
    assert prv_time_domain(None, 50, consent={"ppg": True})["reason"] == "no_signal"
    assert prv_time_domain(np.array([float("nan")] * 3000), 50, consent={"ppg": True})["reason"] == "nonfinite_signal"
    flat = np.zeros(3000)
    assert prv_time_domain(flat, 50, consent={"ppg": True})["fail_closed"]
    print("PASS test_prv_fail_closed")

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("ALL OSCILLATOR/INDEX TESTS PASSED")
