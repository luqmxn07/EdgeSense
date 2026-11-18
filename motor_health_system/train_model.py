"""
train_model.py  -  trains and honestly evaluates the DC-motor health model.

Run:   python train_model.py
Needs: data/nivel0.csv .. nivel3.csv   (or data/merged_motor_dataset.csv)
Makes: model/motor_health_model.joblib, model/config.json, model/metrics.json,
       model/plots/*.png
"""
import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

import health_engine as he

ROOT = Path(__file__).parent
DATA = ROOT / "data"
OUT = ROOT / "model"
(OUT / "plots").mkdir(parents=True, exist_ok=True)
SEED = 42
HOLDOUT_FRAC = 0.20     # last 20 % of each recording is never seen in training
N_BLOCKS = 5            # blocked time-series cross-validation


# ----------------------------------------------------------------------------
# 1. Load raw data (4 recordings, one per speed level)
# ----------------------------------------------------------------------------
def load_raw() -> pd.DataFrame:
    parts = []
    for lbl in range(4):
        f = DATA / f"nivel{lbl}.csv"
        if f.exists():
            d = pd.read_csv(f)
            d["label"] = lbl
            parts.append(d)
    if not parts:
        d = pd.read_csv(DATA / "merged_motor_dataset.csv")
        parts = [g for _, g in d.groupby("label")]
    df = pd.concat(parts, ignore_index=True)
    df = he.to_dataframe(df.assign(), "m/s2").join(df["label"])
    return df


def windows_for(df: pd.DataFrame, lo: float = 0.0, hi: float = 1.0) -> pd.DataFrame:
    """Windows lying fully inside the [lo,hi) fraction of every recording."""
    out = []
    for lbl, g in df.groupby("label"):
        g = g.reset_index(drop=True)
        a, b = int(len(g) * lo), int(len(g) * hi)
        w = he.make_windows(g.iloc[a:b])
        w["label"] = lbl
        w["block_start"] = a
        out.append(w)
    return pd.concat(out, ignore_index=True)


def new_rf():
    return RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                  class_weight="balanced", random_state=SEED, n_jobs=-1)


def fit_anomaly(win: pd.DataFrame) -> dict:
    """One Isolation Forest per speed, trained on that speed's healthy windows."""
    det = {}
    for s in sorted(win["label"].unique()):
        X = win.loc[win["label"] == s, he.SPEED_FEATURES].to_numpy(float)
        mean, scale = X.mean(0), X.std(0) + 1e-9
        m = IsolationForest(n_estimators=300, random_state=SEED, contamination="auto").fit((X - mean) / scale)
        sc = m.decision_function((X - mean) / scale)
        det[str(int(s))] = {
            "model": m, "mean": mean, "scale": scale,
            "t_warn": float(np.percentile(sc, 0.5)),     # below ~ the lowest 0.5 % of healthy
            "t_alarm": float(sc.min() - 0.5 * (np.percentile(sc, 50) - sc.min())),
            "span": float(np.percentile(sc, 50) - sc.min()),
        }
    return det


def fit_bundle(win: pd.DataFrame) -> dict:
    rf = new_rf().fit(win[he.SPEED_FEATURES], win["label"])
    return {
        "speed_model": rf,
        "baselines": he.build_baselines(win, win["label"].to_numpy()),
        "anomaly": fit_anomaly(win),
        "policy": json.loads(json.dumps(he.DEFAULT_POLICY)),
        "speed_features": he.SPEED_FEATURES,
        "window": he.WINDOW, "step": he.STEP,
    }


