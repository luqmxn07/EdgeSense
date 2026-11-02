/**
 * EdgeSense - Data Service Layer
 * Responsible for data acquisition, telemetry normalization, 
 * simulated demo generation, and future ESP32 REST/WebSocket ingestion.
 */

class EdgeSenseDataService {
  constructor() {
    // Load persisted configuration or defaults
    const savedConfig = this.loadConfig();

    this.mode = savedConfig.mode || 'DEMO'; // 'DEMO' | 'HARDWARE'
    this.endpointUrl = savedConfig.endpointUrl || 'http://192.168.4.1/data';
    this.pollingIntervalMs = parseInt(savedConfig.pollingIntervalMs, 10) || 1000;
    
    // Thresholds
    this.vibrationWarn = parseFloat(savedConfig.vibrationWarn) || 0.35;
    this.vibrationCrit = parseFloat(savedConfig.vibrationCrit) || 0.60;
    this.tempWarn = parseFloat(savedConfig.tempWarn) || 45.0;
    this.tempCrit = parseFloat(savedConfig.tempCrit) || 60.0;

    // Active Demo Scenario: 'NORMAL', 'WARNING_VIBRATION', 'CRITICAL_VIBRATION', 'OVERHEATING', 'SENSOR_FAULT'
    this.demoScenario = 'NORMAL';

    // Internal simulation physics state (for realistic inertia)
    this.simState = {
      baseTemp: 33.2,
      currentTemp: 33.2,
      baseRms: 0.082,
      currentRms: 0.082,
      xRms: 0.052,
      yRms: 0.048,
      zRms: 0.042,
      uptimeSec: 3600 * 14 + 1820,
      totalAlertsCount: 3,
      baselineCalibrated: true,
      lastCalibrationDate: '2026-11-01 09:30'
    };

    // Buffer for historical analytics (stores up to 1 hour @ 1-second intervals = 3600 items max)
    this.historyBuffer = [];
    this.maxHistorySize = 3600;

    // Subscribed listeners
    this.subscribers = new Set();
    this.timerId = null;

    // Latest state snapshot
    this.latestSnapshot = null;

    // Pre-populate with realistic 30-minute demonstration history so graphs have rich visual data immediately upon load
    this.seedInitialHistory();
  }

  loadConfig() {
    try {
      const data = localStorage.getItem('edgesense_config');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('[EdgeSense DataService] Failed to read localStorage config:', e);
      return {};
    }
  }

