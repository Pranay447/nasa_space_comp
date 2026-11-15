"""Dataset registry and the single analysis entry point used by API, CSV and CLI."""
from __future__ import annotations

import csv
import io
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from . import grid, precip
from .inference import METHOD, METHOD_VERSION, fit_trend, statement
from .zonal import BANDS, parse_zonal, sha256

ROOT = Path(__file__).resolve().parents[2]
ZONAL_PATH = ROOT / "NASA_GISTEMP_ZONAL_SNAPSHOT.txt"
CUBE_PATH = ROOT / "data" / "build" / "gistemp_cube.npz"
MANIFEST_PATH = ROOT / "data" / "manifest.json"

GRID_REGIONS = [
    ("arctic-box", "Arctic (64°N–90°N)", -180, 64, 180, 90),
    ("antarctic-box", "Antarctic (64°S–90°S)", -180, -90, 180, -64),
    ("s-subtropics-box", "Southern subtropics (24°S–44°S)", -180, -44, 180, -24),
    ("aus-north", "Northern Australia box", 120, -20, 146, -11),
    ("aus-southeast", "Southeastern Australia box", 140, -39, 154, -33),
    ("europe", "Europe box", -10, 36, 40, 70),
    ("amazon", "Amazon basin box", -75, -15, -50, 5),
    ("sahel", "Sahel box", -17, 10, 38, 20),
    ("nino34", "Niño 3.4 box (tropical Pacific)", -170, -5, -120, 5),
    ("central-pacific", "Central Pacific box (crosses 180°)", 160, -15, -150, 15),
    ("wisconsin", "Wisconsin bounding box", -92.9, 42.5, -86.8, 47.1),
]


class RequestError(ValueError):
    pass


@lru_cache(maxsize=1)
def manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else {"sources": {}}


@lru_cache(maxsize=1)
def zonal() -> dict:
    return parse_zonal(ZONAL_PATH)


@lru_cache(maxsize=1)
def cube() -> grid.Cube:
    return grid.Cube(CUBE_PATH)


def _lat(v: float) -> str:
    return "Equator" if v == 0 else f"{abs(v):g}°{'N' if v > 0 else 'S'}"


def _band_label(b) -> str:
    return "Global" if b[0] == "Glob" else f"{b[1]} ({_lat(b[2])}–{_lat(b[3])})"


def _region(rid, label, w, s, e, n, kind):
    return {"id": rid, "label": label, "kind": kind,
            "bounds": {"west": w, "south": s, "east": e, "north": n}}


