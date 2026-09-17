#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from ataraxia_dsp.analyze import analyze_voice

def synth_tone(sr=16000, seconds=2.0, f0=110.0):
    t = np.arange(int(sr * seconds)) / sr
    audio = 0.4 * np.sin(2 * np.pi * f0 * t) + 0.15 * np.sin(2 * np.pi * (f0 * 2) * t)
    audio += 0.05 * np.random.default_rng(0).normal(0, 1, audio.shape)
    return audio, sr, f0

def main(consent_audio: bool = False):
    audio, sr, f0 = synth_tone()
    card = analyze_voice(audio, sr, consent={"audio": consent_audio}, spectral_hints={
        "f0_mean": f0 if consent_audio else 0.0, "f0_std": 4.0, "jitter": 0.6,
        "hnr": 16.0, "spectral_centroid": 400.0, "synthetic": True,
    })
    osc = card.get("oscillators") or {}
    idx = card.get("indices") or {}
    print(json.dumps({
        "consent_audio": consent_audio,
        "fail_closed": (card.get("quality") or {}).get("fail_closed"),
        "reason": (card.get("quality") or {}).get("reason"),
        "f0_mean": card.get("f0_mean"),
        "lung_energy": None if not osc else osc["oscillators"]["lung"]["energy"],
        "stress_index": None if not idx else idx.get("stress_index"),
    }, ensure_ascii=False, indent=2))
    return card

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--consent", action="store_true")
    args = p.parse_args()
    main(consent_audio=args.consent)