def health_levels(bundle: dict, win: pd.DataFrame, true_speed: int, load="NO_LOAD",
                  scale_vib=1.0, temp_add=0.0, use_commanded=True) -> np.ndarray:
    """Per-window health level for a (possibly synthetically stressed) set of windows."""
    w = win.copy()
    for c in ["acc_rms", "gyro_rms", "acc_peak"]:
        w[c] = w[c] * scale_vib
    for c in ["ax_std", "ay_std", "az_std", "gx_std", "gy_std", "gz_std",
              "ax_p2p", "ay_p2p", "az_p2p", "gx_p2p", "gy_p2p", "gz_p2p"]:
        w[c] = w[c] * scale_vib
    w["temp_mean"] += temp_add
    w["temp_max"] += temp_add
    pred = bundle["speed_model"].predict(w[he.SPEED_FEATURES]).astype(int)
    lv = []
    for i in range(len(w)):
        r = he.assess_windows(w.iloc[[i]], bundle, pred[i:i + 1],
                              true_speed if use_commanded else None, load, None)
        lv.append(r["level"])
    return np.array(lv)


def main():
    print("Loading data ...")
    raw = load_raw()
    print(raw.groupby("label").size().rename("samples").to_string())

    # ------------------------------------------------------------------
    # 2. Chronological hold-out  (train = first 80 %, test = last 20 %)
    # ------------------------------------------------------------------
    tr = windows_for(raw, 0.0, 1 - HOLDOUT_FRAC)
    te = windows_for(raw, 1 - HOLDOUT_FRAC, 1.0)
    print(f"\nTrain windows: {len(tr)}   Hold-out windows: {len(te)}")

    b_eval = fit_bundle(tr)
    pred = b_eval["speed_model"].predict(te[he.SPEED_FEATURES])
    acc = accuracy_score(te["label"], pred)
    f1 = f1_score(te["label"], pred, average="macro")
    cm = confusion_matrix(te["label"], pred)
    print(f"\n[Speed classifier] hold-out accuracy = {acc*100:.2f} %   macro-F1 = {f1:.3f}")
    print(classification_report(te["label"], pred, target_names=list(he.SPEED_NAMES.values()), digits=3))
    print(cm)

    # ------------------------------------------------------------------
    # 3. Blocked time-series CV (5 contiguous blocks per recording, with the
    #    neighbouring windows removed so overlapping windows cannot leak)
    # ------------------------------------------------------------------
    cv_acc = []
    for k in range(N_BLOCKS):
        lo, hi = k / N_BLOCKS, (k + 1) / N_BLOCKS
        test_k = windows_for(raw, lo, hi)
        train_parts = []
        for a, b in [(0.0, max(0.0, lo - 0.02)), (min(1.0, hi + 0.02), 1.0)]:
            if b - a > 0.05:
                train_parts.append(windows_for(raw, a, b))
        train_k = pd.concat(train_parts, ignore_index=True)
        m = new_rf().fit(train_k[he.SPEED_FEATURES], train_k["label"])
        cv_acc.append(accuracy_score(test_k["label"], m.predict(test_k[he.SPEED_FEATURES])))
    print(f"\nBlocked CV accuracy per fold: {[round(a*100,2) for a in cv_acc]}"
          f"  mean = {np.mean(cv_acc)*100:.2f} %")

    # ------------------------------------------------------------------
    # 4. Health layer on hold-out HEALTHY data  -> false-alarm check
    # ------------------------------------------------------------------
    health_eval = {}
    for load in ["NO_LOAD", "ON_LOAD"]:
        for use_cmd in [True, False]:
            tot, ok = 0, 0
            for s in range(4):
                w = te[te["label"] == s]
                lv = health_levels(b_eval, w, s, load, use_commanded=use_cmd)
                tot += len(lv)
                ok += int((lv <= 1).sum())            # HEALTHY or NORMAL
            health_eval[f"{load}|{'commanded_speed' if use_cmd else 'detected_speed'}"] = round(ok / tot * 100, 2)
    print("\nHealthy hold-out windows reported as HEALTHY/NORMAL (no false alarm):")
    for k, v in health_eval.items():
        print(f"   {k:35s} {v:6.2f} %")

    # ------------------------------------------------------------------
    # 5. SYNTHETIC fault-injection sanity test (NOT real accuracy!)
    # ------------------------------------------------------------------
    print("\nSynthetic stress test (scales healthy hold-out vibration / adds heat):")
    stress = {}
    for name, kw in {
        "healthy (x1.0)": dict(scale_vib=1.0),
        "vibration x1.4": dict(scale_vib=1.4),
        "vibration x1.8": dict(scale_vib=1.8),
        "vibration x2.5": dict(scale_vib=2.5),
        "vibration x4.0": dict(scale_vib=4.0),
        "temp +30 C (=~47 C)": dict(temp_add=30),
        "temp +45 C (=~62 C)": dict(temp_add=45),
        "temp +60 C (=~77 C)": dict(temp_add=60),
    }.items():
        lvls = np.concatenate([health_levels(b_eval, te[te["label"] == s], s, "NO_LOAD", **kw) for s in range(4)])
        dist = np.bincount(lvls, minlength=4) / len(lvls) * 100
        stress[name] = {he.HEALTH_LEVELS[i]: round(float(dist[i]), 1) for i in range(4)}
        print(f"   {name:22s} " + "  ".join(f"{he.HEALTH_LEVELS[i][:6]}={dist[i]:5.1f}%" for i in range(4)))

    # ------------------------------------------------------------------
    # 6. Final model on ALL data  ->  deployed bundle
    # ------------------------------------------------------------------
    full = windows_for(raw)
    bundle = fit_bundle(full)
    joblib.dump(bundle, OUT / "motor_health_model.joblib", compress=3)

    imp = pd.Series(bundle["speed_model"].feature_importances_, index=he.SPEED_FEATURES).sort_values(ascending=False)
    cfg = {"policy": bundle["policy"], "baselines": bundle["baselines"]}
    (OUT / "config.json").write_text(json.dumps(cfg, indent=2))
    metrics = {
        "speed_classifier": {
            "holdout_accuracy_pct": round(acc * 100, 2), "holdout_macro_f1": round(f1, 4),
            "blocked_cv_accuracy_pct": [round(a * 100, 2) for a in cv_acc],
            "blocked_cv_mean_pct": round(float(np.mean(cv_acc)) * 100, 2),
            "confusion_matrix_rows_true_cols_pred": cm.tolist(),
            "train_windows": int(len(tr)), "holdout_windows": int(len(te)),
        },
        "health_layer": {
            "healthy_holdout_not_flagged_pct": health_eval,
            "synthetic_stress_distribution_pct": stress,
            "note": "Synthetic stress test only checks that severity rises monotonically. "
                    "It is NOT a measured fault-detection accuracy - no faulty-motor data exists.",
        },
        "top_features": imp.head(8).round(4).to_dict(),
        "window_samples": he.WINDOW,
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2))

    # plots
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    ax.imshow(cm, cmap="Blues")
    names = ["OFF", "LOW", "MED", "HIGH"]
    ax.set_xticks(range(4), names); ax.set_yticks(range(4), names)
    for i in range(4):
        for j in range(4):
            ax.text(j, i, cm[i, j], ha="center", va="center", color="black")
    ax.set_xlabel("Predicted"); ax.set_ylabel("True")
    ax.set_title(f"Speed classifier - hold-out ({acc*100:.1f} %)")
    fig.tight_layout(); fig.savefig(OUT / "plots" / "confusion_matrix.png", dpi=130); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 3.6))
    imp.head(10)[::-1].plot.barh(ax=ax, color="#2563eb")
    ax.set_title("Top feature importances"); fig.tight_layout()
    fig.savefig(OUT / "plots" / "feature_importance.png", dpi=130); plt.close(fig)

    print("\nSaved:", OUT / "motor_health_model.joblib")
    print("Saved:", OUT / "metrics.json", "and", OUT / "config.json")


if __name__ == "__main__":
    main()
