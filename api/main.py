"""Trend Atlas API. Serves analysis results, grid frames and the built web app.

    uvicorn main:app --app-dir api --port 8000
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from trend_atlas import grid, service

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "web" / "dist"
MAX_FRAME_YEARS = 80

app = FastAPI(title="Trend Atlas API", version=service.METHOD_VERSION)
app.add_middleware(GZipMiddleware, minimum_size=1024)


def _bad(exc: Exception):
    raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/health")
def health():
    return {"ok": True, "methodVersion": service.METHOD_VERSION}


@app.get("/api/datasets")
def datasets():
    return {"datasets": service.registry(), "manifest": service.manifest()}


@app.get("/api/analysis")
def analysis(dataset: str, start: int, end: int, a: str, b: Optional[str] = None):
    try:
        return service.analyze(dataset, start, end, a, b or None)
    except service.RequestError as exc:
        _bad(exc)


@app.get("/api/analysis.csv")
def analysis_csv(dataset: str, start: int, end: int, a: str, b: Optional[str] = None):
    try:
        resp = service.analyze(dataset, start, end, a, b or None)
    except service.RequestError as exc:
        _bad(exc)
    name = f"trend-atlas_{dataset}_{start}-{end}.csv"
    return PlainTextResponse(service.to_csv(resp), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _window(start: int, end: int):
    c = service.cube()
    if not (1880 <= start <= end <= c.last_complete_year):
        _bad(ValueError(f"Years must satisfy 1880 ≤ start ≤ end ≤ {c.last_complete_year}."))
    if end - start + 1 > MAX_FRAME_YEARS:
        _bad(ValueError(f"Map frames are limited to {MAX_FRAME_YEARS} years per request."))
    return c


@app.get("/api/grid/annual")
def grid_annual(start: int = Query(...), end: int = Query(...)):
    """int16 little-endian, (years, 90 lat south→north, 180 lon west→east), hundredths of °C, -32768 = no data."""
    c = _window(start, end)
    a = grid.annual_frames(c, start, end)
    out = np.where(np.isnan(a), grid.MISSING, np.round(np.nan_to_num(a) * 100)).astype("<i2")
    return Response(out.tobytes(), media_type="application/octet-stream",
                    headers={"X-Grid-Shape": f"{a.shape[0]},{grid.NLAT},{grid.NLON}", "Cache-Control": "max-age=3600"})


@app.get("/api/grid/trend")
def grid_trend(start: int = Query(...), end: int = Query(...)):
    """int16 little-endian (90, 180), thousandths of °C per decade, -32768 = no data. Slope magnitude only."""
    c = _window(start, end)
    if end - start + 1 < 3:
        _bad(ValueError("A trend map needs at least 3 years."))
    t = grid.trend_field(c, start, end)
    out = np.where(np.isnan(t), grid.MISSING, np.round(np.nan_to_num(t) * 1000)).astype("<i2")
    return Response(out.tobytes(), media_type="application/octet-stream", headers={"Cache-Control": "max-age=3600"})


if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
