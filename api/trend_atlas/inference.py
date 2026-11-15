"""Trend inference shared by every dataset.

Contract (CLAUDE_BUILD_PLAN.md, "Analysis contract"):
- OLS of annual values on centred calendar years.
- HAC covariance, Bartlett kernel, maxlags=2 (primary), small-sample
  correction, t reference distribution. Sensitivity at lags 1, 2, 3.
- Slope and interval endpoints are reported per decade (x10).
- Inference needs >= 20 contiguous complete annual observations; shorter or
  gapped records get a labelled descriptive slope only.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

import numpy as np
import statsmodels.api as sm

METHOD_VERSION = "trend-atlas-method-1.0"
MIN_YEARS_FOR_INFERENCE = 20
PRIMARY_LAG = 2
SENSITIVITY_LAGS = (1, 2, 3)
ALPHA = 0.05

METHOD = {
    "version": METHOD_VERSION,
    "model": "OLS of annual value on centred calendar year",
    "covariance": "HAC (Newey-West), Bartlett kernel, small-sample correction, t distribution",
    "primaryMaxLags": PRIMARY_LAG,
    "sensitivityMaxLags": list(SENSITIVITY_LAGS),
    "alpha": ALPHA,
    "intervalLevel": 0.95,
    "minContiguousYearsForInference": MIN_YEARS_FOR_INFERENCE,
    "intervalMeaning": (
        "Model-based interval for the slope of the chosen linear model with "
        "autocorrelation-robust errors. It does not propagate observational "
        "uncertainty in the source data."
    ),
    "library": f"statsmodels {sm.__version__}",
}


def _state(lo: float, hi: float) -> str:
    if lo > 0:
        return "supported_increase"
    if hi < 0:
        return "supported_decrease"
    return "inconclusive"


def _hac(ols, lag: int) -> dict:
    r = ols.get_robustcov_results(cov_type="HAC", maxlags=lag, use_correction=True, use_t=True)
    lo, hi = r.conf_int(alpha=ALPHA)[1]
    return {
        "maxLags": lag,
        "slopePerDecade": float(r.params[1] * 10),
        "ciLow": float(lo * 10),
        "ciHigh": float(hi * 10),
        "pValue": float(r.pvalues[1]),
        "state": _state(lo, hi),
    }


def fit_trend(years: Sequence[int], values: Sequence[Optional[float]],
              start_year: int, end_year: int) -> dict:
    """Fit the contract model to the complete years inside [start_year, end_year]."""
    pairs = [(int(y), float(v)) for y, v in zip(years, values)
             if v is not None and not (isinstance(v, float) and math.isnan(v))
             and start_year <= int(y) <= end_year]
    pairs.sort()
    used = [p[0] for p in pairs]
    requested = list(range(start_year, end_year + 1))
    missing = [y for y in requested if y not in set(used)]
    n = len(pairs)
    out = {
        "state": "insufficient_data",
        "n": n,
        "requestedStartYear": start_year,
        "requestedEndYear": end_year,
        "usedStartYear": used[0] if used else None,
        "usedEndYear": used[-1] if used else None,
        "completeYears": used,
        "missingYears": missing,
        "contiguous": None,
        "inferenceAvailable": False,
        "reason": None,
        "slopePerDecade": None,
        "ciLow": None,
        "ciHigh": None,
        "pValue": None,
        "centerYear": None,
        "valueAtCenter": None,
        "fitted": None,
        "sensitivity": None,
        "sensitiveToMethod": None,
        "residualLag1Autocorrelation": None,
        "descriptiveOnly": False,
    }
    if n < 3:
        out["reason"] = f"Only {n} complete annual value(s) in the window; a slope cannot be estimated."
        return out
    x = np.array(used, dtype=float)
    y = np.array([p[1] for p in pairs])
    contiguous = bool(np.all(np.diff(x) == 1))
    out["contiguous"] = contiguous
    if float(np.ptp(y)) == 0.0:
        out["state"] = "degenerate_variance"
        out["reason"] = "All annual values are identical; no trend model can be evaluated."
        return out
    center = float(x.mean())
    ols = sm.OLS(y, sm.add_constant(x - center)).fit()
    b0, b1 = (float(v) for v in ols.params)
    out.update({
        "slopePerDecade": b1 * 10,
        "centerYear": center,
        "valueAtCenter": b0,
        "fitted": [{"year": int(yr), "value": b0 + b1 * (yr - center)} for yr in (x[0], x[-1])],
    })
    resid = np.asarray(ols.resid)
    denom = float(np.sum(resid ** 2))
    # Float round-off leaves ~1e-30 residuals for an exact line; treat that as zero.
    if denom <= 1e-20 * float(np.sum((y - y.mean()) ** 2)):
        denom = 0.0
    if denom > 0 and contiguous:
        out["residualLag1Autocorrelation"] = float(np.sum(resid[1:] * resid[:-1]) / denom)
    if denom == 0:
        out["state"] = "degenerate_variance"
        out["reason"] = "The annual values lie exactly on a line; the residual variance is zero."
        return out
    if n < MIN_YEARS_FOR_INFERENCE or not contiguous:
        out["descriptiveOnly"] = True
        out["reason"] = (
            f"{n} complete years; inference needs at least {MIN_YEARS_FOR_INFERENCE} contiguous years."
            if n < MIN_YEARS_FOR_INFERENCE else
            "The annual record has gaps; HAC inference needs contiguous years."
        ) + " The slope is descriptive only."
        return out
    sens = [_hac(ols, lag) for lag in SENSITIVITY_LAGS]
    primary = next(s for s in sens if s["maxLags"] == PRIMARY_LAG)
    out.update({
        "state": primary["state"],
        "inferenceAvailable": True,
        "ciLow": primary["ciLow"],
        "ciHigh": primary["ciHigh"],
        "pValue": primary["pValue"],
        "sensitivity": sens,
        "sensitiveToMethod": len({s["state"] for s in sens}) > 1,
    })
    return out


def _signed(v: float, digits: int) -> str:
    s = f"{abs(v):.{digits}f}"
    if float(s) == 0:
        return s
    return ("+" if v > 0 else "−") + s


def statement(fit: dict, noun: str, rate_unit: str, scope: str, digits: int = 2) -> str:
    """One-sentence reading. Wording is only as strong as the evidence state."""
    st = fit["state"]
    if st == "no_spatial_coverage":
        return fit.get("reason") or "No valid data cells in this region."
    if fit["slopePerDecade"] is None:
        return fit.get("reason") or "No trend could be estimated."
    rate = f"{_signed(fit['slopePerDecade'], digits)} {rate_unit}"
    span = f"{fit['usedStartYear']}–{fit['usedEndYear']}"
    up = fit["slopePerDecade"] > 0
    if st == "supported_increase":
        return f"{noun} increased by {rate} {scope}, {span}."
    if st == "supported_decrease":
        return f"{noun} decreased by {rate} {scope}, {span}."
    if st == "inconclusive":
        return (f"Estimated {'increase' if up else 'decrease'} of {rate} {scope}, {span}. "
                "Evidence for a change is inconclusive.")
    return f"Descriptive slope of {rate} {scope}, {span}. {fit['reason']}"
