import math

import numpy as np
import pytest

from trend_atlas import grid

# Keep fake cubes alive for the whole session: grid.annual_frames caches by
# id(cube), so a garbage-collected cube's id could be reused by a new one.
_KEEP = []


def make_cube(data, first_year):
    c = grid.Cube.__new__(grid.Cube)
    c.data = np.asarray(data, dtype=np.int16)
    c.first_year = first_year
    c.n_months = c.data.shape[0]
    c.last_complete_year = first_year + c.n_months // 12 - 1
    _KEEP.append(c)
    return c


def full(value, years=1):
    return np.full((12 * years, 90, 180), value, dtype=np.int16)


def test_edges():
    assert grid.LAT_EDGES[0] == -90 and grid.LON_EDGES[0] == -180
    assert np.all(np.diff(grid.LAT_EDGES) > 0) and np.all(np.diff(grid.LON_EDGES) > 0)


def test_box_weights():
    assert grid.box_weights(-180, -90, 180, 90).sum() == pytest.approx(720, abs=1e-9)
    anti = grid.box_weights(170, -10, -170, 10)
    ref = grid.box_weights(-10, -10, 10, 10)
    assert anti.sum() == pytest.approx(ref.sum(), abs=1e-12)
    cols = np.where(anti.sum(axis=0) > 0)[0]
    assert 0 in cols and 179 in cols
    half = grid.box_weights(0, 0, 1, 2)
    fullc = grid.box_weights(0, 0, 2, 2)
    assert half[45, 90] == pytest.approx(fullc[45, 90] / 2)
    assert np.count_nonzero(half) == 1
    assert ref[0].sum() == 0 and ref[:, 0].sum() == 0


def test_validate_box():
    for bad in [(0, 10, 10, 10), (0, 20, 10, 10), (0, -91, 10, 0), (0, 0, 10, 91), (10, 0, 10, 5)]:
        with pytest.raises(ValueError):
            grid.validate_box(*bad)
    assert grid.validate_box(190, 0, 200, 10) == (-170.0, 0.0, -160.0, 10.0)
    assert grid.validate_box(0, -10, 360, 10) == (-180.0, -10.0, 180.0, 10.0)


@pytest.mark.parametrize("year,feb,days", [(2023, 28, 365), (2024, 29, 366)])
def test_day_weighting(year, feb, days):
    m = np.zeros((1, 12, 1, 1))
    m[0, 1] = 10
    assert grid.annual_from_months([year], m)[0, 0, 0] == pytest.approx(10 * feb / days)


def test_missing_cell_excluded():
    d = full(100, 2)
    d[:, 45, 90] = 300
    d[5, 45, 90] = grid.MISSING
    c = make_cube(d, 2000)
    r = grid.region_series(c, (0, 0, 4, 2), 2000, 2001)  # cells (45,90),(45,91)
    assert r["coverage"]["touchedCells"] == 2
    assert r["coverage"]["eligibleCells"] == 1
    assert r["coverage"]["fraction"] < 1
    assert r["annual"] == pytest.approx([1.0, 1.0])


def test_all_missing():
    c = make_cube(full(grid.MISSING), 2000)
    r = grid.region_series(c, (0, 0, 10, 10), 2000, 2000)
    assert r["annual"] == [None]
    assert r["coverage"]["fraction"] == 0


@pytest.mark.parametrize("box", [(-180, -90, 180, 90), (170, -10, -170, 10), (5, 3, 7.5, 40)])
def test_uniform(box):
    c = make_cube(full(150, 2), 2000)
    r = grid.region_series(c, box, 2000, 2001)
    assert r["annual"] == pytest.approx([1.5, 1.5], abs=1e-6)
    assert all(abs(m["value"] - 1.5) < 1e-6 for m in r["monthly"])


def test_latitude_weighting():
    d = full(0)
    d[:, 75:, :] = 100  # rows 75..89 cover 60N..90N
    c = make_cube(d, 2000)
    r = grid.region_series(c, (-180, 0, 180, 90), 2000, 2000)
    assert r["annual"][0] == pytest.approx(1 - math.sin(math.radians(60)), abs=1e-6)


def test_trend_field():
    n = 20
    d = np.zeros((12 * n, 90, 180), dtype=np.int16)
    for k in range(n):
        d[12 * k:12 * (k + 1)] = 2 * k  # +0.02 C/yr, all months equal
    d[12 * 3 + 4, 10, 20] = grid.MISSING
    c = make_cube(d, 2000)
    t = grid.trend_field(c, 2000, 2000 + n - 1)
    assert np.isnan(t[10, 20])
    mask = np.ones_like(t, bool)
    mask[10, 20] = False
    assert np.allclose(t[mask], 0.2, atol=1e-3)
