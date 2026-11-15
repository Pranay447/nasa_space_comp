"""Build the app's data artifacts from pinned NASA source files.

    python scripts/build_data.py            # uses data/raw, downloads the grid if absent

Outputs: data/build/gistemp_cube.npz and data/manifest.json (with hashes).
Run scripts/build_static.py afterwards for the web app's bundled JSON.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from trend_atlas import grid  # noqa: E402
from trend_atlas.zonal import parse_zonal  # noqa: E402

GRID_URL = "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"
ZONAL_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts%2BdSST.txt"
PINNED = {
    "zonal": "e489c207215be7210d2f42141681dfd5640f049b704e7ad288b3dcc71114525b",
    "grid_gz": "f7788db9044d0f0e3f9561ad5d0fd82e59cdfdb82ea8a10244f78f2cb032a3c7",
}
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    import netCDF4 as nc

    RAW.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    gz = RAW / "gistemp1200_GHCNv4_ERSSTv5.nc.gz"
    if not gz.exists():
        print("downloading", GRID_URL)
        urllib.request.urlretrieve(GRID_URL, gz)
    gz_hash = sha(gz)
    ncp = RAW / "gistemp1200_GHCNv4_ERSSTv5.nc"
    with gzip.open(gz, "rb") as src, open(ncp, "wb") as dst:
        shutil.copyfileobj(src, dst)

    ds = nc.Dataset(ncp)
    v = ds["tempanomaly"]
    v.set_auto_maskandscale(False)
    assert v.dimensions == ("time", "lat", "lon"), v.dimensions
    fill = int(v.getncattr("_FillValue"))
    scale = float(v.getncattr("scale_factor"))
    assert fill == 32767 and abs(scale - 0.01) < 1e-9, (fill, scale)
    assert v.getncattr("units") == "K"
    lat, lon = ds["lat"][:], ds["lon"][:]
    assert np.allclose(lat, np.arange(-89, 90, 2)) and np.allclose(lon, np.arange(-179, 180, 2))
    t = ds["time"]
    dates = nc.num2date(t[:], t.units)
    assert dates[0].year == 1880 and dates[0].month == 1
    assert all(d.year == 1880 + i // 12 and d.month == i % 12 + 1 for i, d in enumerate(dates))
    raw = v[:]
    data = raw.astype(np.int16)
    data[raw == fill] = grid.MISSING
    history = ds.getncattr("history")
    ds.close()

    cube_path = BUILD / "gistemp_cube.npz"
    np.savez_compressed(cube_path, data=data, first_year=1880)

    zonal_path = ROOT / "NASA_GISTEMP_ZONAL_SNAPSHOT.txt"
    z = parse_zonal(zonal_path)
    z_hash = sha(zonal_path)

    manifest = {
        "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "gistemp-zonal": {
                "file": zonal_path.name, "url": ZONAL_URL, "sha256": z_hash,
                "matchesPinned": z_hash == PINNED["zonal"], "inputs": z["inputs"],
                "years": [z["years"][0], z["years"][-1]], "rows": len(z["years"]),
            },
            "gistemp-grid": {
                "file": f"data/raw/{gz.name}", "url": GRID_URL, "sha256": gz_hash,
                "matchesPinned": gz_hash == PINNED["grid_gz"], "history": history,
                "firstMonth": "1880-01", "lastMonth": f"{dates[-1].year}-{dates[-1].month:02d}",
                "months": int(data.shape[0]), "shape": list(data.shape),
                "missingFraction": float((data == grid.MISSING).mean()),
                "storedUnits": "K (anomaly); numerically equal to degC differences",
                "scaleFactor": scale, "fillValue": fill,
            },
        },
        "artifacts": {"data/build/gistemp_cube.npz": sha(cube_path)},
    }
    (ROOT / "data" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))
    if not (manifest["sources"]["gistemp-zonal"]["matchesPinned"]
            and manifest["sources"]["gistemp-grid"]["matchesPinned"]):
        print("NOTE: a source hash differs from the pinned value; NASA may have revised it.")


if __name__ == "__main__":
    main()
