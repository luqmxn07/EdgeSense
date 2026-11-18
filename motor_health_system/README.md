# DC Motor Health Model + Backend

```
pip install -r requirements.txt
python train_model.py                      # (optional) retrain -> model/
uvicorn app:app --host 0.0.0.0 --port 8000 # start backend, docs at /docs
python test_api.py                         # smoke test
```
Docker: `docker build -t motor-health . && docker run -p 8000:8000 motor-health`

## What it does
`POST /predict` receives a window of MPU6050 readings (+ the load and speed selected on the dashboard)
and returns a report: **HEALTHY / NORMAL / POTENTIAL_DAMAGE / UNHEALTHY**, a 0-100 health score,
the indicators that caused it (vibration, gyro vibration, shock peaks, pattern, temperature,
heating rate), a recommendation, and the detected speed. See `dashboard_example.js`.

Two layers
1. **Speed classifier** (Random Forest, ML): OFF / LOW / MEDIUM / HIGH from vibration features.
2. **Health engine**: compares the live window with the healthy baseline for that speed
   (vibration RMS, gyro RMS, shock peaks, Isolation-Forest pattern check) + load-aware
   absolute temperature limits + heating rate. Worst indicator decides the state.
   All thresholds are in `model/config.json` (edit, then `POST /reload` - no retraining).

## Results (see model/metrics.json, model/training_log.txt)
| Check | Result |
|---|---|
| Speed classifier, last 20 % of each recording held out | 100 % (32 windows) |
| Speed classifier, 5-fold blocked time-series CV | 100 % in every fold |
| Healthy hold-out windows NOT falsely flagged | 100 % |
| Synthetic stress test (vibration x1.4 -> x4, +30..60 °C) | severity rises monotonically |

## READ THIS - limits of the data
* Your dataset has **4 recordings, one per speed level**. It has **no faulty-motor data, no
  overheating (temperature is 16-17.6 °C everywhere) and no load/no-load labels.**
  So "healthy / potential damage / unhealthy" cannot be learned or accuracy-tested from it.
  The health layer is a **baseline-deviation model** (data-driven baselines + engineering
  thresholds). A 90-94 % *health-state* accuracy cannot be honestly measured with this data.
* The 100 % speed accuracy is real but optimistic: each class is a single session, so it shows
  the model separates those sessions, not that it generalises to other days/mounting/motors.
* `Temperatura` from the MPU6050 is the **sensor die** temperature. It only reflects motor heat
  if the sensor is on the motor. The °C limits (NO_LOAD 40/50/65, ON_LOAD 50/65/80) are
  assumptions - set them for your motor's datasheet. Load tolerance (x1.2 vibration) is also assumed.
* The old `train_model.py` random split over 23 overlapping windows reported inflated accuracy
  (neighbouring windows leak). This version splits by time.

## To reach a measurable 90 %+ health accuracy
Record the same motor with **deliberate faults / conditions**, 1-2 minutes each at each speed:
no-load vs loaded, loosened mounting, unbalanced shaft (tape/weight), worn/dry bearing,
blocked fan / heated motor (with a real thermometer). Add them as `health_label` (0-3) and
train a supervised classifier on `make_windows()` features with time-blocked validation.
The API and report format stay the same.
