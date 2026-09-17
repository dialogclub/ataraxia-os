"""ataraxia_dsp: СМФК-100 (smfk) и DSP-карточка (analyze). Модули oscillators/indices пока отсутствуют (⛔) —
импорт DSP-части терпим к их отсутствию, чтобы СМФК-100 и tests/test_gcc.py работали автономно."""
from .smfk import gcc, smfk_report

__all__ = ["gcc", "smfk_report"]

try:  # DSP-часть требует numpy и модули oscillators/indices
    from .oscillators import OSCILLATOR_BANDS, oscillator_energies, band_energy  # noqa: F401
    from .analyze import analyze_voice  # noqa: F401
    __all__ += ["OSCILLATOR_BANDS", "oscillator_energies", "band_energy", "analyze_voice"]
    DSP_AVAILABLE = True
except ImportError as exc:  # pragma: no cover
    DSP_AVAILABLE = False
    DSP_MISSING_REASON = str(exc)
