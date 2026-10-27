"""Исследовательские индексы голоса (словарь, не диагноз). Fail-closed: нет надёжных входов -> None.

ЭПИСТЕМИЧЕСКИЕ МЕТКИ по каждому полю возвращаются в result["epistemic"]:
  observed     — прямой расчёт из измеренных признаков (CV F0, HNR, джиттер, центроид, энтропия полос);
  inferred     — нормировка/порог выбран нами по литературе (reference, saturation);
  hypothetical — композиты и ТКМ/Аюрведа-группировки (stress_proxy, tridosha_*, yin_yang_*): гипотеза, не измерение;
  reported     — справочные пороги из литературы (джиттер ~1.04 %, HNR норма ~20 дБ).
Единицы входа: f0_* в Гц, jitter в ПРОЦЕНТАХ, hnr в дБ, energy_mean — средний квадрат амплитуды, centroid в Гц.
"""
from __future__ import annotations

import math

REF_JITTER_PCT = 1.04   # [reported] порог джиттера по умолчанию в Praat (относительный)
SAT_JITTER_PCT = 2.0    # [inferred] насыщение компоненты
REF_HNR_DB = 20.0       # [reported] верхняя граница типичной нормы
SAT_F0_CV = 0.25        # [inferred] CV F0 >= 25 % насыщает компоненту

# Группировка по руководству «Ос-Ци-Локер» v0.2.0, раздел 7 [reported как их постулат; для нас hypothetical]
TRIDOSHA = {
    "pitta": ("gallbladder", "liver", "heart", "small_intestine"),
    "vata": ("lung", "large_intestine", "bladder", "kidney"),
    "kapha": ("stomach", "spleen", "pericardium", "triple_energizer"),
}

EPISTEMIC = {
    "f0_cv": "observed", "hnr_db": "observed", "jitter_pct": "observed", "spectral_centroid_hz": "observed",
    "band_entropy_norm": "observed", "band_dominant": "observed", "meridian_balance": "observed",
    "stress_proxy": "hypothetical", "tridosha_shares": "hypothetical",
    "references": "reported", "normalisation": "inferred",
}


def _clip01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _closed(reason: str) -> dict:
    return {
        "fail_closed": True, "reason": reason,
        "stress_index": None, "stress_proxy": None, "f0_cv": None, "band_entropy_norm": None,
        "epistemic": dict(EPISTEMIC),
        "disclaimer": "Исследовательский словарь. Не диагноз. Не медицинское изделие.",
    }


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def band_entropy_norm(shares: list[float]) -> float | None:
    """Нормированная энтропия Шеннона распределения энергии по 12 полосам: 1 = равномерно (изотропно), 0 = одна полоса.
    [observed] Метафора «изотропности» Академии Пульса — hypothetical; у голоса спектр естественно неравномерен."""
    s = [x for x in shares if x is not None]
    if len(s) < 2 or any(x < 0 for x in s):
        return None
    tot = sum(s)
    if tot <= 0:
        return None
    h = -sum((x / tot) * math.log(x / tot) for x in s if x > 0)
    return h / math.log(len(s))


def research_indices(feats: dict, osc: dict | None) -> dict:
    """feats: f0_mean, f0_std, jitter(%), hnr(дБ), energy_mean, spectral_centroid. osc: результат oscillator_energies."""
    f0_mean, f0_std = feats.get("f0_mean"), feats.get("f0_std")
    jit, hnr = feats.get("jitter"), feats.get("hnr")
    if not _num(f0_mean) or f0_mean <= 0:
        return _closed("no_f0")           # без F0 нет просодики: не подставляем значения
    if not all(_num(v) and v >= 0 for v in (f0_std, jit)) or not _num(hnr):
        return _closed("invalid_features")
    osc_map = (osc or {}).get("oscillators") or {}
    shares = [v.get("energy") for v in osc_map.values()]
    entropy = band_entropy_norm(shares) if shares and all(s is not None for s in shares) else None

    f0_cv = f0_std / f0_mean
    c_jit = _clip01(jit / SAT_JITTER_PCT)
    c_hnr = _clip01((REF_HNR_DB - hnr) / REF_HNR_DB)
    c_cv = _clip01(f0_cv / SAT_F0_CV)
    stress_proxy = (c_jit + c_hnr + c_cv) / 3.0   # [hypothetical] равные веса, не валидирован

    result = {
        "fail_closed": False, "reason": None,
        "f0_cv": f0_cv,
        "jitter_pct": float(jit), "jitter_above_ref": bool(jit > REF_JITTER_PCT),
        "hnr_db": float(hnr),
        "spectral_centroid_hz": float(feats["spectral_centroid"]) if _num(feats.get("spectral_centroid")) else None,
        "energy_mean": float(feats["energy_mean"]) if _num(feats.get("energy_mean")) else None,
        "stress_proxy": stress_proxy,
        "stress_index": stress_proxy,  # алиас (имя используется в analyze_synth); смысл — прокси, не стресс человека
        "stress_components": {"jitter": c_jit, "hnr": c_hnr, "f0_cv": c_cv},
        "band_entropy_norm": entropy,
        "epistemic": dict(EPISTEMIC),
        "disclaimer": "Исследовательский словарь. Не диагноз. Не медицинское изделие. stress_proxy не валидирован.",
    }
    if shares and all(s is not None for s in shares):
        n = len(shares)
        keys = list(osc_map.keys())
        result["meridian_balance"] = {k: shares[i] * n - 1.0 for i, k in enumerate(keys)}  # 0 = ровно, + выше среднего
        dom = max(range(n), key=lambda i: shares[i])
        result["band_dominant"] = {"key": keys[dom], "id": osc_map[keys[dom]]["id"], "share": shares[dom]}
        result["tridosha_shares"] = {
            d: sum(osc_map[k]["energy"] for k in ks if k in osc_map) for d, ks in TRIDOSHA.items()
        }
    return result
