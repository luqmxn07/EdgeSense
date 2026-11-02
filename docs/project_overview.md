# EdgeSense — Project Overview

## 1. Project Information
* **Project Name:** EdgeSense
* **Full Title:** An Intelligent IoT-Based Machine Health Monitoring and Anomaly Detection System Using ESP32
* **Project Category:** IoT, Embedded Systems, Edge Computing, Predictive Maintenance

## 2. Problem Statement
Rotating industrial machinery, such as DC motors, induction motors, pumps, and gearboxes, are critical assets across modern industrial automation. Unplanned equipment breakdowns due to mechanical wear, bearing fatigue, shaft misalignment, or thermal overload result in catastrophic downtime, safety hazards, and exorbitant maintenance costs. 

Traditional maintenance strategies rely either on reactive approaches (running until failure) or arbitrary calendar-based maintenance (premature replacements). There is a vital need for compact, cost-effective edge-computing systems that continuously monitor physical vibration and thermal gradients, detect subtle operating anomalies in real time, and deliver actionable SCADA-grade diagnostics before structural damage occurs.

## 3. Proposed Solution
EdgeSense provides an end-to-end edge-to-cloud machine health monitoring architecture centered around the **ESP32 DevKit V1** microcontroller. By coupling high-frequency triaxial acceleration acquisition (**MPU6050**) with precision digital contact thermometry (**DS18B20**), EdgeSense performs localized signal processing:
1. **Edge Root Mean Square (RMS) Computation:** Transforms raw multi-axis vibration signals into continuous mechanical energy indicators.
2. **Statistical Anomaly Detection:** Employs a 3-sigma ($3\sigma$) Z-score thresholding model against moving baseline windows, isolating mechanical loosening and thermal runaway at the edge without requiring costly continuous cloud transmission.
3. **Responsive Industrial Web Dashboard:** Exposes real-time telemetry over local Wi-Fi via a lightweight REST API and renders multi-axis waveforms, thermal trends, and incident logs through an industrial SCADA-grade user interface.

## 4. Primary Hardware Components
| Component | Function / Role | Interface |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** | Central 240 MHz dual-core processing node, Wi-Fi web server, and statistical anomaly engine | Dual-Core Xtensa LX6, Wi-Fi 802.11 b/g/n |
| **MPU6050** | 3-Axis MEMS accelerometer measuring radial and axial vibration waveforms | I2C Fast-Mode (Address `0x68`) |
| **DS18B20** | Digital contact temperature probe measuring stator and bearing casing temperature | Dallas 1-Wire Protocol (GPIO 4) |
| **DC Motor** | Target monitored rotational machine (12V brushed DC motor) | Monitored Asset |
| **L298N Motor Driver** | Dual H-bridge controller providing variable speed and load simulation via PWM | GPIO PWM control |

## 5. Primary Software Stack
* **Embedded Firmware:** Embedded C/C++ running on the ESP32 via Arduino IDE / ESP-IDF.
* **Frontend Visualization:** Modern HTML5, CSS3 (SCADA dark theme), and vanilla ES6 modular JavaScript.
* **Telemetry Charting:** Chart.js 4.4 for real-time multi-dataset time-series streaming.
* **Iconography:** Lucide Icons.

## 6. Project Scope & Phased Roadmap
* **Phase 1 (Completed):** Industrial SCADA dashboard frontend, telemetry visualization engine, alert management system, and dual-mode data architecture (demo physics simulator vs. ESP32 REST ingestion).
* **Phase 2 (In Progress):** ESP32 C/C++ firmware implementation, sensor bus integration (I2C & 1-Wire), and statistical anomaly calculation at the edge.
* **Phase 3 (Upcoming):** Physical testbench assembly, sensor mounting brackets, baseline calibration, and closed-loop live hardware validation.
* **Phase 4 (Future Development):** On-device TinyML / machine-learning inference models (autoencoders or Tiny Random Forests) for multidimensional classification of specific fault signatures.