  saveConfig(partialConfig) {
    try {
      const current = this.loadConfig();
      const updated = { ...current, ...partialConfig };
      localStorage.setItem('edgesense_config', JSON.stringify(updated));
      
      // Update instance props
      if (updated.mode) this.mode = updated.mode;
      if (updated.endpointUrl) this.endpointUrl = updated.endpointUrl;
      if (updated.pollingIntervalMs) {
        this.pollingIntervalMs = parseInt(updated.pollingIntervalMs, 10);
        this.restartTimer();
      }
      if (updated.vibrationWarn) this.vibrationWarn = parseFloat(updated.vibrationWarn);
      if (updated.vibrationCrit) this.vibrationCrit = parseFloat(updated.vibrationCrit);
      if (updated.tempWarn) this.tempWarn = parseFloat(updated.tempWarn);
      if (updated.tempCrit) this.tempCrit = parseFloat(updated.tempCrit);
      return true;
    } catch (e) {
      console.error('[EdgeSense DataService] Failed to save config:', e);
      return false;
    }
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.subscribers.add(callback);
      // Immediately notify with latest snapshot if available
      if (this.latestSnapshot) {
        callback(this.latestSnapshot);
      }
    }
    return () => this.subscribers.delete(callback);
  }

  notify(data) {
    this.latestSnapshot = data;
    this.historyBuffer.push({ ...data });
    if (this.historyBuffer.length > this.maxHistorySize) {
      this.historyBuffer.shift();
    }
    this.subscribers.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error('[EdgeSense DataService] Subscriber error:', err);
      }
    });
  }

  start() {
    this.stop();
    // Immediate first tick
    this.tick();
    this.timerId = setInterval(() => this.tick(), this.pollingIntervalMs);
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  restartTimer() {
    this.stop();
    this.start();
  }

  setMode(newMode) {
    if (newMode === 'DEMO' || newMode === 'HARDWARE') {
      this.mode = newMode;
      this.saveConfig({ mode: newMode });
      this.tick(); // Immediate update
    }
  }

  setDemoScenario(scenario) {
    this.demoScenario = scenario;
    this.tick();
  }

  /**
   * Main periodic acquisition loop
   */
  async tick() {
    if (this.mode === 'DEMO') {
      const demoData = this.generateDemoReading();
      this.notify(demoData);
    } else {
      // HARDWARE MODE
      const hwData = await this.fetchHardwareReading();
      this.notify(hwData);
    }
  }

  /**
   * Physically coherent demonstration data generator
   */
  generateDemoReading() {
    const now = Date.now();
    this.simState.uptimeSec += Math.round(this.pollingIntervalMs / 1000);

    // Micro-jitter functions
    const jitter = (amp) => (Math.random() - 0.5) * amp;

    let targetTemp = 33.5;
    let targetRms = 0.082;
    let anomalyScore = 0.24 + Math.random() * 0.15;
    let mpuStatus = 'ONLINE';
    let dsStatus = 'ONLINE';
    let anomalyDetected = false;

    // Apply scenario modifier
    switch (this.demoScenario) {
      case 'WARNING_VIBRATION':
        targetRms = this.vibrationWarn + 0.05 + Math.sin(now / 5000) * 0.04;
        anomalyScore = 1.95 + Math.random() * 0.3;
        anomalyDetected = true;
        break;

      case 'CRITICAL_VIBRATION':
        targetRms = this.vibrationCrit + 0.12 + Math.sin(now / 3000) * 0.08;
        anomalyScore = 3.65 + Math.random() * 0.5;
        anomalyDetected = true;
        break;

      case 'OVERHEATING':
        targetTemp = this.tempCrit + 3.5;
        anomalyScore = 2.45 + Math.random() * 0.4;
        anomalyDetected = true;
        break;

      case 'SENSOR_FAULT':
        mpuStatus = 'FAULT';
        anomalyScore = 4.0;
        anomalyDetected = true;
        break;

      case 'NORMAL':
      default:
        targetTemp = 33.2 + Math.sin(now / 60000) * 1.5;
        targetRms = 0.080 + Math.sin(now / 20000) * 0.015;
        anomalyScore = 0.22 + Math.random() * 0.12;
        anomalyDetected = false;
        break;
    }

    // Thermal inertia: slowly drift toward target temperature
    this.simState.currentTemp += (targetTemp - this.simState.currentTemp) * 0.05 + jitter(0.08);
    // Round to 2 decimals
    const temperature = parseFloat(this.simState.currentTemp.toFixed(2));

    // Vibration inertia: motor mechanical responsiveness
    this.simState.currentRms += (targetRms - this.simState.currentRms) * 0.2 + jitter(0.012);
    if (this.simState.currentRms < 0.01) this.simState.currentRms = 0.01;
    const vibrationRMS = parseFloat(this.simState.currentRms.toFixed(3));

    // 3-Axis decomposition: X (radial), Y (radial orthogonal), Z (axial)
    const xRMS = parseFloat((vibrationRMS * (0.55 + jitter(0.06))).toFixed(3));
    const yRMS = parseFloat((vibrationRMS * (0.52 + jitter(0.06))).toFixed(3));
    const zRMS = parseFloat((vibrationRMS * (0.40 + jitter(0.05))).toFixed(3));

    // Determine Machine Status
    let machineStatus = 'HEALTHY';
    let statusMessage = 'Machine operating within its established baseline.';

    if (mpuStatus === 'FAULT' || dsStatus === 'FAULT') {
      machineStatus = 'OFFLINE';
      statusMessage = 'Sensor fault or communication interruption detected.';
    } else if (vibrationRMS >= this.vibrationCrit || temperature >= this.tempCrit || anomalyScore >= 3.0) {
      machineStatus = 'CRITICAL';
      statusMessage = 'Persistent abnormal measurements detected. Inspection recommended.';
    } else if (vibrationRMS >= this.vibrationWarn || temperature >= this.tempWarn || anomalyScore >= 1.5) {
      machineStatus = 'WARNING';
      statusMessage = 'Vibration or thermal readings are higher than the established baseline.';
    }

    // Anomaly detection status string
    const anomalyStatus = anomalyDetected ? 'ANOMALY_DETECTED' : 'NORMAL';

    return {
      machineId: 'MOTOR_01',
      machineStatus,
      statusMessage,
      vibrationRMS,
      xRMS,
      yRMS,
      zRMS,
      baselineRMS: 0.080,
      vibrationStatus: vibrationRMS >= this.vibrationCrit ? 'CRITICAL' : (vibrationRMS >= this.vibrationWarn ? 'WARNING' : 'HEALTHY'),
      temperature,
      tempTrend: this.simState.currentTemp > targetTemp ? 'FALLING' : (this.simState.currentTemp < targetTemp - 0.2 ? 'RISING' : 'STABLE'),
      tempStatus: temperature >= this.tempCrit ? 'CRITICAL' : (temperature >= this.tempWarn ? 'WARNING' : 'HEALTHY'),
      tempThreshold: this.tempWarn,
      vibrationThreshold: this.vibrationWarn,
      anomalyStatus,
      anomalyScore: parseFloat(anomalyScore.toFixed(2)),
      anomalyMethod: 'Statistical Z-Score (3-Sigma) & Moving RMS Window',
      totalAlerts: this.simState.totalAlertsCount,
      esp32Connected: false, // In DEMO mode, explicit: false so we NEVER fake hardware connection
      mode: 'DEMO',
      timestamp: now,
      sensors: {
        mpu6050: mpuStatus,
        ds18b20: dsStatus,
        esp32: 'DEMO_SIMULATOR'
      },
      system: {
        deviceId: 'ESP32-NODE-01',
        firmware: 'v1.4.2-edge',
        uptimeSeconds: this.simState.uptimeSec,
        lastUpdate: now,
        wifiRssi: -62,
        samplingIntervalMs: 20 // 50Hz telemetry calculation on ESP32
      }
    };
  }

  /**
   * Hardware ingestion layer for future ESP32 communication.
   * If ESP32 is offline/unreachable, gracefully reflects disconnected state.
   */
  async fetchHardwareReading() {
    const now = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(this.endpointUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const raw = await response.json();

      // Normalize hardware payload against contract
      return {
        machineId: raw.machineId || 'MOTOR_01',
        machineStatus: raw.machineStatus || 'HEALTHY',
        statusMessage: raw.statusMessage || 'Live ESP32 telemetry streaming active.',
        vibrationRMS: typeof raw.vibrationRMS === 'number' ? raw.vibrationRMS : 0.0,
        xRMS: typeof raw.xRMS === 'number' ? raw.xRMS : 0.0,
        yRMS: typeof raw.yRMS === 'number' ? raw.yRMS : 0.0,
        zRMS: typeof raw.zRMS === 'number' ? raw.zRMS : 0.0,
        baselineRMS: raw.baselineRMS || 0.080,
        vibrationStatus: raw.vibrationStatus || 'HEALTHY',
        temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.0,
        tempTrend: raw.tempTrend || 'STABLE',
        tempStatus: raw.tempStatus || 'HEALTHY',
        tempThreshold: this.tempWarn,
        vibrationThreshold: this.vibrationWarn,
        anomalyStatus: raw.anomalyStatus || 'NORMAL',
        anomalyScore: typeof raw.anomalyScore === 'number' ? raw.anomalyScore : 0.0,
        anomalyMethod: raw.anomalyMethod || 'Statistical Z-Score & Moving RMS Window',
        totalAlerts: raw.totalAlerts || 0,
        esp32Connected: true, // Actual real connection established
        mode: 'HARDWARE',
        timestamp: raw.timestamp || now,
        sensors: raw.sensors || {
          mpu6050: 'ONLINE',
          ds18b20: 'ONLINE',
          esp32: 'CONNECTED'
        },
        system: raw.system || {
          deviceId: 'ESP32-HARDWARE-01',
          firmware: 'v1.4.2-prod',
          uptimeSeconds: 0,
          lastUpdate: now,
          wifiRssi: -58,
          samplingIntervalMs: 20
        }
      };

    } catch (err) {
      // ESP32 unreachable - report OFFLINE gracefully without throwing
      return {
        machineId: 'MOTOR_01',
        machineStatus: 'OFFLINE',
        statusMessage: 'Unable to receive current sensor measurements from ESP32. Waiting for device connection.',
        vibrationRMS: 0.0,
        xRMS: 0.0,
        yRMS: 0.0,
        zRMS: 0.0,
        baselineRMS: 0.080,
        vibrationStatus: 'OFFLINE',
        temperature: 0.0,
        tempTrend: 'UNKNOWN',
        tempStatus: 'OFFLINE',
        tempThreshold: this.tempWarn,
        vibrationThreshold: this.vibrationWarn,
        anomalyStatus: 'UNKNOWN',
        anomalyScore: 0.0,
        anomalyMethod: 'Statistical Z-Score (ESP32 Disconnected)',
        totalAlerts: 0,
        esp32Connected: false, // Explicitly false!
        mode: 'HARDWARE',
        timestamp: now,
        connectionError: err.message,
        sensors: {
          mpu6050: 'DISCONNECTED',
          ds18b20: 'DISCONNECTED',
          esp32: 'DISCONNECTED'
        },
        system: {
          deviceId: 'ESP32-UNREACHABLE',
          firmware: 'N/A',
          uptimeSeconds: 0,
          lastUpdate: null,
          wifiRssi: 0,
          samplingIntervalMs: 0
        }
      };
    }
  }

  /**
   * Diagnostic connection test called from Settings page
   */
  async testHardwareConnection(targetUrl) {
    const url = targetUrl || this.endpointUrl;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const json = await resp.json();
        return {
          success: true,
          message: `Successfully connected to ESP32 node (${resp.status} OK).`,
          data: json
        };
      } else {
        return {
          success: false,
          message: `Device replied with HTTP ${resp.status} ${resp.statusText}. Check server handler.`
        };
      }
    } catch (err) {
      let reason = err.name === 'AbortError' ? 'Connection timed out after 2.5s.' : err.message;
      return {
        success: false,
        message: `Hardware endpoint unreachable: ${reason}. Confirm ESP32 is powered and connected to the same Wi-Fi subnet.`
      };
    }
  }

  /**
   * Generates a 30-minute historical buffer for instant graph populating
   */
  seedInitialHistory() {
    const points = 180; // 180 points spanning 30 minutes (every 10 seconds)
    const now = Date.now();
    const intervalMs = 10000;

    for (let i = points; i >= 0; i--) {
      const t = now - (i * intervalMs);
      const wave = Math.sin(t / 80000);
      const noise = (Math.sin(t / 5000) * 0.015) + ((Math.random() - 0.5) * 0.01);

      // Add a slight realistic bump around 12 minutes ago for analytical realism
      const spike = (i > 65 && i < 75) ? 0.22 : 0;

      const rms = parseFloat((0.082 + wave * 0.01 + noise + spike).toFixed(3));
      const temp = parseFloat((32.8 + wave * 0.8 + (i > 65 && i < 75 ? 2.5 : 0) + (Math.random() * 0.2)).toFixed(2));

      this.historyBuffer.push({
        machineId: 'MOTOR_01',
        vibrationRMS: rms,
        xRMS: parseFloat((rms * 0.55).toFixed(3)),
        yRMS: parseFloat((rms * 0.52).toFixed(3)),
        zRMS: parseFloat((rms * 0.40).toFixed(3)),
        baselineRMS: 0.080,
        temperature: temp,
        timestamp: t,
        anomalyScore: spike > 0 ? 2.1 : 0.3,
        esp32Connected: false,
        mode: 'DEMO'
      });
    }
  }

  getHistory(minutes = 30) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.historyBuffer.filter(pt => pt.timestamp >= cutoff);
  }
}

// Global instance export
window.edgeSenseDataService = new EdgeSenseDataService();
