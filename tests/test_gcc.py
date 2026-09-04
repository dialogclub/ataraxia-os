#!/usr/bin/env python3
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from ataraxia_dsp.smfk import gcc, smfk_report
FIXTURE = json.loads((ROOT / "fixtures/smfk_team.json").read_text(encoding="utf-8"))
MEMBERS = FIXTURE["members"]

def test_gcc_canonical():
    value = gcc(MEMBERS)
    assert value is not None and abs(value - 0.8424909715815655) < 1e-6
    assert smfk_report(MEMBERS)["gcc_claimed_doc"] == 0.928
    print("PASS test_gcc_canonical", round(value, 6))

def test_fail_closed_n_lt_3():
    assert gcc(MEMBERS[:1]) is None
    assert gcc(MEMBERS[:2]) is None
    assert gcc(MEMBERS[:3]) is not None
    print("PASS test_fail_closed_n_lt_3")

def test_bounds_reject():
    bad = [{"Cr": 1.2, "Sr": 0.5, "Of": 0.5}] * 3
    try:
        gcc(bad)
        raise AssertionError("should reject")
    except ValueError:
        print("PASS test_bounds_reject")

if __name__ == "__main__":
    test_gcc_canonical(); test_fail_closed_n_lt_3(); test_bounds_reject()
    print("ALL GCC TESTS PASSED")
