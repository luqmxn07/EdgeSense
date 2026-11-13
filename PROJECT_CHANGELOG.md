# EdgeSense — Project Development Changelog

**Project Name:** EdgeSense  
**Project Title:** An Intelligent IoT-Based Machine Health Monitoring and Anomaly Detection System Using ESP32  
**Project Category:** IoT, Embedded Systems, Edge Computing, Machine Health Monitoring  
**Current Development Stage:** Dashboard Frontend Development  

### Primary Hardware
* ESP32 DevKit V1
* MPU6050 Accelerometer
* DS18B20 Temperature Sensor
* Low-voltage DC Motor
* L298N Motor Driver

### Primary Software & Libraries
* HTML5
* CSS3
* JavaScript (ES6 Modular)
* Chart.js 4.4
* Lucide Icons
* Arduino IDE / ESP-IDF (Target Embedded C/C++)

---

## Current Development Status

| Module | Status | Notes |
| :--- | :--- | :--- |
| **Dashboard UI** | Completed | Industrial dark SCADA theme, responsive cards, and motor topography schematic. |
| **Navigation** | Completed | Sidebar router, 6 tabbed views, mobile drawer, and header quick-controls. |
| **Analytics** | Completed | Real-time Chart.js charts (Vibration RMS, 3-axis traces, Casing Temp, thresholds). |
| **Demo Data** | Completed | Physics-based simulation engine with thermal inertia and scenario presets. |
| **Backend & Cloud API**| Completed | Express.js REST API deployed on Render (`https://edgesense-5q6k.onrender.com`). |
| **Cloud Database**    | Completed | PostgreSQL schema executed and live on Neon (`AWS us-west-2 Oregon`). |
| **Frontend Cloud Deploy** | Completed | Static dashboard configured and deployed on Vercel (`edgesense-dashboard`). |
| **ESP32 Integration** | In Progress | Frontend REST ingestion layer ready; ESP32 firmware & physical link pending. |
| **MPU6050 Integration**| Not Started | Physical wiring & I2C driver on ESP32 pending. |
| **DS18B20 Integration**| Not Started | Physical wiring & 1-Wire driver on ESP32 pending. |
| **Anomaly Detection**  | In Progress | Frontend 3-sigma Z-score display functional; embedded edge calculation pending. |
| **Hardware Prototype** | Not Started | Physical testbench assembly and motor mounting pending. |

---

## Pending Tasks & Future Development

* [ ] Connect ESP32 firmware directly to the cloud Render API (`POST https://edgesense-5q6k.onrender.com/api/telemetry`).
* [ ] Implement I2C communication with MPU6050 on GPIO 21 (SDA) and GPIO 22 (SCL).
* [ ] Implement 1-Wire communication with DS18B20 on GPIO 4.
* [ ] Implement local vector RMS calculation on ESP32 ($RMS = \sqrt{\frac{1}{N}\sum a_i^2}$).
* [ ] Implement statistical anomaly detection (moving window $\mu$, $\sigma$, and 3-sigma Z-Score) on ESP32.
* [ ] Wire and assemble the physical testbench (DC Motor, L298N driver, sensor brackets, ESP32).
* [ ] Verify end-to-end telemetry streaming from physical ESP32 to Render/Neon and live Vercel dashboard.

---

## Version History

### v0.5.0 – Cloud Full-Stack Deployment (Render, Neon PostgreSQL & Vercel)
**Date:** 13 November 2026

#### Added
* **Neon Serverless PostgreSQL Database:** Provisioned cloud PostgreSQL project (`EdgeSense`, branch: `production`, region: `AWS US West 2 Oregon`). Executed [backend/schema.sql](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/backend/schema.sql) creating `telemetry_readings` and `anomaly_alerts` tables with composite time-series indexes.
* **Render Web Service Deployment:** Deployed Node.js Express API to Render at `https://edgesense-5q6k.onrender.com` linked to GitHub `luqmxn07/EdgeSense`. Configured root directory `backend`, build command `npm install`, and start command `node server.js`.
* **Vercel Frontend Deployment:** Configured project `edgesense-dashboard` on Vercel with root directory `dashboard` and application preset `Other` for zero-configuration static hosting.
* **Cloud API Integration in Dashboard:** Updated [dashboard/js/settings.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/dashboard/js/settings.js) and [dashboard/index.html](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/dashboard/index.html) default telemetry endpoint to point directly to `https://edgesense-5q6k.onrender.com/api/telemetry/latest`.
* **Public Repository Migration:** Updated GitHub repository `luqmxn07/EdgeSense` visibility from Private to Public.

