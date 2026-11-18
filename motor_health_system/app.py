"""
app.py - backend API for the DC-motor health model.

Start:   uvicorn app:app --host 0.0.0.0 --port 8000
Docs:    http://localhost:8000/docs      (interactive, auto-generated)

Dashboard -> POST /predict  with a window of MPU6050 readings
          <- JSON health report (status, score, reasons, recommendation)
"""
import json
import os
from pathlib import Path
from typing import Any, Literal, Optional

import joblib
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import health_engine as he

ROOT = Path(__file__).parent
MODEL_DIR = ROOT / "model"
API_KEY = os.getenv("MOTOR_API_KEY")                      # optional shared secret
ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")       # e.g. "http://localhost:3000"

app = FastAPI(title="DC Motor Health API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

bundle: dict[str, Any] = {}


def load_model() -> None:
    global bundle
    bundle = joblib.load(MODEL_DIR / "motor_health_model.joblib")
    cfg = MODEL_DIR / "config.json"
    if cfg.exists():                                      # editable thresholds, no retraining
        bundle["policy"].update(json.loads(cfg.read_text()).get("policy", {}))


load_model()


def check_key(x_api_key: Optional[str] = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(401, "Invalid or missing X-API-Key header")


class PredictRequest(BaseModel):
    samples: list[dict[str, float]] = Field(
        ..., description=f"At least {he.MIN_SAMPLES} readings (50+ recommended). Keys: "
                         "ax,ay,az,gx,gy,gz,temp (or Acel_X..,Giro_X..,Temperatura).")
    load: Literal["NO_LOAD", "ON_LOAD"] = Field("NO_LOAD", description="Load condition selected on the dashboard")
    speed_level: Optional[int] = Field(None, ge=0, le=3,
                                       description="Speed selected on the dashboard: 0=OFF 1=LOW 2=MEDIUM 3=HIGH")
    accel_unit: Literal["m/s2", "g"] = "m/s2"
    sample_rate_hz: Optional[float] = Field(None, gt=0, description="Enables heating-rate (°C/min) check")


@app.get("/")
def root():
    return {"service": "DC Motor Health API", "docs": "/docs", "endpoints": ["/predict", "/health", "/model-info"]}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": bool(bundle)}


@app.get("/model-info")
def model_info():
    m = MODEL_DIR / "metrics.json"
    return {
        "speed_classes": he.SPEED_NAMES, "health_levels": he.HEALTH_LEVELS,
        "window_samples": he.WINDOW, "min_samples": he.MIN_SAMPLES,
        "policy": bundle["policy"], "baselines": bundle["baselines"],
        "metrics": json.loads(m.read_text()) if m.exists() else None,
    }


@app.post("/predict", dependencies=[Depends(check_key)])
def predict(req: PredictRequest):
    try:
        return he.analyse(req.samples, bundle, load=req.load, speed_level=req.speed_level,
                          accel_unit=req.accel_unit, sample_rate_hz=req.sample_rate_hz)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/reload", dependencies=[Depends(check_key)])
def reload_config():
    """Re-read model/ + config.json after you edit thresholds or retrain."""
    load_model()
    return {"reloaded": True}
