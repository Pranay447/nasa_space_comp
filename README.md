# Trend Atlas

Trend Atlas is a NASA Space Apps 2026 entry for the "Be An Earth System Trend Detective!" challenge. It lets you pick a region (or two), a year window and a NASA dataset, then reports a linear trend per decade with a 95% interval, an evidence classification, and a paired comparison between two regions. The analysis runs in a FastAPI service (`api/`) built on pinned NASA GISS GISTEMP v4 files. A React/Vite front end (`web/`) shows it on a globe or a Mercator map.

## The first result

Polar case: NASA GISS GISTEMP v4 published zonal annual means, 2001–2024 (24 annual observations).

| Series | Trend (°C/decade) | 95% interval | 2024 value | Classification |
|---|---|---|---|---|
| Arctic band 64°N–90°N | +0.673 | +0.471 to +0.875 | +2.88 °C | supported increase |
| Antarctic band 64°S–90°S | +0.084 | −0.078 to +0.246 | +0.71 °C | inconclusive |
| Paired A − B (yearly difference) | +0.589 | +0.382 to +0.796 | n/a | supported increase |

The paired slope equals slope(A) − slope(B) = 0.589. The evidence classification is the same at HAC lags 1, 2 and 3 for all three series.

What this says: over 2001–2024 the Arctic band warmed at a higher rate than the Antarctic band. The Antarctic point estimate is positive, but its interval crosses zero, so this window does not establish a trend there. The paired interval excludes zero, so the data support the comparison: the Arctic band's trend was larger. These intervals come from the regression model. They do not carry NASA's own observational uncertainty in the temperature estimates. A shorter window such as 2015–2024 (10 years) gives a descriptive slope only, because inference needs at least 20 contiguous years.

Independent cross-check from the gridded product (area-weighted, fixed footprint), 2001–2024:

| Box | 2024 value | Trend (°C/decade) | 95% interval | Coverage |
|---|---|---|---|---|
| Arctic | +2.83 °C | +0.656 | 0.464 to 0.848 | 100% |
| Antarctic | +0.66 °C | +0.098 | −0.047 to 0.243 | 89% |

These differ slightly from the published table. The GISS FAQ explains that tables and maps can differ in this way.

## Run it

On Windows, from the repo root:

```
python -m venv .venv
.venv/Scripts/python -m pip install numpy scipy pandas xarray netCDF4 statsmodels fastapi "uvicorn[standard]" pytest httpx

.venv/Scripts/python scripts/build_data.py     # downloads the grid if absent; writes data/build/gistemp_cube.npz and data/manifest.json
.venv/Scripts/python scripts/build_static.py   # regenerates bundled browser data from the pinned NASA sources

npm --prefix web install
npm --prefix web run build

.venv/Scripts/python -m uvicorn main:app --app-dir api --port 8000
```

Then open http://127.0.0.1:8000. The API serves the built app (`web/dist`) from the same origin.

For a static deployment, run `npm --prefix web run build` and publish the full contents of `web/dist`, including `data/snapshot`. Configure SPA navigation so `/atlas` serves `index.html`. If the Python API is absent, the browser uses the bundled NASA files for custom regions, paired trends, map layers and evidence exports. The bundled grid loads by decade from the same origin.

For development, run `npm --prefix web run dev` as well and open http://localhost:5173, which proxies `/api` to port 8000. Both servers are also defined in `.claude/launch.json` (`api` and `web`).

Tests: `.venv/Scripts/python -m pytest api/tests -q` (34 passed).

## Reproduce the numbers

From the repo root, after `build_data.py`:

```python
import sys
sys.path.insert(0, 'api')
from trend_atlas.service import analyze

r = analyze('gistemp-zonal', 2001, 2024, 'zonal:64N-90N', 'zonal:90S-64S')
rows = [(x['region']['label'], x['fit']) for x in r['regions']] + [('A minus B', r['paired']['fit'])]
for label, f in rows:
    print(f"{label:28s} {f['slopePerDecade']:+.3f} C/decade  95% [{f['ciLow']:+.3f}, {f['ciHigh']:+.3f}]  {f['state']}")
```

