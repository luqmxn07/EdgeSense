# EdgeSense — Intelligent IoT Machine Health Monitoring System

**Project Name:** EdgeSense  
**Project Title:** An Intelligent IoT-Based Machine Health Monitoring and Anomaly Detection System Using ESP32  
**Target Monitored Asset:** DC Motor (`MOTOR_01`)  
**License:** MIT License  

---

## 1. Project Description
**EdgeSense** is an edge-computing IoT machine-health monitoring and predictive maintenance system engineered to monitor the operational health of a rotational DC motor in real time. Powered by an **ESP32 DevKit V1** microcontroller, EdgeSense combines triaxial vibration telemetry (**MPU6050**) and digital casing thermometry (**DS18B20**) to perform on-device signal processing, compute vector vibration Root Mean Square (RMS) values, and detect emerging operating anomalies using statistical thresholding before structural damage occurs. Processed metrics are streamed over local Wi-Fi to a modern, responsive industrial SCADA-grade web dashboard.

---

## 2. Problem Statement
Rotational electric machinery is ubiquitous across modern industrial infrastructure. Unexpected mechanical breakdowns caused by bearing fatigue, shaft misalignment, rotor unbalance, or stator thermal overload result in catastrophic equipment downtime, safety risks, and expensive emergency repairs. Traditional maintenance paradigms rely either on reactive replacement (waiting until failure) or calendar-based preventative replacement. There is an essential need for an affordable, localized edge-computing monitoring solution that can continuously track physical degradation and warn operators of early fault signatures.

---

## 3. Proposed Solution
EdgeSense provides an end-to-end edge-to-web condition monitoring architecture:
1. **High-Frequency Transducer Acquisition:** Continuous sampling of triaxial acceleration ($a_x, a_y, a_z$) via I2C and contact temperature via Dallas 1-Wire.
2. **Localized Edge Signal Processing:** The ESP32 computes directional and total vector RMS energy ($RMS = \sqrt{\frac{1}{N}\sum a_i^2}$) to filter high-frequency mechanical noise.
3. **Statistical Anomaly Detection:** An on-device 3-sigma ($3\sigma$) Z-score anomaly detection engine flags operational deviations against dynamic baseline calibration without requiring continuous cloud dependencies.
4. **Industrial SCADA Dashboard:** A standalone, responsive web interface that visualizes multi-axis vibration waveforms, thermal variations, alert lifecycle logs, and machine topography.

---

## 4. Key Features
* **Industrial SCADA User Interface:** Dark theme palette (`#080D18`, `#101827`, `#151F30`, `#3B82F6`, `#22D3EE`) with high-contrast status beacons and clean typography.
* **Dual-Mode Data Architecture:**
  * **DEMO MODE (Active by default):** Realistic motor physics simulation with thermal inertia, harmonic jitter, and preset fault scenarios (*Normal Baseline*, *High Vibration*, *Bearing Looseness*, *Stator Overheating*, *Sensor Fault*).
  * **HARDWARE MODE:** Real-time polling of ESP32 REST JSON endpoints (`GET /data`) with graceful timeout handling and status reporting.
* **Interactive Motor Topography:** High-tech SVG diagram of the monitored motor with dynamic pulsing sensor node pins representing physical MPU6050 and DS18B20 placement.
* **Multi-Axis Real-Time Analytics:** Chart.js streaming graphs with 1-min, 5-min, 30-min, and 1-hour time-range slicing, toggleable individual axis traces, baseline reference lines, and CSV export.
* **Alert Management Workflow:** Filterable incident log table with live search, severity classification (*INFO*, *WARNING*, *CRITICAL*), and interactive acknowledgement/resolution workflow.
* **Live JSON Schema Inspector:** Built-in syntax-highlighted telemetry payload contract previewer.

---

## 5. Hardware Components
| Component | Function / Role | Bus Interface |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** | Central 240 MHz dual-core processing node, Wi-Fi web server, and statistical anomaly engine | Dual-Core Xtensa LX6, Wi-Fi 802.11 b/g/n |
| **MPU6050** | 3-Axis MEMS accelerometer measuring radial and axial vibration acceleration | I2C Fast-Mode (SDA: GPIO 21, SCL: GPIO 22) |
| **DS18B20** | Digital contact probe measuring motor casing and bearing temperature | Dallas 1-Wire (GPIO 4 with 4.7kΩ pull-up) |
| **Low-voltage DC Motor** | Monitored rotational machine (`MOTOR_01`) | Target Asset |
| **L298N Motor Driver** | Dual H-bridge driver providing speed and load modulation via PWM | PWM (GPIO 27), Direction (GPIO 25, 26) |

---

## 6. Software Technologies
* **Embedded Firmware:** Embedded C/C++ running on the ESP32 via Arduino IDE / ESP-IDF.
* **Frontend Visualization:** Modern HTML5, CSS3 (SCADA dark theme), and vanilla ES6 modular JavaScript.
* **Telemetry Charting:** Chart.js 4.4 for real-time multi-dataset time-series streaming.
* **Iconography:** Lucide Icons.