#### Files
* Modified: `PROJECT_CHANGELOG.md`, `dashboard/js/settings.js`, `dashboard/index.html`, `.gitignore`.

#### Current Limitations
* Cloud infrastructure is fully live; physical ESP32 breadboard and sensor assembly remain to be connected to the cloud API endpoint.

---

### v0.4.1 – Cloud Backend API & PostgreSQL Schema Scaffold
**Date:** 12 November 2026

#### Added
* **Express REST API (`backend/server.js`):** Configured dynamic `process.env.PORT`, `process.env.DATABASE_URL` with Render-compatible SSL, CORS origin filtering, `/health` check, telemetry ingestion/query endpoints (`POST /api/telemetry`, `GET /api/telemetry/latest`, `GET /api/telemetry/history`), and alert management endpoints (`GET /api/alerts`, `POST /api/alerts`, `PATCH /api/alerts/:alertCode`).
* **PostgreSQL Schema (`backend/schema.sql`):** Defined `telemetry_readings` and `anomaly_alerts` tables with composite time-series indexes and automatic boot-time initialization.
* **Backend Dependencies & Config:** Created `backend/package.json` (`express`, `pg`, `cors`, `dotenv`) and `backend/.env.example`.

#### Files
* Created: `backend/package.json`, `backend/server.js`, `backend/schema.sql`, `backend/.env.example`.
* Modified: `PROJECT_CHANGELOG.md`.

#### Current Limitations
* Backend is scaffolded and locally smoke-tested; cloud deployment to Render PostgreSQL and frontend API wiring for Vercel are pending.

---

### v0.4.0 – Project Modularization & Repository Version Control Setup
**Date:** 02 November 2026

#### Added
* **Standardized Repository Architecture:** Organized project into dedicated `dashboard/`, `firmware/`, `docs/`, and `assets/` submodules.
* **Technical Documentation Suite:** Created [docs/project_overview.md](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/docs/project_overview.md), [docs/system_architecture.md](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/docs/system_architecture.md), and [docs/hardware_connections.md](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/docs/hardware_connections.md).
* **ESP32 Firmware Template:** Created [firmware/esp32/edgesense_firmware.ino](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/firmware/esp32/edgesense_firmware.ino) with MPU6050 I2C sampling, DS18B20 1-Wire temperature acquisition, 50Hz RMS computation, and an asynchronous HTTP REST server exposing `GET /data` with CORS headers.
* **System Architecture Diagram:** Created [assets/diagrams/system_architecture.svg](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/assets/diagrams/system_architecture.svg).
* **License & Git Configuration:** Added official MIT open-source [LICENSE](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/LICENSE) and [.gitignore](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/.gitignore) covering web, node, OS, IDE, PlatformIO, and Arduino build caches.
* **Root Redirection:** Added lightweight [index.html](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/index.html) root redirect to seamlessly load the dashboard when serving the repository root.

#### Modified
* Relocated core dashboard files into [dashboard/](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/dashboard) preserving all relative paths, styles, scripts, and vector assets.
* Overhauled [README.md](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/README.md) to serve as a comprehensive technical project guide.

#### Files
* Created: `LICENSE`, `.gitignore`, `docs/project_overview.md`, `docs/system_architecture.md`, `docs/hardware_connections.md`, `firmware/README.md`, `firmware/esp32/edgesense_firmware.ino`, `assets/diagrams/system_architecture.svg`.
* Relocated: `dashboard/index.html`, `dashboard/css/*`, `dashboard/js/*`, `dashboard/assets/*`.
* Modified: `README.md`, `PROJECT_CHANGELOG.md`, `index.html`.

#### Current Limitations
* Physical ESP32 hardware and sensor breadboard wiring pending assembly and flashing.

---

### v0.3.0 – Analytics Engine, Simulation Physics & Alert Management
**Date:** 02 November 2026