@lru_cache(maxsize=1)
def registry() -> list[dict]:
    z = zonal()
    c = cube()
    src = manifest().get("sources", {})
    out = [
        {
            "datasetId": "gistemp-zonal",
            "status": "available",
            "group": "Atmosphere",
            "title": "Surface temperature anomaly · published latitude bands",
            "shortTitle": "Temperature · latitude bands",
            "productVersion": "NASA GISS GISTEMP v4 · Land–Ocean Temperature Index · zonal annual means",
            "dataKind": "published_regional_series",
            "variable": "Surface temperature anomaly",
            "noun": "Surface temperature",
            "unit": "°C", "rateUnit": "°C per decade", "digits": 2,
            "baseline": "1951–1980",
            "period": {"startYear": z["years"][0], "endYear": z["years"][-1]},
            "defaultWindow": {"startYear": 2001, "endYear": 2024},
            "resolution": "Latitude-band means, annual",
            "timeResolution": "annual",
            "source": {"name": "NASA GISS",
                       "url": "https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts%2BdSST.txt",
                       "info": "https://data.giss.nasa.gov/gistemp/data_v4.html",
                       "citation": ("GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), "
                                    "version 4. NASA Goddard Institute for Space Studies.")},
            "snapshotId": "sha256:" + sha256(ZONAL_PATH),
            "snapshotNote": f"Table inputs: {z['inputs']}",
            "supportedRegions": [_region("zonal:" + b[0], _band_label(b), -180, b[2], 180, b[3], "published_band")
                                 for b in BANDS],
            "customRegions": False,
            "defaultRegions": ["zonal:64N-90N", "zonal:90S-64S"],
            "availableLayers": [],
            "mapContextDataset": "gistemp-grid",
            "hasMonthly": False,
            "aggregation": "Published by NASA GISS as annual band means (land and ocean). Used as published; divided by 100 to °C.",
            "transformations": ["Hundredths of °C divided by 100", "Rows restricted to the analysis window"],
            "marks": "Each point is one published annual band mean.",
            "capabilityNotes": [
                "Only NASA's published latitude bands can be selected; custom boxes need the gridded dataset.",
                "Annual-only source: the year × month surface is unavailable.",
                "The map shows the GISTEMP 2° grid as context; band values come from the published table and can differ slightly from grid averages.",
            ],
        },
        {
            "datasetId": "gistemp-grid",
            "status": "available",
            "group": "Atmosphere",
            "title": "Surface temperature anomaly · 2° grid",
            "shortTitle": "Temperature · 2° grid",
            "productVersion": "NASA GISS GISTEMP v4 · Land–Ocean Temperature Index · 2° grid, 1200 km smoothing",
            "dataKind": "gridded_monthly",
            "variable": "Surface temperature anomaly",
            "noun": "Surface temperature",
            "unit": "°C", "rateUnit": "°C per decade", "digits": 2,
            "baseline": "1951–1980",
            "period": {"startYear": 1880, "endYear": c.last_complete_year},
            "defaultWindow": {"startYear": 2001, "endYear": 2024},
            "resolution": "2° × 2°, monthly",
            "timeResolution": "monthly",
            "source": {"name": "NASA GISS",
                       "url": "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz",
                       "info": "https://data.giss.nasa.gov/gistemp/data_v4.html",
                       "citation": ("GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), "
                                    "version 4. NASA Goddard Institute for Space Studies.")},
            "snapshotId": "sha256:" + src.get("gistemp-grid", {}).get("sha256", "unknown"),
            "snapshotNote": src.get("gistemp-grid", {}).get("history", ""),
            "supportedRegions": [_region(r[0], r[1], r[2], r[3], r[4], r[5], "box") for r in GRID_REGIONS],
            "customRegions": True,
            "defaultRegions": ["arctic-box", "antarctic-box"],
            "availableLayers": ["observed", "trend"],
            "mapContextDataset": "gistemp-grid",
            "hasMonthly": True,
            "aggregation": ("Area-weighted mean of grid cells overlapping the box (fractional overlap, "
                            "spherical cell area), using only cells valid in every month of the window. "
                            "Annual value = calendar-day-weighted mean of 12 complete months."),
            "transformations": ["int16 × 0.01 scale factor decoded; fill value 32767 kept as missing",
                                "Stored unit K anomaly, numerically equal to °C anomaly"],
            "marks": "Map cells are 2° grid values drawn without interpolation; chart points are regional annual means.",
            "capabilityNotes": [
                "NASA applies 1200 km smoothing upstream, so neighbouring cells are not independent.",
                "Trend map shows fitted slope magnitude only; it carries no per-cell significance.",
            ],
        },
        precip.registry_record(),
    ]
    return out


def dataset(dataset_id: str) -> dict:
    for d in registry():
        if d["datasetId"] == dataset_id:
            return d
    raise RequestError(f"Unknown dataset '{dataset_id}'.")


def resolve_region(ds: dict, ref: str) -> dict:
    """ref is a named region id or 'box:west,south,east,north'."""
    if ref.startswith("box:"):
        if not ds["customRegions"]:
            raise RequestError(f"{ds['shortTitle']} only supports its published regions.")
        try:
            w, s, e, n = (float(v) for v in ref[4:].split(","))
            w, s, e, n = grid.validate_box(w, s, e, n)
        except ValueError as exc:
            raise RequestError(f"Invalid box: {exc}") from exc
        ns = lambda v: f"{abs(v):g}°{'N' if v >= 0 else 'S'}"
        ew = lambda v: f"{abs(v):g}°{'E' if v >= 0 else 'W'}"
        r = _region(f"box:{w:g},{s:g},{e:g},{n:g}", f"Box {ns(s)}–{ns(n)}, {ew(w)}–{ew(e)}", w, s, e, n, "box")
        return r
    for r in ds["supportedRegions"]:
        if r["id"] == ref:
            return r
    raise RequestError(f"Region '{ref}' is not available for {ds['shortTitle']}.")


def _series(ds: dict, region: dict, start: int, end: int) -> dict:
    did = ds["datasetId"]
    if did == "gistemp-zonal":
        z = zonal()
        band = region["id"].split(":", 1)[1]
        idx = {y: i for i, y in enumerate(z["years"])}
        years = list(range(start, end + 1))
        return {"years": years, "annual": [z["series"][band][idx[y]] for y in years], "monthly": None,
                "coverage": {"fraction": None, "known": False,
                             "note": "Coverage is not published with the zonal table; reported as unknown."}}
    if did == "gistemp-grid":
        b = region["bounds"]
        return grid.region_series(cube(), (b["west"], b["south"], b["east"], b["north"]), start, end)
    if did == precip.DATASET_ID:
        return precip.region_series(region["id"], start, end)
    raise RequestError(f"Unknown dataset '{did}'.")


