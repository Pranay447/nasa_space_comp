"""GPM IMERG Final Monthly V07 regional means exported from NASA Giovanni.

The dataset is only offered when the original Giovanni CSV for every preset
region is present in data/giovanni/. Nothing is synthesised: without the
files the registry reports the dataset as unavailable, with the reason.

Unit handling: the product's `precipitation` field is a monthly mean rate in
mm/hr (confirmed in the GES DISC OPeNDAP attributes, 2026-11-15). Monthly
total (mm) = rate x hours in that calendar month; annual total = sum of 12
complete months.
"""
from __future__ import annotations

import calendar
import csv
import hashlib
import io
import json
import re
from functools import lru_cache
from pathlib import Path

DATASET_ID = "imerg-giovanni"
DIR = Path(__file__).resolve().parents[2] / "data" / "giovanni"
FILL = -9999.9

# Fixed from the build plan's pre-declared question before any trend was computed.
REGIONS = {
    "aus-north": ("Northern Australia box", 120.0, -20.0, 146.0, -11.0),
    "aus-southeast": ("Southeastern Australia box", 140.0, -39.0, 154.0, -33.0),
}


class GiovanniFormatError(ValueError):
    pass


def hours_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1] * 24


def parse_giovanni_csv(text: str, expect_bounds: tuple | None = None, units: str | None = None) -> dict:
    """Parse a Giovanni 'Time Series, Area-Averaged' CSV. Returns monthly rates in mm/hr.

    Fails unless the file states mm/hr and the IMERG V07 monthly variable, and
    (when given) its bounding box matches the preset.
    """
    meta: dict[str, str] = {}
    rows: list[tuple[int, int, float | None]] = []
    in_data = False
    for rec in csv.reader(io.StringIO(text)):
        if not rec or not any(c.strip() for c in rec):
            continue
        if not in_data:
            if rec[0].strip().lower() == "time":
                meta["column"] = rec[1].strip() if len(rec) > 1 else ""
                in_data = True
            else:
                meta[rec[0].strip().rstrip(":").lower()] = ",".join(rec[1:]).strip()
            continue
        m = re.match(r"(\d{4})-(\d{2})", rec[0].strip())
        if not m or len(rec) < 2:
            raise GiovanniFormatError(f"malformed data row: {rec}")
        v = float(rec[1])
        rows.append((int(m.group(1)), int(m.group(2)), None if abs(v - FILL) < 1e-3 or v != v else v))
    blob = " ".join(meta.values()) + " " + meta.get("column", "") + " " + " ".join(meta.keys())
    if units:  # unit recorded at export time in the sidecar; Giovanni's CSV does not carry one
        blob += " " + units
    if not rows:
        raise GiovanniFormatError("no data rows found")
    if "GPM_3IMERGM_07_precipitation" not in blob and "GPM_3IMERGM v07" not in blob:
        raise GiovanniFormatError("file does not identify GPM_3IMERGM V07 precipitation")
    if "mm/hr" not in blob:
        raise GiovanniFormatError("file does not state mm/hr; refusing to guess the unit")
    if len({(y, mo) for y, mo, _ in rows}) != len(rows):
        raise GiovanniFormatError("duplicate months")
    if expect_bounds is not None:
        box = meta.get("user bounding box", meta.get("bounding box", ""))
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", box)]
        if len(nums) < 4 or any(abs(a - b) > 1e-6 for a, b in zip(nums[:4], expect_bounds)):
            raise GiovanniFormatError(
                f"bounding box {box!r} does not match preset {expect_bounds}")
    return {"meta": meta, "rows": rows}


@lru_cache(maxsize=1)
def _load() -> dict | None:
    out = {}
    for rid, (_, w, s, e, n) in REGIONS.items():
        p = DIR / f"{rid}.csv"
        if not p.exists():
            return None
        raw = p.read_bytes()
        side = DIR / f"{rid}.meta.json"
        sidecar = json.loads(side.read_text(encoding="utf-8")) if side.exists() else {}
        if sidecar.get("sha256") not in (None, hashlib.sha256(raw).hexdigest()):
            raise GiovanniFormatError(f"{p.name} does not match the hash recorded in {side.name}")
        parsed = parse_giovanni_csv(raw.decode("utf-8-sig"), (w, s, e, n), sidecar.get("units"))
        parsed["sidecar"] = sidecar
        parsed["sha256"] = hashlib.sha256(raw).hexdigest()
        out[rid] = parsed
    return out


