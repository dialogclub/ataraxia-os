"""СМФК-100. Gcc = prod(Cr*Sr)**(1/n) * (1 - var_pop(Of)). Fail-closed n<3."""
from __future__ import annotations
from typing import Iterable, Optional
import math


def _var_pop(xs: list[float]) -> float:
    n = len(xs)
    if n == 0:
        return 0.0
    mu = sum(xs) / n
    return sum((x - mu) ** 2 for x in xs) / n


def gcc(members: Iterable[dict], of_key: str = "Of") -> Optional[float]:
    rows = list(members)
    n = len(rows)
    if n < 3:
        return None
    products = []
    ofs = []
    for r in rows:
        cr = float(r["Cr"])
        sr = float(r["Sr"])
        for v in (cr, sr, float(r[of_key])):
            if not (0.0 <= v <= 1.0):
                raise ValueError("Cr/Sr/Of must be in [0,1]")
        products.append(cr * sr)
        ofs.append(float(r[of_key]))
    geo = math.exp(sum(math.log(max(p, 1e-15)) for p in products) / n)
    return geo * (1.0 - _var_pop(ofs))


def smfk_report(members: Iterable[dict]) -> dict:
    rows = list(members)
    n = len(rows)
    value = gcc(rows)
    ofs = [float(r["Of"]) for r in rows] if rows else []
    return {
        "n": n,
        "Gcc": value,
        "gcc_claimed_doc": 0.928 if n == 5 else None,
        "formula": "prod(Cr*Sr)**(1/n) * (1 - var_pop(Of))",
        "components": {
            "var_pop_Of": _var_pop(ofs) if ofs else None,
        },
        "fail_closed": value is None,
        "maturity": "P",
        "disclaimer": "Системная метрика группы. Не оценка личности.",
    }
