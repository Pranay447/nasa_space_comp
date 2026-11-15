"""Write the homepage and the pinned data used by static web deployments.

    python scripts/build_static.py
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path
from scipy.stats import t

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from trend_atlas import service  # noqa: E402

OUT = ROOT / "web" / "public" / "data"
START, END = 2001, 2024
HERO = [("arctic", "zonal:64N-90N"), ("antarctic", "zonal:90S-64S"), ("s-subtropics", "zonal:44S-24S")]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    hero = {"startYear": START, "endYear": END, "scenes": {}}
    for sid, ref in HERO:
        r = service.analyze("gistemp-zonal", START, END, ref)
        reg = r["regions"][0]
        hero["scenes"][sid] = {
            "regionId": ref, "label": reg["region"]["label"], "bounds": reg["region"]["bounds"],
            "annualSeries": reg["annualSeries"], "fit": reg["fit"], "statement": reg["statement"],
        }
    ds = service.dataset("gistemp-zonal")
    hero["dataset"] = {k: ds[k] for k in ("productVersion", "unit", "rateUnit", "baseline", "snapshotId", "source")}
    (OUT / "hero.json").write_text(json.dumps(hero), encoding="utf-8")
    registry = service.registry()
    (OUT / "datasets.json").write_text(json.dumps({"datasets": registry}), encoding="utf-8")

    # Keep browser downloads bounded by splitting the original grid into decade chunks.
    # Only complete calendar years can be requested by the analysis API.
    cube = service.cube()
    chunk_years = 10
    base = OUT / "snapshot"
    base.mkdir(exist_ok=True)
    series = {}
    for d in registry:
        if d["status"] != "available" or d["customRegions"]:
            continue
        limits = d["period"]
        series[d["datasetId"]] = {
            r["id"]: service._series(d, r, limits["startYear"], limits["endYear"])
            for r in d["supportedRegions"]
        }
    critical = {n - 2: float(t.ppf(1 - service.METHOD["alpha"] / 2, n - 2))
                for n in range(20, cube.last_complete_year - cube.first_year + 2)}
    metadata = {"method": service.METHOD, "critical": critical, "series": series, "grid": {
        "start": cube.first_year, "end": cube.last_complete_year, "chunkYears": chunk_years,
    }}
    (base / "index.json").write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
    for start in range(cube.first_year, cube.last_complete_year + 1, chunk_years):
        offset = (start - cube.first_year) * 12
        count = 12 * min(chunk_years, cube.last_complete_year - start + 1)
        data = cube.data[offset:offset + count].astype("<i2", copy=False)
        (base / f"{start}.bin.gz").write_bytes(gzip.compress(data.tobytes(), compresslevel=6, mtime=0))
    print("wrote", [p.name for p in OUT.iterdir()])


if __name__ == "__main__":
    main()