---

## 7. System Architecture

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
                                      ▼ (Local Wi-Fi 802.11 b/g/n)
                          ┌──────────────────────┐
                          │  EdgeSense Dashboard │
                          │ - SCADA Dark Theme   │
                          │ - Chart.js Streaming │
                          │ - Alert Management   │
                          └──────────────────────┘
```

For full architectural formulations and mathematical models, refer to [docs/system_architecture.md](docs/system_architecture.md).

---

## 8. Project Directory Structure

```text
EdgeSense/
├── index.html                   # Root entry point with instant dashboard redirect
├── README.md                    # Comprehensive project documentation
├── PROJECT_CHANGELOG.md         # Central development history & milestone tracker
├── LICENSE                      # MIT Open-Source License
├── .gitignore                   # Exclusions for web, OS, IDE, and firmware builds
│
├── docs/                        # Technical documentation & hardware guides
│   ├── project_overview.md      # Detailed problem statement, objectives & scope
│   ├── system_architecture.md   # Signal pipeline, RMS math & anomaly formulations
│   └── hardware_connections.md  # Complete pinout, schematic & wiring guide
│
├── dashboard/                   # Complete web monitoring interface
│   ├── index.html               # Main dashboard HTML5 single-page application
│   ├── assets/
│   │   └── logo.svg             # Custom vector brand logo
│   ├── css/
│   │   ├── style.css            # Dark industrial SCADA styling & design tokens
│   │   └── responsive.css       # Breakpoints for desktop, tablet, and mobile
│   └── js/
│       ├── app.js               # Application bootstrap, routing & scenario binds
│       ├── dataService.js       # Central data layer (simulation engine & REST fetch)
│       ├── charts.js            # Chart.js visualization engine (multi-axis, limits)
│       ├── alerts.js            # Incident management, alert filtering & search
│       ├── settings.js          # Threshold setpoints & localStorage persistence
│       └── dashboard.js         # DOM updates, gauge rendering & telemetry sync
│
├── firmware/                    # Embedded ESP32 microcontroller software
│   ├── README.md                # Firmware compilation, library setup & flashing guide
│   └── esp32/
│       └── edgesense_firmware.ino # Arduino ESP32 firmware sketch template
│
└── assets/
    └── diagrams/
        └── system_architecture.svg # End-to-end architecture pipeline vector graphic
```

---

## 9. Installation & Running the Dashboard Locally

The dashboard runs independently without requiring complex backend servers or Node.js build processes.

### Option 1: Direct Browser Execution
Open [dashboard/index.html](dashboard/index.html) or [index.html](index.html) directly in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local HTTP Server (Recommended)
Running through a local web server ensures seamless cross-origin communication when testing live ESP32 endpoints:

**Using Python:**
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080` in your web browser.

**Using Node.js:**
```bash
npx serve .
```

---

## 10. Future Development Plans
The current release focuses on **localized statistical anomaly detection** using moving RMS windows and 3-sigma Z-scores. Future milestones include:
* **TinyML / Edge Machine Learning:** Deploying trained embedded classification models (e.g., lightweight autoencoders or decision forests via TensorFlow Lite for Microcontrollers) to classify specific failure modes (bearing inner race defect, outer race defect, shaft misalignment, or brush wear).
* **MQTT Telemetry Ingestion:** Adding an optional MQTT publish layer for integration into enterprise cloud IoT platforms (AWS IoT Core, Azure IoT Hub, or ThingsBoard).
* **Automated Baseline Recalibration:** Implementing an adaptive baseline tracking routine that adjusts setpoints based on motor variable frequency drive (VFD) speed.

---

## 11. Current Development Status

| Module | Status | Notes |
| :--- | :--- | :--- |
| **Dashboard UI** | Completed | Industrial dark SCADA theme, responsive cards, and motor topography schematic. |
| **Navigation** | Completed | Sidebar router, 6 tabbed views, mobile drawer, and header quick-controls. |
| **Analytics** | Completed | Real-time Chart.js charts (Vibration RMS, 3-axis traces, Casing Temp, thresholds). |
| **Demo Data** | Completed | Physics-based simulation engine with thermal inertia and scenario presets. |
| **ESP32 Integration** | In Progress | Frontend REST ingestion layer ready; ESP32 firmware & physical link pending. |
| **MPU6050 Integration**| Not Started | Physical wiring & I2C driver on ESP32 pending. |
| **DS18B20 Integration**| Not Started | Physical wiring & 1-Wire driver on ESP32 pending. |
| **Anomaly Detection**  | In Progress | Frontend 3-sigma Z-score display functional; embedded edge calculation pending. |
| **Hardware Prototype** | Not Started | Physical testbench assembly and motor mounting pending. |

Refer to [PROJECT_CHANGELOG.md](PROJECT_CHANGELOG.md) for full version history, file modifications, and pending task checklists.
