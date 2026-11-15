"""GISTEMP v4 2-degree monthly grid: decoding, annual frames, regional means.

Conventions fixed at ingest and asserted in tests:
- lat ascending -89..89 (cell centres), lon ascending -179..179, 2-degree cells.
- values are int16 hundredths of a degree C anomaly vs 1951-1980; MISSING marks
  no-data. Missing values stay missing: no infilling anywhere in this module.
"""
from __future__ import annotations

import calendar
from pathlib import Path

import numpy as np

MISSING = -32768
CELL = 2.0
NLAT, NLON = 90, 180
COVERAGE_THRESHOLD = 0.5  # minimum eligible area fraction for inference

LAT_EDGES = np.linspace(-90, 90, NLAT + 1)
LON_EDGES = np.linspace(-180, 180, NLON + 1)


class Cube:
    def __init__(self, path: Path):
        z = np.load(path)
        self.data = z["data"]            # (months, lat, lon) int16
        self.first_year = int(z["first_year"])
        self.n_months = self.data.shape[0]
        self.last_complete_year = self.first_year + self.n_months // 12 - 1
        self.last_month = (int(self.first_year + (self.n_months - 1) // 12),
                           (self.n_months - 1) % 12 + 1)

    def months(self, start_year: int, end_year: int) -> np.ndarray:
        """Float array (years, 12, lat, lon) with NaN for missing."""
        i0 = (start_year - self.first_year) * 12
        i1 = (end_year - self.first_year + 1) * 12
        block = self.data[i0:i1].astype(np.float32)
        block[self.data[i0:i1] == MISSING] = np.nan
        return (block / 100).reshape(end_year - start_year + 1, 12, NLAT, NLON)


def day_weights(year: int) -> np.ndarray:
    return np.array([calendar.monthrange(year, m)[1] for m in range(1, 13)], dtype=np.float64)


def annual_from_months(years: list[int], monthly: np.ndarray) -> np.ndarray:
    """Calendar-day-weighted annual mean along axis 1. Any missing month -> NaN."""
    out = np.empty((monthly.shape[0],) + monthly.shape[2:], dtype=np.float64)
    for i, y in enumerate(years):
        w = day_weights(y)
        out[i] = np.tensordot(w, monthly[i].astype(np.float64), axes=(0, 0)) / w.sum()
    return out


def validate_box(west: float, south: float, east: float, north: float) -> tuple:
    for v in (west, south, east, north):
        if not np.isfinite(v):
            raise ValueError("Box coordinates must be finite numbers.")
    if not (-90 <= south < north <= 90):
        raise ValueError("Latitude must satisfy -90 <= south < north <= 90.")
    if east - west >= 360:
        west, east = -180.0, 180.0
    else:
        west = ((west + 180) % 360) - 180
        east = ((east + 180) % 360) - 180
        if east == -180 and west != -180:
            east = 180.0
        if west == east:
            raise ValueError("West and east describe a zero-width box.")
    return float(west), float(south), float(east), float(north)


def _overlap(edges: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(np.minimum(edges[1:], hi) - np.maximum(edges[:-1], lo), 0, None)


def box_weights(west: float, south: float, east: float, north: float) -> np.ndarray:
    """Area weight of the box within each cell (fractional overlap, spherical area).

    West > east means the box crosses the antimeridian.
    """
    s = np.sin(np.radians(LAT_EDGES))
    slo, shi = np.sin(np.radians(south)), np.sin(np.radians(north))
    lat_w = np.clip(np.minimum(s[1:], shi) - np.maximum(s[:-1], slo), 0, None)
    if west < east:
        lon_w = _overlap(LON_EDGES, west, east)
    else:
        lon_w = _overlap(LON_EDGES, west, 180) + _overlap(LON_EDGES, -180, east)
    return np.outer(lat_w, lon_w)


def region_series(cube: Cube, box: tuple, start_year: int, end_year: int) -> dict:
    """Area-weighted monthly and annual means on a fixed footprint.

    The footprint is the set of overlapping cells valid in every month of the
    window, so the series never mixes changing cell populations.
    """
    w = box_weights(*box)
    years = list(range(start_year, end_year + 1))
    m = cube.months(start_year, end_year)
    touched = w > 0
    eligible = touched & np.all(np.isfinite(m), axis=(0, 1))
    total_area = float(w.sum())
    area = float(w[eligible].sum())
    fraction = area / total_area if total_area > 0 else 0.0
    cov = {
        "fraction": fraction,
        "eligibleCells": int(eligible.sum()),
        "touchedCells": int(touched.sum()),
        "threshold": COVERAGE_THRESHOLD,
        "known": True,
        "note": ("Share of the region's area covered by grid cells that have a value in "
                 "every month of the analysis window. Only those cells are averaged."),
    }
    if area == 0:
        return {"years": years, "annual": [None] * len(years), "monthly": None, "coverage": cov}
    we = np.where(eligible, w, 0.0)
    monthly = np.tensordot(np.nan_to_num(m.astype(np.float64)), we, axes=([2, 3], [0, 1])) / area
    annual = annual_from_months(years, monthly[:, :, None, None])[:, 0, 0]
    return {
        "years": years,
        "annual": [float(v) for v in annual],
        "monthly": [{"year": y, "month": mo + 1, "value": float(monthly[i, mo])}
                    for i, y in enumerate(years) for mo in range(12)],
        "coverage": cov,
    }


def annual_frames(cube: Cube, start_year: int, end_year: int) -> np.ndarray:
    """(years, lat, lon) float64 annual anomaly, NaN where any month is missing."""
    cache = cube.__dict__.setdefault("_annual_cache", {})
    key = (start_year, end_year)
    if key not in cache:
        if len(cache) >= 8:
            cache.pop(next(iter(cache)))
        years = list(range(start_year, end_year + 1))
        cache[key] = annual_from_months(years, cube.months(start_year, end_year))
    return cache[key]


def trend_field(cube: Cube, start_year: int, end_year: int) -> np.ndarray:
    """Per-cell OLS slope in degC per decade over complete years; NaN if any year is missing.

    Slope magnitude only: no per-cell significance is computed or implied.
    """
    a = annual_frames(cube, start_year, end_year)
    x = np.arange(start_year, end_year + 1, dtype=np.float64)
    xc = x - x.mean()
    slope = np.tensordot(xc, a, axes=(0, 0)) / np.sum(xc ** 2)  # NaN propagates
    return slope * 10
