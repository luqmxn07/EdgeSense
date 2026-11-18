"""Smoke test: replays real windows from the dataset (and stressed copies) through the API."""
import pandas as pd
from fastapi.testclient import TestClient
from app import app

c = TestClient(app)
print(c.get("/health").json())

def window(label, start=1000, n=50, scale=1.0, temp_add=0.0):
    f = {0: "nivel0", 1: "nivel1", 2: "nivel2", 3: "nivel3"}[label]
    d = pd.read_csv(f"data/{f}.csv").iloc[start:start + n]
    d = d.copy()
    for col in ["Acel_X", "Acel_Y", "Acel_Z", "Giro_X", "Giro_Y", "Giro_Z"]:
        m = d[col].mean(); d[col] = m + (d[col] - m) * scale
    d["Temperatura"] += temp_add
    return d.to_dict("records")

cases = [
    ("OFF, no load",              dict(samples=window(0), load="NO_LOAD", speed_level=0)),
    ("LOW, no load",              dict(samples=window(1), load="NO_LOAD", speed_level=1)),
    ("MEDIUM, on load",           dict(samples=window(2), load="ON_LOAD", speed_level=2)),
    ("HIGH, on load (no speed sent)", dict(samples=window(3), load="ON_LOAD")),
    ("MEDIUM, vibration x1.7",    dict(samples=window(2, scale=1.7), load="NO_LOAD", speed_level=2)),
    ("HIGH, vibration x3",        dict(samples=window(3, scale=3.0), load="ON_LOAD", speed_level=3)),
    ("LOW, hot (+50C)",           dict(samples=window(1, temp_add=50), load="NO_LOAD", speed_level=1)),
    ("Selected LOW but runs HIGH", dict(samples=window(3), load="NO_LOAD", speed_level=1)),
]
for name, body in cases:
    r = c.post("/predict", json=body)
    j = r.json()
    print(f"{name:32s} -> {r.status_code} {j.get('status')} score={j.get('health_score')} | {j.get('summary')}")

print("too few samples ->", c.post("/predict", json={"samples": window(1, n=5)}).json())
print("missing field   ->", c.post("/predict", json={"samples": [{"ax": 1}] * 30}).json())