def region_series(region_id: str, start: int, end: int) -> dict:
    d = _load()[region_id]
    by = {(y, m): v for y, m, v in d["rows"]}
    years = list(range(start, end + 1))
    monthly, annual = [], []
    for y in years:
        vals = [None if by.get((y, m)) is None else by[(y, m)] * hours_in_month(y, m) for m in range(1, 13)]
        monthly += [{"year": y, "month": m, "value": v} for m, v in zip(range(1, 13), vals)]
        annual.append(None if any(v is None for v in vals) else float(sum(vals)))
    return {"years": years, "annual": annual, "monthly": monthly,
            "coverage": {"fraction": None, "known": False,
                         "note": "Giovanni area-averages the grid cells inside the box upstream; "
                                 "coverage is not reported in the export, so it is shown as unknown."}}


def registry_record() -> dict:
    try:
        data = _load()
        problem = None
    except GiovanniFormatError as exc:
        data, problem = None, f"A Giovanni CSV in data/giovanni/ failed validation: {exc}"
    rec = {
        "datasetId": DATASET_ID,
        "status": "available" if data else "unavailable",
        "group": "Water",
        "title": "Precipitation · annual total · Giovanni regional means",
        "shortTitle": "Rainfall · Giovanni regions",
        "productVersion": "NASA Giovanni · GPM IMERG Final Run Monthly V07 (GPM_3IMERGM) · precipitation · regional mean",
        "dataKind": "regional_export",
        "variable": "Annual precipitation total",
        "noun": "Annual rainfall",
        "unit": "mm", "rateUnit": "mm per decade", "digits": 0, "monthlyUnit": "mm per month",
        "baseline": None,
        "period": {"startYear": 2001, "endYear": 2024},
        "defaultWindow": {"startYear": 2001, "endYear": 2024},
        "resolution": "Regional mean of a 0.1° product, monthly",
        "timeResolution": "monthly",
        "source": {"name": "NASA GES DISC / Giovanni",
                   "url": "https://giovanni.gsfc.nasa.gov/giovanni/",
                   "info": "https://gpm.nasa.gov/data/imerg",
                   "doi": "10.5067/GPM/IMERG/3B-MONTH/07",
                   "citation": ("Huffman, G.J., E.F. Stocker, D.T. Bolvin, E.J. Nelkin, J. Tan (2023), GPM IMERG "
                                "Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07, GES DISC, "
                                "doi:10.5067/GPM/IMERG/3B-MONTH/07")},
        "snapshotId": ("sha256:" + ",".join(f"{k}={v['sha256'][:16]}" for k, v in data.items())) if data else "not acquired",
        "snapshotNote": "Original Giovanni CSV exports kept in data/giovanni/." if data else "",
        "supportedRegions": [{"id": rid, "label": r[0], "kind": "regional_export",
                              "bounds": {"west": r[1], "south": r[2], "east": r[3], "north": r[4]}}
                             for rid, r in REGIONS.items()],
        "customRegions": False,
        "defaultRegions": list(REGIONS),
        "availableLayers": [],
        "mapContextDataset": None,
        "hasMonthly": True,
        "aggregation": ("Area average computed by NASA Giovanni over the box. Monthly mean rate (mm/hr) × hours in "
                        "the month = monthly total (mm); annual total = sum of 12 complete months."),
        "transformations": ["mm/hr × hours in calendar month → mm per month", "Sum of 12 complete months → mm per year"],
        "marks": "Each point is one annual total for the whole box.",
        "capabilityNotes": [
            "Regional export: only the two exported boxes can be analysed; no gridded map layer or custom boxes.",
        ],
    }
    if not data:
        rec["statusReason"] = problem or (
            "Not acquired yet. NASA Giovanni and GES DISC require an Earthdata Login to download IMERG data "
            "(HTTP 401 without one, checked 2026-11-15). Sign in at giovanni.gsfc.nasa.gov, export the "
            "area-averaged time series CSV for each box (see README), and save them as "
            "data/giovanni/aus-north.csv and data/giovanni/aus-southeast.csv.")
    return rec
