"""HTTP API for the planning workbench.

Run:    python -m uvicorn backend.api:app --port 8010
Docs:   http://127.0.0.1:8010/docs

Endpoints
  GET  /api/health          solver and sample-data status
  GET  /api/sample          metadata of the bundled dataset
  GET  /api/sample.csv      the bundled dataset (download)
  GET  /api/specification   the mid-review PDF (download)
  POST /api/inspect         read an uploaded CSV: columns, rows, detected mapping
  POST /api/runs            run Model 1 (PuLP/CBC LP), Model 2 (0/1 IP), Q1-Q4 and checks; returns one JSON document
  POST /api/export          the same run as an Excel workbook (.xlsx)

Stateless: every run request carries its configuration (JSON string) and, optionally,
the CSV. The bundled sample is used when no file is sent.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import engine, workbook
from .solvers import SolverUnavailable, get_backend

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "data" / "online_advertising_performance_data.csv"
SPEC = ROOT / "data" / "or_project_mid_review.pdf"
DIST = ROOT / "frontend" / "dist"
MAX_BYTES = 15 * 1024 * 1024

app = FastAPI(title="Ad-Space Aggregate Planning API", version="3.0.0")


async def _read_upload(file: UploadFile | None) -> tuple[bytes, str]:
    if file is None:
        return SAMPLE.read_bytes(), SAMPLE.name
    name = Path(file.filename or "upload.csv").name
    if not name.lower().endswith(".csv"):
        raise HTTPException(422, "Upload a .csv file.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 15 MB.")
    return data, name


def _parse_config(raw: str) -> dict:
    try:
        cfg = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(422, "Configuration must be valid JSON.") from exc
    if not isinstance(cfg, dict):
        raise HTTPException(422, "Configuration must be a JSON object.")
    return cfg


def _run(raw: bytes, cfg: dict, name: str):
    try:
        return engine.run_all(raw, cfg, name)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SolverUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/api/health")
def health():
    try:
        solver, ready = get_backend().label(), True
    except SolverUnavailable as exc:
        solver, ready = str(exc), False
    return {"status": "ok" if ready else "solver unavailable", "solver": solver,
            "sample_available": SAMPLE.exists()}


@app.get("/api/sample")
def sample():
    raw = SAMPLE.read_bytes()
    info = engine.inspect_upload(raw)
    return {"filename": SAMPLE.name, "columns": info["columns"], "rows": info["rows"],
            "mapping": info["mapping"], "default_config": engine.DEFAULT_CONFIG}


@app.get("/api/sample.csv")
def sample_csv():
    return FileResponse(SAMPLE, filename=SAMPLE.name, media_type="text/csv")


@app.get("/api/specification")
def specification():
    if not SPEC.exists():
        raise HTTPException(404, "Specification document not found.")
    return FileResponse(SPEC, filename=SPEC.name, media_type="application/pdf")


@app.post("/api/inspect")
async def inspect(file: UploadFile = File(...)):
    raw, _ = await _read_upload(file)
    try:
        return engine.inspect_upload(raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/runs")
@app.post("/api/optimize")
@app.post("/api/analyze")
async def create_run(config: str = Form("{}"), file: UploadFile | None = File(None)):
    raw, name = await _read_upload(file)
    return _run(raw, _parse_config(config), name)


@app.post("/api/export")
async def export(config: str = Form("{}"), file: UploadFile | None = File(None)):
    raw, name = await _read_upload(file)
    result = _run(raw, _parse_config(config), name)
    try:
        content = workbook.build_workbook(result)
    except (ValueError, TypeError) as exc:
        raise HTTPException(500, f"Could not build the workbook: {exc}") from exc
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="adspace-results-{result["id"]}.xlsx"'},
    )


if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/")
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str = ""):
        target = DIST / full_path if full_path else DIST / "index.html"
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(
            DIST / "index.html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