Output:

```
Arctic band (64N-90N)        +0.673 C/decade  95% [+0.471, +0.875]  supported_increase
Antarctic band (90S-64S)     +0.084 C/decade  95% [-0.078, +0.246]  inconclusive
A minus B                    +0.589 C/decade  95% [+0.382, +0.796]  supported_increase
```

The same analysis is available as CSV from the running API:
`http://127.0.0.1:8000/api/analysis.csv?dataset=gistemp-zonal&start=2001&end=2024&a=zonal:64N-90N&b=zonal:90S-64S`

## Data and provenance

| UI element | Source | Transformation |
|---|---|---|
| Band trend, interval, series (`gistemp-zonal`) | GISS GISTEMP v4 zonal annual means, `ZonAnn.Ts+dSST.txt`, saved as `NASA_GISTEMP_ZONAL_SNAPSHOT.txt` (SHA-256 `e489c207…525b`; table inputs through 10/2026; rows 1880–2025; hundredths of °C; baseline 1951–1980) | Parsed (`api/trend_atlas/zonal.py`), divided by 100, OLS + HAC fit (`inference.py`) |
| Map frames, trend layer, custom boxes | GISS `gistemp1200_GHCNv4_ERSSTv5.nc.gz` (SHA-256 `f7788db9…2a3c7`; 1762 months, 1880-01 to 2026-10; 90×180 cells at 2°; int16, scale_factor 0.01, _FillValue 32767; stored unit K anomaly, numerically equal to °C anomaly; 10.8% of cell-months missing) | Cached as `data/build/gistemp_cube.npz`. Day-weighted annual means and area-weighted box averages with fixed footprint and coverage reporting (`grid.py`) |
| Rainfall chart, rate and paired test | NASA Giovanni area-averaged export of GPM IMERG Final Monthly V07, doi:10.5067/GPM/IMERG/3B-MONTH/07 | mm/hr x hours in month, summed over complete years (see below) |
| Homepage and static analysis | Outputs of the above | `scripts/build_static.py` → `web/public/data/` |
| Homepage photos | NASA Earth Observatory pages (see THIRD_PARTY_NOTICES.md) | Local `.webp` copies in `web/public/scenes/` |
| Coastlines | Natural Earth via `world-atlas` | TopoJSON → GeoJSON |

`scripts/build_data.py` checks both files against the pinned hashes and records them in `data/manifest.json`.

## Method

- Annual values for the selected window. Inference needs at least 20 contiguous complete years. A shorter or gappy window gives a descriptive slope only.
- OLS on centred years, with HAC standard errors (Bartlett kernel, maxlags 2, small-sample correction) and a t distribution. Implemented with statsmodels 0.15.0.
- Classification from the 95% interval: an interval entirely above zero is a supported increase, one entirely below zero is a supported decrease, and one that crosses zero is inconclusive. A sensitivity check refits at HAC lags 1, 2 and 3 and flags the result if the classification changes.
- Paired comparison: the same fit applied to the yearly difference A − B. The difference-of-slopes identity is checked.
- Intervals are model-based. They do not propagate NASA's observational uncertainty.

## Architecture

- `api/`: FastAPI app (`main.py`) with `/api/health`, `/api/datasets`, `/api/analysis`, `/api/analysis.csv`, `/api/grid/annual` and `/api/grid/trend`. It also serves `web/dist` when that exists. The logic is in `api/trend_atlas/` (`zonal`, `grid`, `inference`, `precip`, `service`), and the pytest suite is in `api/tests/`.
- `scripts/`: `build_data.py` (fetch, verify, cache) and `build_static.py` (homepage data and browser analysis snapshot).
- `web/`: React + Vite + TypeScript app (MapLibre GL, ECharts, zustand).
- `data/`: `manifest.json` (committed), plus `raw/` and `build/` (gitignored). `giovanni/` holds the rainfall CSVs once they are exported.

## Shareable URL keys