def _region_result(ds: dict, region: dict, start: int, end: int) -> dict:
    s = _series(ds, region, start, end)
    cov = s["coverage"]
    fit = fit_trend(s["years"], s["annual"], start, end)
    if cov.get("known") and cov["fraction"] == 0:
        fit.update({"state": "no_spatial_coverage",
                    "reason": "No grid cell in this region has a value in every month of the window."})
    elif cov.get("known") and cov["fraction"] < cov["threshold"] and fit["inferenceAvailable"]:
        fit.update({"state": "insufficient_data", "inferenceAvailable": False, "descriptiveOnly": True,
                    "ciLow": None, "ciHigh": None, "pValue": None,
                    "reason": (f"Valid cells cover {cov['fraction']:.0%} of the region, below the "
                               f"{cov['threshold']:.0%} threshold. The slope is descriptive only.")})
    scope = "per decade across this band" if region["kind"] == "published_band" else "per decade across this region"
    unit = ds["rateUnit"].replace(" per decade", "")
    return {
        "region": region,
        "annualSeries": [{"year": y, "value": v} for y, v in zip(s["years"], s["annual"])],
        "monthlySeries": s["monthly"],
        "coverage": cov,
        "fit": fit,
        "statement": statement(fit, ds["noun"], unit, scope, ds["digits"]),
    }


def _short(label: str) -> str:
    return label.split(" (")[0].replace(" box", "")


def _paired_statement(fit: dict, unit: str, digits: int, a: str, b: str) -> str:
    if fit["slopePerDecade"] is None:
        return fit.get("reason") or "No paired trend could be estimated."
    from .inference import _signed
    v = fit["slopePerDecade"]
    size = f"{abs(v):.{digits}f} {unit} per decade"
    span = f"{fit['usedStartYear']}–{fit['usedEndYear']}"
    a, b = _short(a), _short(b)
    if fit["state"] in ("supported_increase", "supported_decrease"):
        return f"The {a} rate was {size} {'higher' if v > 0 else 'lower'} than the {b} rate, {span}."
    if fit["state"] == "inconclusive":
        return (f"Estimated difference in rate, {a} minus {b}: {_signed(v, digits)} {unit} per decade, {span}. "
                "Evidence for a difference is inconclusive.")
    return f"Descriptive difference in rate, {a} minus {b}: {_signed(v, digits)} {unit} per decade, {span}. {fit['reason']}"


def analyze(dataset_id: str, start: int, end: int, a: str, b: Optional[str] = None) -> dict:
    ds = dataset(dataset_id)
    if ds["status"] != "available":
        raise RequestError(f"{ds['shortTitle']} is unavailable: {ds.get('statusReason', '')}")
    p = ds["period"]
    if not (p["startYear"] <= start <= end <= p["endYear"]):
        raise RequestError(f"Years must satisfy {p['startYear']} ≤ start ≤ end ≤ {p['endYear']} (inclusive).")
    ra = resolve_region(ds, a)
    rb = resolve_region(ds, b) if b else None
    if rb and rb["bounds"] == ra["bounds"]:
        raise RequestError("Regions A and B are the same area; choose two different regions.")
    regions = [_region_result(ds, ra, start, end)]
    paired = None
    if rb:
        regions.append(_region_result(ds, rb, start, end))
        va = {p_["year"]: p_["value"] for p_ in regions[0]["annualSeries"]}
        vb = {p_["year"]: p_["value"] for p_ in regions[1]["annualSeries"]}
        years = sorted(set(va) & set(vb))
        diff = [None if va[y] is None or vb[y] is None else va[y] - vb[y] for y in years]
        fit = fit_trend(years, diff, start, end)
        fa, fb = regions[0]["fit"], regions[1]["fit"]
        if not (fa["inferenceAvailable"] and fb["inferenceAvailable"]) and fit["inferenceAvailable"]:
            fit.update({"state": "insufficient_data", "inferenceAvailable": False, "descriptiveOnly": True,
                        "ciLow": None, "ciHigh": None, "pValue": None,
                        "reason": "Inference is unavailable for at least one region, so the paired slope is descriptive only."})
        check = (fa["slopePerDecade"] - fb["slopePerDecade"]
                 if fa["slopePerDecade"] is not None and fb["slopePerDecade"] is not None else None)
        unit = ds["rateUnit"].replace(" per decade", "")
        paired = {
            "label": "A minus B",
            "annualSeries": [{"year": y, "value": v} for y, v in zip(years, diff)],
            "fit": fit,
            "differenceOfSlopesCheck": check,
            "statement": _paired_statement(fit, unit, ds["digits"], ra["label"], rb["label"]),
        }
    dw = ds["defaultWindow"]
    is_default = (start == dw["startYear"] and end == dw["endYear"]
                  and [r["region"]["id"] for r in regions] == ds["defaultRegions"])
    return {
        "queryKey": f"{dataset_id}|{start}|{end}|{ra['id']}|{rb['id'] if rb else ''}",
        "methodVersion": METHOD_VERSION,
        "method": METHOD,
        "dataset": {k: ds[k] for k in ("datasetId", "title", "shortTitle", "productVersion", "variable", "unit",
                                        "rateUnit", "digits", "baseline", "resolution", "source", "snapshotId",
                                        "snapshotNote", "aggregation", "transformations", "marks", "dataKind")},
        "request": {"datasetId": dataset_id, "startYear": start, "endYear": end,
                    "regions": [r["region"]["id"] for r in regions]},
        "exploratory": not is_default,
        "exploratoryNote": (None if is_default else
                            "User-chosen region or period: treat this analysis as exploratory."),
        "regions": regions,
        "paired": paired,
    }


