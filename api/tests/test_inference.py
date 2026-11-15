import numpy as np
import pytest
import statsmodels.api as sm

from trend_atlas.inference import fit_trend, statement
from tests.conftest import SNAPSHOT
from trend_atlas.zonal import parse_zonal

YEARS = list(range(2001, 2025))


def noise(n, seed, sd=0.05):
    return np.random.default_rng(seed).normal(0, sd, n)


def ar1(n, rho, seed, sd=0.1):
    e = np.random.default_rng(seed).normal(0, sd, n)
    out = np.zeros(n)
    for i in range(n):
        out[i] = (rho * out[i - 1] if i else 0) + e[i]
    return out


def line(slope, extra):
    return [slope * (y - 2000) + e for y, e in zip(YEARS, extra)]


def test_rising():
    f = fit_trend(YEARS, line(0.05, noise(24, 1)), 2001, 2024)
    assert f["slopePerDecade"] == pytest.approx(0.5, abs=0.05)
    assert f["state"] == "supported_increase"
    assert f["inferenceAvailable"] is True
    assert f["n"] == 24


def test_falling():
    f = fit_trend(YEARS, line(-0.05, noise(24, 1)), 2001, 2024)
    assert f["slopePerDecade"] == pytest.approx(-0.5, abs=0.05)
    assert f["state"] == "supported_decrease"


def test_flat_noisy():
    f = fit_trend(YEARS, list(noise(24, 7, sd=0.3)), 2001, 2024)
    assert f["state"] == "inconclusive"
    assert f["ciLow"] < 0 < f["ciHigh"]


def test_exact_known_slope():
    f = fit_trend(YEARS, line(0.123, noise(24, 3, sd=1e-6)), 2001, 2024)
    assert f["slopePerDecade"] == pytest.approx(1.23, abs=1e-3)


def test_perfectly_linear_is_degenerate():
    # SUSPECTED ENGINE BUG (reported, not fixed here): inference.py checks
    # `denom == 0` exactly, but OLS residuals of an exact line are ~1e-16 float
    # round-off, so this returns supported_increase with a near-zero-width CI.
    # Intended (engine reason text): values exactly on a line -> degenerate_variance.
    f = fit_trend(YEARS, [0.05 * (y - 2000) for y in YEARS], 2001, 2024)
    assert f["state"] == "degenerate_variance"


def test_constant_is_degenerate():
    f = fit_trend(YEARS, [1.5] * 24, 2001, 2024)
    assert f["state"] == "degenerate_variance"


def test_short():
    ys = list(range(2015, 2025))
    f = fit_trend(ys, [0.1 * i + e for i, e in enumerate(noise(10, 2))], 2015, 2024)
    assert f["state"] == "insufficient_data"
    assert f["descriptiveOnly"] is True
    assert f["slopePerDecade"] is not None
    assert f["ciLow"] is None and f["ciHigh"] is None and f["pValue"] is None
    assert "20" in f["reason"]


def test_gapped():
    vals = line(0.05, noise(24, 1))
    vals[12] = None
    f = fit_trend(YEARS, vals, 2001, 2024)
    assert f["contiguous"] is False
    assert f["inferenceAvailable"] is False
    assert f["missingYears"] == [2013]
    assert f["slopePerDecade"] is not None


def test_fewer_than_three():
    f = fit_trend([2001, 2002], [1.0, 2.0], 2001, 2024)
    assert f["slopePerDecade"] is None


def test_window_filtering():
    ys = list(range(1990, 2030))
    vals = [0.05 * (y - 2000) + e for y, e in zip(ys, noise(40, 4))]
    f = fit_trend(ys, vals, 2001, 2024)
    assert f["n"] == 24
    assert f["usedStartYear"] == 2001 and f["usedEndYear"] == 2024
    ref = fit_trend(ys[11:35], vals[11:35], 2001, 2024)
    assert f["slopePerDecade"] == ref["slopePerDecade"]


def test_correlated_sensitivity():
    f = fit_trend(YEARS, line(0.03, ar1(24, 0.6, 11)), 2001, 2024)
    assert [s["maxLags"] for s in f["sensitivity"]] == [1, 2, 3]
    p = f["sensitivity"][1]
    for k in ("slopePerDecade", "ciLow", "ciHigh", "pValue"):
        assert f[k] == p[k]


def test_hac_cross_check():
    y = np.array(line(0.03, ar1(24, 0.6, 5)))
    x = np.array(YEARS, float)
    r = sm.OLS(y, sm.add_constant(x - x.mean())).fit().get_robustcov_results(
        cov_type="HAC", maxlags=2, use_correction=True, use_t=True)
    f = fit_trend(YEARS, list(y), 2001, 2024)
    lo, hi = r.conf_int(alpha=0.05)[1]
    assert f["slopePerDecade"] == pytest.approx(r.params[1] * 10, abs=1e-12)
    assert f["ciLow"] == pytest.approx(lo * 10, abs=1e-12)
    assert f["ciHigh"] == pytest.approx(hi * 10, abs=1e-12)


def test_paired_identity():
    a = np.array(line(0.04, ar1(24, 0.3, 21)))
    b = np.array(line(0.01, ar1(24, 0.3, 22)))
    fa, fb, fd = (fit_trend(YEARS, list(v), 2001, 2024) for v in (a, b, a - b))
    assert fd["slopePerDecade"] == pytest.approx(fa["slopePerDecade"] - fb["slopePerDecade"], abs=1e-9)


def test_statement_wording():
    inc = fit_trend(YEARS, list(noise(24, 7, sd=0.3)), 2001, 2024)
    s = statement(inc, "Temperature", "°C/decade", "in the box")
    assert "Evidence for a change is inconclusive" in s
    assert "increased by" not in s and "decreased by" not in s
    up = fit_trend(YEARS, line(0.05, noise(24, 1)), 2001, 2024)
    assert "increased by" in statement(up, "T", "°C/decade", "here")
    down = fit_trend(YEARS, line(-0.05, noise(24, 1)), 2001, 2024)
    s = statement(down, "T", "°C/decade", "here")
    assert "−" in s and "-0." not in s


@pytest.fixture(scope="module")
def zonal():
    return parse_zonal(SNAPSHOT)


def _band(z, b):
    return dict(zip(z["years"], z["series"][b]))


def test_pinned_real_case(zonal):
    a, b = _band(zonal, "64N-90N"), _band(zonal, "90S-64S")
    assert a[2024] == 2.88 and b[2024] == 0.71
    d = [a[y] - b[y] for y in YEARS]
    cases = [
        ([a[y] for y in YEARS], 0.67, 0.47, 0.87, None),
        ([b[y] for y in YEARS], 0.08, -0.08, 0.25, "inconclusive"),
        (d, 0.59, 0.38, 0.80, None),
    ]
    for vals, s, lo, hi, state in cases:
        f = fit_trend(YEARS, vals, 2001, 2024)
        assert f["slopePerDecade"] == pytest.approx(s, abs=0.005)
        assert f["ciLow"] == pytest.approx(lo, abs=0.005)
        assert f["ciHigh"] == pytest.approx(hi, abs=0.005)
        if state:
            assert f["state"] == state
        assert len({x["state"] for x in f["sensitivity"]}) == 1
        short = fit_trend(list(range(2015, 2025)), vals[14:], 2015, 2024)
        assert short["inferenceAvailable"] is False and short["descriptiveOnly"] is True
