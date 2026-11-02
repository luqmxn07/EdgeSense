# EdgeSense — System Architecture & Telemetry Pipeline

## 1. End-to-End Architectural Pipeline

The EdgeSense architecture bridges physical transducers, embedded edge intelligence, wireless networking, and human-machine interface (HMI) visualization:

```
┌─────────────────┐       ┌──────────────────────┐
│    DC Motor     │ ───>  │  MPU6050 (Vibration) │ (I2C: GPIO 21, 22)
│ (Monitored Hub) │ ───>  │  DS18B20 (Casing T)  │ (1-Wire: GPIO 4)
└─────────────────┘       └──────────────────────┘
                                      │
                                      ▼
                          ┌──────────────────────┐
                          │   ESP32 Micro-Edge   │
                          │ - 50Hz Sampling Loop │
                          │ - RMS Energy Compute │
                          │ - 3-Sigma Anomaly Z  │
                          │ - HTTP REST Server   │
                          └──────────────────────┘
                                      │
                                      ▼ (Wi-Fi 802.11 b/g/n)
                          ┌──────────────────────┐
                          │  EdgeSense Dashboard │
                          │ - SCADA Dark Theme   │
                          │ - Chart.js Streaming │
                          │ - Alert Management   │
                          └──────────────────────┘
```

---

## 2. Vibration Signal Processing & RMS Formulation

Raw triaxial acceleration signals ($a_x, a_y, a_z$) sampled at 1 kHz internal digital low-pass filtering (DLPF) are aggregated over an $N$-sample moving window ($N = 500$ samples) to calculate directional and vector Root Mean Square (RMS):

### Directional RMS:
$$RMS_x = \sqrt{\frac{1}{N} \sum_{i=1}^{N} a_{x,i}^2}, \quad RMS_y = \sqrt{\frac{1}{N} \sum_{i=1}^{N} a_{y,i}^2}, \quad RMS_z = \sqrt{\frac{1}{N} \sum_{i=1}^{N} a_{z,i}^2}$$

### Total Vector RMS:
$$RMS_{total} = \sqrt{RMS_x^2 + RMS_y^2 + RMS_z^2}$$

This reduces high-frequency noise spikes while capturing cumulative mechanical vibration energy indicative of imbalance, bearing race pitting, and mechanical looseness.

---

## 3. Edge Statistical Anomaly Detection

To identify mechanical faults without relying on cloud processing, EdgeSense implements a statistical moving baseline algorithm on the ESP32:

1. **Baseline Phase:** During steady-state calibrated running, the ESP32 computes running baseline mean ($\mu_{baseline}$) and standard deviation ($\sigma_{baseline}$).
2. **Z-Score Formulation:** For every incoming evaluation window, the instantaneous anomaly metric is scored:
   $$Z = \frac{RMS_{current} - \mu_{baseline}}{\sigma_{baseline}}$$
3. **Threshold Classification:**
   * $Z < 1.5\sigma$: **HEALTHY** (Within established mechanical baseline).
   * $1.5\sigma \le Z < 3.0\sigma$: **WARNING** (Elevated vibration harmonics detected).
   * $Z \ge 3.0\sigma$ OR $RMS \ge RMS_{crit}$: **CRITICAL** (Severe mechanical anomaly / immediate inspection required).

---

## 4. Telemetry REST API Contract

The ESP32 runs an asynchronous lightweight HTTP server exposing `GET /data` with CORS enabled:

```json
{
  "machineId": "MOTOR_01",
  "machineStatus": "HEALTHY",
  "statusMessage": "Machine operating within its established baseline.",
  "vibrationRMS": 0.082,
  "xRMS": 0.052,
  "yRMS": 0.048,
  "zRMS": 0.042,
  "baselineRMS": 0.080,
  "vibrationStatus": "HEALTHY",
  "temperature": 33.2,
  "tempTrend": "STABLE",
  "tempStatus": "HEALTHY",
  "tempThreshold": 45.0,
  "vibrationThreshold": 0.35,
  "anomalyStatus": "NORMAL",
  "anomalyScore": 0.24,
  "anomalyMethod": "Statistical Z-Score (3-Sigma) & Moving RMS Window",
  "totalAlerts": 3,
  "esp32Connected": true,
  "mode": "HARDWARE",
  "timestamp": 1730559600000,
  "sensors": {
    "mpu6050": "ONLINE",
    "ds18b20": "ONLINE",
    "esp32": "CONNECTED"
  },
  "system": {
    "deviceId": "ESP32-HARDWARE-01",
    "firmware": "v1.4.2-prod",
    "uptimeSeconds": 52400,
    "lastUpdate": 1730559600000,
    "wifiRssi": -62,
    "samplingIntervalMs": 20
  }
}
```