def to_csv(resp: dict) -> str:
    """Evidence export. Every number comes from the same response the UI renders."""
    ds = resp["dataset"]
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")

    def meta(k, v):
        buf.write(f"# {k}: {v}\n")

    meta("Trend Atlas evidence export", resp["queryKey"])
    meta("dataset", ds["productVersion"])
    meta("source", ds["source"]["url"])
    meta("citation", ds["source"]["citation"])
    meta("snapshot", ds["snapshotId"])
    meta("unit", ds["unit"] + (f" (anomaly vs {ds['baseline']})" if ds["baseline"] else ""))
    meta("aggregation", ds["aggregation"])
    meta("method", f"{resp['method']['model']}; {resp['method']['covariance']}; primary maxlags={resp['method']['primaryMaxLags']}; {resp['methodVersion']}")
    meta("interval", resp["method"]["intervalMeaning"])
    if resp["exploratory"]:
        meta("note", resp["exploratoryNote"])
    items = [("A", r) for r in resp["regions"][:1]] + [("B", r) for r in resp["regions"][1:]]
    for tag, r in items:
        b = r["region"]["bounds"]
        cov = r["coverage"]
        meta(f"region {tag}", f"{r['region']['label']} [west {b['west']}, south {b['south']}, east {b['east']}, north {b['north']}]")
        meta(f"coverage {tag}", "unknown" if cov["fraction"] is None else f"{cov['fraction']:.4f}")
    w.writerow(["section", "series", "year", "month", "value", "unit"])
    for tag, r in items:
        for p in r["annualSeries"]:
            w.writerow(["annual", tag, p["year"], "", "" if p["value"] is None else repr(p["value"]), ds["unit"]])
    if resp["paired"]:
        for p in resp["paired"]["annualSeries"]:
            w.writerow(["annual", "A-B", p["year"], "", "" if p["value"] is None else repr(p["value"]), ds["unit"]])
    for tag, r in items:
        for p in (r["monthlySeries"] or []):
            w.writerow(["monthly", tag, p["year"], p["month"], "" if p["value"] is None else repr(p["value"]),
                        ds.get("monthlyUnit", ds["unit"])])
    buf.write("\n")
    w.writerow(["section", "series", "state", "n", "used_start", "used_end", "slope_per_decade", "ci95_low",
                "ci95_high", "p_value", "hac_maxlags", "residual_lag1_autocorr", "sensitive_to_method", "statement"])
    fits = [(t, r["fit"], r["statement"]) for t, r in items]
    if resp["paired"]:
        fits.append(("A-B", resp["paired"]["fit"], resp["paired"]["statement"]))
    g = lambda v: "" if v is None else repr(v)
    for tag, f, st in fits:
        w.writerow(["fit", tag, f["state"], f["n"], g(f["usedStartYear"]), g(f["usedEndYear"]), g(f["slopePerDecade"]),
                    g(f["ciLow"]), g(f["ciHigh"]), g(f["pValue"]), resp["method"]["primaryMaxLags"],
                    g(f["residualLag1Autocorrelation"]), g(f["sensitiveToMethod"]), st])
        for s in (f["sensitivity"] or []):
            w.writerow(["sensitivity", tag, s["state"], f["n"], "", "", repr(s["slopePerDecade"]), repr(s["ciLow"]),
                        repr(s["ciHigh"]), repr(s["pValue"]), s["maxLags"], "", "", ""])
    if resp["paired"] and resp["paired"]["differenceOfSlopesCheck"] is not None:
        buf.write(f"# cross-check slope(A) - slope(B): {resp['paired']['differenceOfSlopesCheck']!r}\n")
    return buf.getvalue()
