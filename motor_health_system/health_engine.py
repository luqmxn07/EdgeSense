"""
health_engine.py
================
Shared logic for the DC-motor health system (used by train_model.py AND app.py,
so training and serving can never drift apart).

Two layers:

1. SPEED-STATE CLASSIFIER (machine learning, Random Forest)
   Looks at a window of MPU6050 accelerometer/gyroscope readings and decides
   whether the motor is OFF / SPEED_1_LOW / SPEED_2_MEDIUM / SPEED_3_HIGH.
   Temperature is deliberately NOT a feature (see README: it would leak the
   recording session instead of learning the motor).

2. HEALTH ASSESSMENT (baseline-deviation + Isolation Forest)
   Compares the live window against what a healthy motor looked like at that
   same speed in the training recordings, plus absolute temperature limits that
   depend on load condition (NO_LOAD / ON_LOAD). Outputs one of:
       HEALTHY  <  NORMAL  <  POTENTIAL_DAMAGE  <  UNHEALTHY
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import kurtosis

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
WINDOW = 50          # samples per analysis window
STEP = 25            # 50 % overlap when sliding
MIN_SAMPLES = 20     # smallest batch the API will accept
G = 9.80665

SPEED_NAMES = {0: "OFF", 1: "SPEED_1_LOW", 2: "SPEED_2_MEDIUM", 3: "SPEED_3_HIGH"}
HEALTH_LEVELS = ["HEALTHY", "NORMAL", "POTENTIAL_DAMAGE", "UNHEALTHY"]
HEALTH_COLORS = ["#16a34a", "#65a30d", "#f59e0b", "#dc2626"]

# dashboard / csv column aliases -> internal names
ALIASES = {
    "ax": "ax", "acel_x": "ax", "accel_x": "ax", "acc_x": "ax",
    "ay": "ay", "acel_y": "ay", "accel_y": "ay", "acc_y": "ay",
    "az": "az", "acel_z": "az", "accel_z": "az", "acc_z": "az",
    "gx": "gx", "giro_x": "gx", "gyro_x": "gx",
    "gy": "gy", "giro_y": "gy", "gyro_y": "gy",
    "gz": "gz", "giro_z": "gz", "gyro_z": "gz",
    "temp": "temp", "temperature": "temp", "temperatura": "temp", "t": "temp",
}
RAW_COLS = ["ax", "ay", "az", "gx", "gy", "gz", "temp"]

# Features fed to the speed classifier (vibration only, no temperature, no
# absolute means -> independent of sensor mounting tilt and of ambient temp).
SPEED_FEATURES = (
    [f"{c}_std" for c in ["ax", "ay", "az", "gx", "gy", "gz"]]
    + [f"{c}_p2p" for c in ["ax", "ay", "az", "gx", "gy", "gz"]]
    + ["acc_rms", "gyro_rms", "acc_peak", "acc_crest", "acc_kurt", "gyro_crest"]
)

# Default health policy. Everything here is editable in config.json after
# training (the API reads it at start-up) -> no re-training needed to tune it.
DEFAULT_POLICY: dict[str, Any] = {
    # a value ABOVE edge[i] moves the motor up to level i+1
    # edges are (HEALTHY->NORMAL, NORMAL->POTENTIAL, POTENTIAL->UNHEALTHY)
    "vibration_ratio_edges": [1.25, 1.6, 2.2],     # x healthy baseline (RMS)
    "gyro_ratio_edges": [1.25, 1.6, 2.2],
    "peak_ratio_edges": [1.4, 1.9, 2.6],           # x healthy baseline (shock peaks)
    # absolute temperature limits in deg C (assumptions - set to your motor!)
    "temp_edges": {
        "NO_LOAD": [40.0, 50.0, 65.0],
        "ON_LOAD": [50.0, 65.0, 80.0],
    },
    # on load, some extra vibration is normal -> relax the ratio edges
    "load_vibration_tolerance": {"NO_LOAD": 1.0, "ON_LOAD": 1.2},
    "heating_rate_c_per_min_edges": [1.5, 3.0, 6.0],   # needs sample_rate_hz
    "noise_floor": {"acc_rms": 0.05, "gyro_rms": 0.20, "acc_peak": 0.15},
    "pattern_anomaly_enabled": True,
}


# --------------------------------------------------------------------------- #
# Input handling
# --------------------------------------------------------------------------- #
def to_dataframe(samples: Any, accel_unit: str = "m/s2") -> pd.DataFrame:
    """Accept list[dict] | dict[str, list] | DataFrame with flexible names."""
    df = pd.DataFrame(samples)
    rename = {}
    for col in df.columns:
        key = str(col).strip().lower()
        if key in ALIASES:
            rename[col] = ALIASES[key]
    df = df.rename(columns=rename)
    missing = [c for c in RAW_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing sensor fields: {missing}. "
                         f"Need {RAW_COLS} (or Acel_X..Giro_Z, Temperatura).")
    df = df[RAW_COLS].apply(pd.to_numeric, errors="coerce")
    if df.isna().any().any():
        df = df.interpolate(limit_direction="both")
        if df.isna().any().any():
            raise ValueError("Sensor data contains non-numeric/empty values.")
    if accel_unit.lower() == "g":
        df[["ax", "ay", "az"]] *= G
    elif accel_unit.lower() not in ("m/s2", "m/s^2", "ms2"):
        raise ValueError("accel_unit must be 'm/s2' or 'g'")
    return df.reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Feature extraction
# --------------------------------------------------------------------------- #
def window_features(w: pd.DataFrame) -> dict[str, float]:
    a = w[["ax", "ay", "az"]].to_numpy(float)
    g = w[["gx", "gy", "gz"]].to_numpy(float)
    a_dev = a - a.mean(axis=0)            # remove gravity / mounting tilt
    g_dev = g - g.mean(axis=0)            # remove gyro bias
    a_mag = np.linalg.norm(a_dev, axis=1)
    g_mag = np.linalg.norm(g_dev, axis=1)

    f: dict[str, float] = {}
    for i, c in enumerate(["ax", "ay", "az"]):
        f[f"{c}_std"] = float(a_dev[:, i].std())
        f[f"{c}_p2p"] = float(np.ptp(a[:, i]))
    for i, c in enumerate(["gx", "gy", "gz"]):
        f[f"{c}_std"] = float(g_dev[:, i].std())
        f[f"{c}_p2p"] = float(np.ptp(g[:, i]))

    f["acc_rms"] = float(np.sqrt(np.mean(a_mag ** 2)))
    f["gyro_rms"] = float(np.sqrt(np.mean(g_mag ** 2)))
    f["acc_peak"] = float(a_mag.max())
    f["acc_crest"] = float(a_mag.max() / (f["acc_rms"] + 1e-9))
    f["gyro_crest"] = float(g_mag.max() / (f["gyro_rms"] + 1e-9))
    f["acc_kurt"] = float(kurtosis(a_mag)) if a_mag.std() > 1e-9 else 0.0

    t = w["temp"].to_numpy(float)
    f["temp_mean"] = float(t.mean())
    f["temp_max"] = float(t.max())
    f["temp_slope_per_sample"] = float(np.polyfit(np.arange(len(t)), t, 1)[0]) if len(t) > 2 else 0.0
    return f


def make_windows(df: pd.DataFrame, window: int = WINDOW, step: int = STEP) -> pd.DataFrame:
    rows = []
    n = len(df)
    if n < window:
        return pd.DataFrame([window_features(df)]) if n >= MIN_SAMPLES else pd.DataFrame()
    for start in range(0, n - window + 1, step):
        feats = window_features(df.iloc[start:start + window])
        feats["start"], feats["end"] = start, start + window
        rows.append(feats)
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- #
# Health policy helpers
# --------------------------------------------------------------------------- #
def level_and_index(value: float, edges: list[float]) -> tuple[int, float]:
    """level = how many edges are exceeded (0..3);  index = smooth 0..4 version."""
    level = int(sum(value > e for e in edges))
    e1, e2, e3 = edges
    xs = [0.6 * e1, e1, e2, e3, e3 + (e3 - e2)]   # 0.6*e1 or less = perfectly clean
    idx = float(np.interp(value, xs, [0, 1, 2, 3, 4]))
    return level, idx


def build_baselines(win: pd.DataFrame, labels: np.ndarray) -> dict[str, dict[str, float]]:
    """Healthy reference per speed = 95th percentile of each indicator."""
    out = {}
    for s in sorted(set(labels)):
        m = win[labels == s]
        out[str(int(s))] = {
            "acc_rms": float(np.percentile(m["acc_rms"], 95)),
            "gyro_rms": float(np.percentile(m["gyro_rms"], 95)),
            "acc_peak": float(np.percentile(m["acc_peak"], 95)),
            "temp_mean": float(m["temp_mean"].mean()),
            "n_windows": int(len(m)),
        }
    return out


def assess_windows(
    win: pd.DataFrame,
    bundle: dict,
    speed_pred: np.ndarray,
    speed_commanded: int | None,
    load: str,
    sample_rate_hz: float | None,
) -> dict[str, Any]:
    """Turn window features into a health verdict. See module docstring."""
    pol = bundle["policy"]
    load = load.upper()
    if load not in pol["temp_edges"]:
        raise ValueError("load must be NO_LOAD or ON_LOAD")
    tol = pol["load_vibration_tolerance"][load]
    floor = pol["noise_floor"]

    ref_speeds = (np.full(len(win), speed_commanded) if speed_commanded is not None
                  else speed_pred)

    ind: dict[str, list[tuple[int, float, float]]] = {
        "vibration": [], "gyro": [], "shock_peaks": [], "pattern": []
    }
    ratios = {"vibration": [], "gyro": [], "shock_peaks": []}
    for (_, row), s in zip(win.iterrows(), ref_speeds):
        base = bundle["baselines"][str(int(s))]
        for name, key, edges_key in [
            ("vibration", "acc_rms", "vibration_ratio_edges"),
            ("gyro", "gyro_rms", "gyro_ratio_edges"),
            ("shock_peaks", "acc_peak", "peak_ratio_edges"),
        ]:
            ref = max(base[key], floor[key])
            ratio = row[key] / ref
            edges = [e * tol for e in pol[edges_key]]
            lv, idx = level_and_index(ratio, edges)
            ind[name].append((lv, idx, ratio))
            ratios[name].append(ratio)

        if pol.get("pattern_anomaly_enabled", True) and "anomaly" in bundle:
            det = bundle["anomaly"].get(str(int(s)))
            if det is not None:
                x = row[SPEED_FEATURES].to_numpy(float).reshape(1, -1)
                x = (x - det["mean"]) / det["scale"]
                sc = float(det["model"].decision_function(x)[0])
                lv, idx = 0, 0.0
                # decision_function < threshold => unusual vector of features
                if sc < det["t_warn"]:
                    lv, idx = 1, 1.0 + min(1.0, (det["t_warn"] - sc) / max(det["span"], 1e-6))
                if sc < det["t_alarm"]:
                    lv, idx = 2, 2.0 + min(1.0, (det["t_alarm"] - sc) / max(det["span"], 1e-6))
                ind["pattern"].append((lv, idx, sc))

    summary: dict[str, dict[str, Any]] = {}
    for name, rows in ind.items():
        if not rows:
            continue
        # 75th percentile across windows: ignores a single glitchy window but
        # still reacts when a quarter of the batch is bad.
        lv = int(np.percentile([r[0] for r in rows], 75, method="higher"))
        idx = float(np.percentile([r[1] for r in rows], 75))
        val = float(np.percentile([r[2] for r in rows], 75))
        summary[name] = {"level": lv, "index": idx, "value": val}

    # temperature (absolute, load-aware)
    t_mean = float(win["temp_mean"].mean())
    t_max = float(win["temp_max"].max())
    t_lv, t_idx = level_and_index(t_max, pol["temp_edges"][load])
    summary["temperature"] = {"level": t_lv, "index": t_idx, "value": t_max}

    # heating rate (only if the dashboard tells us the sampling rate)
    if sample_rate_hz:
        slope_c_min = float(win["temp_slope_per_sample"].mean()) * sample_rate_hz * 60.0
        h_lv, h_idx = level_and_index(slope_c_min, pol["heating_rate_c_per_min_edges"])
        summary["heating_rate"] = {"level": h_lv, "index": h_idx, "value": slope_c_min}

    worst_name = max(summary, key=lambda k: (summary[k]["level"], summary[k]["index"]))
    level = summary[worst_name]["level"]
    index = max(v["index"] for v in summary.values())
    score = float(np.clip(100 - 25 * index, 0, 100))

    ref_speed_final = (int(speed_commanded) if speed_commanded is not None
                       else int(np.bincount(speed_pred.astype(int), minlength=4).argmax()))
    return {
        "level": level,
        "score": score,
        "worst_indicator": worst_name,
        "indicators": summary,
        "reference_speed": ref_speed_final,
        "temp_mean": t_mean,
        "temp_max": t_max,
    }


# --------------------------------------------------------------------------- #
# Human-readable report
# --------------------------------------------------------------------------- #
_PRETTY = {
    "vibration": "Vibration (accelerometer RMS)",
    "gyro": "Rotational vibration (gyroscope RMS)",
    "shock_peaks": "Shock / impact peaks",
    "pattern": "Overall vibration pattern vs. healthy motor",
    "temperature": "Temperature",
    "heating_rate": "Heating rate",
}
_UNIT = {"vibration": "x baseline", "gyro": "x baseline", "shock_peaks": "x baseline",
         "pattern": "anomaly score", "temperature": "°C", "heating_rate": "°C/min"}
_ADVICE = {
    0: "Motor is operating like the healthy reference. No action needed.",
    1: "Operation is acceptable but slightly above the healthy reference. "
       "Keep monitoring and check again after the next duty cycle.",
    2: "Early sign of wear or stress detected. Schedule an inspection soon: "
       "check bearings, shaft alignment, mounting bolts, brushes/commutator and cooling.",
    3: "Abnormal operating condition. Reduce load or stop the motor and inspect before "
       "continued use (bearings, coupling/shaft balance, brushes, overheating cause).",
}


def build_report(assessment: dict, speed_info: dict, meta: dict) -> dict[str, Any]:
    level = assessment["level"]
    status = HEALTH_LEVELS[level]
    reasons = []
    for name, v in assessment["indicators"].items():
        if v["level"] >= 1:
            reasons.append({
                "indicator": name,
                "label": _PRETTY[name],
                "severity": HEALTH_LEVELS[v["level"]],
                "value": round(v["value"], 3),
                "unit": _UNIT[name],
            })
    reasons.sort(key=lambda r: HEALTH_LEVELS.index(r["severity"]), reverse=True)

    notes = []
    if speed_info.get("commanded") is not None and speed_info["detected"] != speed_info["commanded"]:
        notes.append(
            f"Dashboard selected {SPEED_NAMES[speed_info['commanded']]} but the vibration signature "
            f"looks like {SPEED_NAMES[speed_info['detected']]}. Health was judged against "
            f"{SPEED_NAMES[speed_info['commanded']]}."
        )
    if assessment["reference_speed"] == 0 and any(r["indicator"] in ("vibration", "gyro") for r in reasons):
        notes.append("Motor is selected/detected as OFF but vibration is present (unexpected motion).")

    if reasons:
        top = reasons[0]
        summary = (f"{status.replace('_', ' ').title()}: {top['label'][0].lower() + top['label'][1:]} is "
                   f"{top['value']} {top['unit']} ({top['severity'].replace('_', ' ').lower()}).")
    else:
        summary = "Healthy: vibration and temperature are within the healthy range for this speed and load."

    return {
        "status": status,
        "severity": level,
        "color": HEALTH_COLORS[level],
        "health_score": round(assessment["score"], 1),
        "summary": summary,
        "recommendation": _ADVICE[level],
        "speed": {
            "detected": SPEED_NAMES[speed_info["detected"]],
            "detected_confidence": round(speed_info["confidence"], 3),
            "commanded": SPEED_NAMES[speed_info["commanded"]] if speed_info.get("commanded") is not None else None,
            "assessed_against": SPEED_NAMES[assessment["reference_speed"]],
        },
        "load_condition": meta["load"],
        "temperature_c": {"mean": round(assessment["temp_mean"], 2), "max": round(assessment["temp_max"], 2)},
        "indicators": {
            k: {"label": _PRETTY[k], "level": HEALTH_LEVELS[v["level"]],
                "value": round(v["value"], 3), "unit": _UNIT[k]}
            for k, v in assessment["indicators"].items()
        },
        "reasons": reasons,
        "notes": notes,
        "windows_analysed": meta["n_windows"],
        "samples_received": meta["n_samples"],
    }


# --------------------------------------------------------------------------- #
# Public prediction entry-point (used by the API)
# --------------------------------------------------------------------------- #
def analyse(
    samples: Any,
    bundle: dict,
    load: str = "NO_LOAD",
    speed_level: int | None = None,
    accel_unit: str = "m/s2",
    sample_rate_hz: float | None = None,
) -> dict[str, Any]:
    df = to_dataframe(samples, accel_unit)
    if len(df) < MIN_SAMPLES:
        raise ValueError(f"Need at least {MIN_SAMPLES} samples, got {len(df)}.")
    win = make_windows(df)
    proba = bundle["speed_model"].predict_proba(win[SPEED_FEATURES])
    classes = bundle["speed_model"].classes_
    mean_p = proba.mean(axis=0)
    detected = int(classes[int(mean_p.argmax())])
    per_window = classes[proba.argmax(axis=1)].astype(int)

    assessment = assess_windows(win, bundle, per_window, speed_level, load, sample_rate_hz)
    return build_report(
        assessment,
        {"detected": detected, "confidence": float(mean_p.max()), "commanded": speed_level},
        {"load": load.upper(), "n_windows": int(len(win)), "n_samples": int(len(df))},
    )
