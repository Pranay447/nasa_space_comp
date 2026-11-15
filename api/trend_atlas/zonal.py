"""Strict parser for the published GISS zonal annual table (ZonAnn.Ts+dSST.txt)."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

# Column order of the published table, with the latitude bounds of each band.
BANDS = [
    ("Glob", "Global", -90, 90), ("NHem", "Northern Hemisphere", 0, 90),
    ("SHem", "Southern Hemisphere", -90, 0),
    ("24N-90N", "Northern extratropics", 24, 90), ("24S-24N", "Tropics", -24, 24),
    ("90S-24S", "Southern extratropics", -90, -24),
    ("64N-90N", "Arctic", 64, 90), ("44N-64N", "Northern mid-high latitudes", 44, 64),
    ("24N-44N", "Northern subtropics", 24, 44), ("EQU-24N", "Northern tropics", 0, 24),
    ("24S-EQU", "Southern tropics", -24, 0), ("44S-24S", "Southern subtropics", -44, -24),
    ("64S-44S", "Southern mid-high latitudes", -64, -44), ("90S-64S", "Antarctic", -90, -64),
]
# The table prints its two header lines in either order, so the line starting
# with "Year" carries either the lower or the upper bound of each band.
EXPECTED_HEADERS = (
    ["Year", "Glob", "NHem", "SHem", "-90N", "-24N", "-24S", "-90N", "-64N", "-44N",
     "-24N", "-EQU", "-24S", "-44S", "-64S", "Year"],
    ["Year", "Glob", "NHem", "SHem", "24N", "24S", "90S", "64N", "44N", "24N", "EQU",
     "24S", "44S", "64S", "90S", "Year"],
)


class ZonalTableError(ValueError):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parse_zonal(path: Path) -> dict:
    """Return {'years': [...], 'series': {band_id: [degC | None, ...]}, 'inputs': str}.

    Values are hundredths of a degree C in the file and are divided by 100.
    Fails on duplicate years, a changed header, or malformed rows.
    """
    text = Path(path).read_text(encoding="ascii")
    rows: dict[int, list] = {}
    headers = 0
    inputs = None
    for ln, line in enumerate(text.splitlines(), 1):
        tok = line.split()
        if not tok:
            continue
        if "sources:" in line:
            inputs = line.split("sources:")[1].strip()
        if tok[0] == "Year":
            if tok not in EXPECTED_HEADERS:
                raise ZonalTableError(f"line {ln}: unexpected header {tok}")
            headers += 1
            continue
        if not re.fullmatch(r"\d{4}", tok[0]):
            continue  # title, notes and the second header line
        if len(tok) != 16:
            raise ZonalTableError(f"line {ln}: expected 16 columns, got {len(tok)}")
        if tok[-1] != tok[0]:
            raise ZonalTableError(f"line {ln}: trailing year {tok[-1]} != {tok[0]}")
        year = int(tok[0])
        if year in rows:
            raise ZonalTableError(f"line {ln}: duplicate year {year}")
        vals = []
        for t in tok[1:-1]:
            if set(t) == {"*"}:
                vals.append(None)
            elif re.fullmatch(r"-?\d+", t):
                vals.append(int(t) / 100)
            else:
                raise ZonalTableError(f"line {ln}: malformed value {t!r}")
        rows[year] = vals
    if headers == 0 or not rows:
        raise ZonalTableError("no header or data rows found")
    years = sorted(rows)
    if years != list(range(years[0], years[-1] + 1)):
        raise ZonalTableError("years are not contiguous")
    return {
        "years": years,
        "series": {b[0]: [rows[y][i] for y in years] for i, b in enumerate(BANDS)},
        "inputs": inputs,
    }