The atlas state is stored in the query string (`web/src/lib/store.ts`):

| Key | Meaning |
|---|---|
| `d` | dataset id (e.g. `gistemp-zonal`) |
| `a` | region A id |
| `b` | region B id (empty means no comparison) |
| `y0`, `y1` | start and end year |
| `f` | frame year shown on the map (clamped to the window) |
| `p` | projection: `globe` or `mercator` |
| `m` | mode: `explore` or `analyze` |
| `l` | layer: `observed` or `trend` |

Example: `/atlas?d=gistemp-zonal&a=zonal:64N-90N&b=zonal:90S-64S&y0=2001&y1=2024&f=2024`

## Rainfall dataset: NASA Giovanni, GPM IMERG Final Monthly V07

Acquired on 2026-11-15 from NASA Giovanni v4.40 ("Time Series, Area-Averaged") in a signed-in Earthdata session, product `GPM_3IMERGM_07_precipitation` (doi:10.5067/GPM/IMERG/3B-MONTH/07), 2001-01 to 2024-12, 288 monthly values per region. Giovanni and GES DISC return HTTP 401 for these downloads without an Earthdata Login.

| Region | Box (W, S, E, N) | Original file | SHA-256 |
| --- | --- | --- | --- |
| Northern Australia box | 120, -20, 146, -11 | `data/giovanni/aus-north.csv` | `1f14a6bb326c7771de5d00f2d1b2d3308e715eb45a7514dc49b9d9bac69607cc` |
| Southeastern Australia box | 140, -39, 154, -33 | `data/giovanni/aus-southeast.csv` | `e0055d6788745a6f4556c6e9d66a178c258639fdfae53b8a0e3058e4317cb4fc` |

The CSVs are stored exactly as served; each has a `.meta.json` sidecar with the query, unit and hash. The CSV does not state a unit: mm/hr comes from the Giovanni result title for the same job and from the GES DISC OPeNDAP attribute of the `precipitation` field. `api/trend_atlas/precip.py` checks the product id, bounding box and sidecar hash, converts mm/hr x hours in the calendar month to mm per month, and sums 12 complete months to an annual total. Giovanni does the area averaging upstream, so coverage is reported as unknown.

The two regions were fixed from the build plan's pre-declared question (northern versus southeastern Australia) before any trend was computed. Result for annual totals, 2001-2024, same method as the temperature case:

| | Change in annual total (mm per decade) | 95% model-based interval | Reading |
| --- | --- | --- | --- |
| Northern Australia box | -2 | -103 to +98 | Inconclusive |
| Southeastern Australia box | +86 | -2 to +174 | Inconclusive at the declared lag 2; flagged "sensitive to method" because lag 3 excludes zero |
| North minus southeast, paired | -89 | -216 to +39 | Inconclusive |

Open this investigation at `/atlas?d=imerg-giovanni&a=aus-north&b=aus-southeast&y0=2001&y1=2024`. It is a regional export, so there is no gridded rainfall map layer and no custom boxes for this dataset.

Whether this satisfies the Space Apps "challenge-listed NASA resource" rule still needs a human check against the challenge's live Resources tab; that check has not been done.

## Status and known gaps

- No Playwright end-to-end suite and no axe accessibility run yet.
- Contour isolines are not implemented.
- No hosted deployment.
- Rainfall is a two-region Giovanni export only: no gridded rainfall layer, no custom rainfall regions.
- The challenge Resources tab has not been checked to confirm the listed-resource rule.
- The Wisconsin AOD case is not built.
- Signup is a UI-only preview with no auth provider.

## AI use disclosure

The application code, tests and this documentation were written with Claude (Anthropic). Claude Fable 5.2 was the lead, and Claude Opus 5.5 subagents handled bounded tasks: the image-credit inventory, IntervalPlot/SeriesTable, MonthSurface, the dock/signup adaptation, the pytest suite and these docs. No NASA data, imagery, audio or video was AI-generated. The design reference screenshots in `design-references/` are working references only and are not app assets.

## Credits

Data citations, image credits, fonts and software licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
