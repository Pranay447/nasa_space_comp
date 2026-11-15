"""Write the bundled, precomputed results the web app uses for the homepage and
as an offline fallback: web/public/data/{hero,fallback,datasets}.json.

    python scripts/build_static.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from trend_atlas import service  # noqa: E402

OUT = ROOT / "web" / "public" / "data"
START, END = 2001, 2024
HERO = [("arctic", "zonal:64N-90N"), ("antarctic", "zonal:90S-64S"), ("s-subtropics", "zonal:44S-24S")]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    hero = {"startYear": START, "endYear": END, "scenes": {}}
    fallback = {}
    for sid, ref in HERO:
        r = service.analyze("gistemp-zonal", START, END, ref)
        fallback[r["queryKey"]] = r
        reg = r["regions"][0]
        hero["scenes"][sid] = {
            "regionId": ref, "label": reg["region"]["label"], "bounds": reg["region"]["bounds"],
            "annualSeries": reg["annualSeries"], "fit": reg["fit"], "statement": reg["statement"],
        }
    ds = service.dataset("gistemp-zonal")
    hero["dataset"] = {k: ds[k] for k in ("productVersion", "unit", "rateUnit", "baseline", "snapshotId", "source")}
    pair = service.analyze("gistemp-zonal", START, END, "zonal:64N-90N", "zonal:90S-64S")
    fallback[pair["queryKey"]] = pair
    (OUT / "hero.json").write_text(json.dumps(hero), encoding="utf-8")
    (OUT / "fallback.json").write_text(json.dumps(fallback), encoding="utf-8")
    (OUT / "datasets.json").write_text(json.dumps({"datasets": service.registry()}), encoding="utf-8")
    print("wrote", [p.name for p in OUT.iterdir()])


if __name__ == "__main__":
    main()