#### Added
* **Live Analytics Page:** Real-time Chart.js charts for vibration RMS and casing temperature with baseline (0.080g), warning (0.35g), and critical (0.60g) threshold lines.
* **3-Axis Decomposition:** Toggleable traces for Vector Total RMS, X-Axis (Radial), Y-Axis (Radial-Y), and Z-Axis (Axial).
* **Time Range Selector:** Dynamic data slicing for 1 Min, 5 Min, 30 Min, and 1 Hour windows.
* **CSV Export & Stream Pause:** Live buffer CSV exporter and animation stream freeze control.
* **Alert History Page:** Filterable incident log table with live search, severity filters, and status transitions (*Active* $\rightarrow$ *Acknowledged* $\rightarrow$ *Resolved*).
* **Incident Simulation:** On-demand test incident injector and auto-threshold breach detection.
* **Toast & Audio Notifications:** Non-intrusive banner alerts and optional Web Audio API chimes.

#### Modified
* Updated [js/app.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/app.js) to initialize Chart.js and alerts lifecycle.
* Linked header notification bell to the alerts view with dynamic badge counting.

#### Files
* Created: [js/charts.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/charts.js)
* Created: [js/alerts.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/alerts.js)
* Modified: [index.html](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/index.html)
* Modified: [css/style.css](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/css/style.css)

#### Current Limitations
* All graph and alert data originate from simulated browser memory or demo data buffers.

---

### v0.2.0 – Dashboard Structure, Topography & Data Service
**Date:** 02 November 2026

#### Added
* **Machine Health Status Card (Hero):** Real-time operational condition assessment for `MOTOR_01` (HEALTHY, WARNING, CRITICAL, OFFLINE).
* **4 Sensor Overview Cards:** Vibration Monitoring, Temperature Monitoring, System Information, and Anomaly Detection.
* **Machine Monitoring Page:** Interactive SVG schematic of DC motor showing sensor mounting topography (MPU6050 on bearing, DS18B20 on stator) with dynamic status beacons.
* **3-Axis Gauges:** Radial/axial live vibration meters with percentage fill bars.
* **System Information Page:** Architectural pipeline flow diagram and live syntax-highlighted JSON schema contract previewer.
* **Settings Page:** Configurable warning/critical sliders, refresh rate selector, and localStorage persistence.
* **Dual-Mode Data Architecture:** `DEMO MODE` (physics-based simulator with scenario presets) and `HARDWARE MODE` (ESP32 REST fetch with connection testing and timeout handling).

#### Modified
* Refactored [js/dataService.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/dataService.js) to enforce transparent connection status (displays `ESP32 DISCONNECTED` when hardware is unreachable).

#### Files
* Created: [js/dataService.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/dataService.js)
* Created: [js/dashboard.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/dashboard.js)
* Created: [js/settings.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/settings.js)
* Modified: [index.html](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/index.html)
* Modified: [css/style.css](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/css/style.css)

#### Current Limitations
* Hardware mode times out gracefully because physical ESP32 firmware is not yet deployed.

---

### v0.1.0 – Initial Project Setup & Design System
**Date:** 02 November 2026

#### Added
* **Repository Architecture:** Directory structure established (`css/`, `js/`, `assets/`).
* **Visual Identity:** Custom vector brand logo representing motor core, stator, and vibration wave ([assets/logo.svg](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/assets/logo.svg)).
* **SCADA Dark Design System:** Palette variables defined (`#080D18`, `#101827`, `#151F30`, `#3B82F6`, `#22D3EE`, `#10B981`, `#F59E0B`, `#EF4444`).
* **Responsive Architecture:** Media query breakpoints for Desktop, Laptop, Tablet, and Mobile drawer navigation.
* **Documentation:** Master technical README covering system architecture and ESP32 REST specifications.

#### Files
* Created: [index.html](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/index.html)
* Created: [css/style.css](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/css/style.css)
* Created: [css/responsive.css](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/css/responsive.css)
* Created: [assets/logo.svg](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/assets/logo.svg)
* Created: [js/app.js](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/js/app.js)
* Created: [README.md](file:///c:/Users/wwwar/Documents/GitHub/EdgeSense%20Dashboard%20development/README.md)

#### Current Limitations
* Initial layout had no live charting or telemetry ingestion.
