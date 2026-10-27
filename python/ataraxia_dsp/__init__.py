"""ataraxia_dsp: СМФК-100 (smfk), DSP-карточка (analyze), 12 осцилляторов (oscillators), индексы (indices), PRV (pulse).
Импорт DSP-части терпим к отсутствию numpy, чтобы СМФК-100 и tests/test_gcc.py работали автономно."""
from .smfk import gcc, smfk_report

__all__ = ["gcc", "smfk_report"]

try:  # DSP-часть требует numpy
    from .oscillators import OSCILLATOR_BANDS, oscillator_energies, band_energy, stft_power  # noqa: F401
    from .indices import research_indices  # noqa: F401
    from .pulse import prv_time_domain  # noqa: F401
    from .analyze import analyze_voice  # noqa: F401
    __all__ += ["OSCILLATOR_BANDS", "oscillator_energies", "band_energy", "stft_power",
                "research_indices", "prv_time_domain", "analyze_voice"]
    DSP_AVAILABLE = True
except ImportError as exc:  # pragma: no cover
    DSP_AVAILABLE = False
    DSP_MISSING_REASON = str(exc)
