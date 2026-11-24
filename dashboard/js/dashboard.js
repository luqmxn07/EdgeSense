/**
 * EdgeSense - Dashboard UI Controller
 * Coordinates live telemetry DOM rendering, telemetry telemetry card updates,
 * sensor status badges, and toast notifications.
 */

class EdgeSenseDashboard {
  constructor() {
    this.maxVibrationSeen = 0.08;
    this.maxTempSeen = 33.0;
    this.audioContext = null;
  }

  init() {
    // Subscribe to the centralized dataService
    if (window.edgeSenseDataService) {
      window.edgeSenseDataService.subscribe((data) => this.renderTelemetry(data));
    }
  }

  /**
   * Main incoming telemetry render dispatcher
   */
  renderTelemetry(data) {
    if (!data) return;

    // Track running peaks
    if (data.vibrationRMS > this.maxVibrationSeen) {
      this.maxVibrationSeen = data.vibrationRMS;
    }
    if (data.temperature > this.maxTempSeen) {
      this.maxTempSeen = data.temperature;
    }

    // 1. Header indicators
    this.renderHeader(data);

    // 2. Overview: Machine Health Hero Card
    this.renderHealthHero(data);

    // 3. Overview: 4 Core Sensor Overview Cards
    this.renderSensorCards(data);

    // 4. Machine Monitoring Detailed View & 3-Axis Gauges
    this.renderMachineMonitoring(data);

    // 5. System Info & Live JSON Preview
    this.renderSystemInfo(data);

    // 6. Forward to charts
    if (window.edgeSenseCharts) {
      window.edgeSenseCharts.updateCharts(data);
    }

    // 7. Check for alert threshold events
    if (window.edgeSenseAlerts) {
      window.edgeSenseAlerts.processLiveTelemetry(data);
    }
  }

  /**
   * Top Header State Rendering
   */
  renderHeader(data) {
    const timeEl = document.getElementById('headerTimestamp');
    if (timeEl) {
      const d = new Date(data.timestamp);
      timeEl.textContent = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    const machineChip = document.getElementById('headerMachineId');
    if (machineChip) {
      machineChip.textContent = data.machineId || 'MOTOR_01';
    }

    // Mode Badge (Strict adherence: NEVER fake online connection in demo mode)
    const modeBadge = document.getElementById('headerModeBadge');
    if (modeBadge) {
      if (data.mode === 'DEMO') {
        modeBadge.className = 'mode-badge demo';
        modeBadge.innerHTML = `<span class="status-dot healthy pulse" style="width: 6px; height: 6px;"></span> DEMO MODE (SIMULATED)`;
      } else {
        // Hardware Mode
        if (data.esp32Connected) {
          modeBadge.className = 'mode-badge hardware-connected';
          modeBadge.innerHTML = `<span class="status-dot healthy pulse" style="width: 6px; height: 6px;"></span> ESP32 CONNECTED`;
        } else {
          modeBadge.className = 'mode-badge hardware-disconnected';
          modeBadge.innerHTML = `<span class="status-dot critical" style="width: 6px; height: 6px;"></span> ESP32 DISCONNECTED`;
        }
      }
    }

    // Sidebar footer status
    const sidebarStatusDot = document.getElementById('sidebarStatusDot');
    const sidebarStatusText = document.getElementById('sidebarStatusText');
    if (sidebarStatusDot && sidebarStatusText) {
      const isConnected = data.mode === 'DEMO' ? true : Boolean(data.esp32Connected);
      const st = isConnected ? (data.machineStatus || 'HEALTHY').toLowerCase() : 'offline';
      sidebarStatusDot.className = `status-dot ${st} pulse`;
      sidebarStatusText.textContent = data.mode === 'DEMO' ? `Demo (${data.machineStatus})` : (isConnected ? data.machineStatus : 'OFFLINE');
    }
  }

  /**
   * Section 5.1: Machine Health Status Hero Card
   */
  renderHealthHero(data) {
    const heroCard = document.getElementById('healthHeroCard');
    const badge = document.getElementById('healthStatusBadge');
    const descText = document.getElementById('healthStatusDesc');
    const quickRms = document.getElementById('heroQuickRms');
    const quickTemp = document.getElementById('heroQuickTemp');

    const isConnected = data.mode === 'DEMO' ? true : Boolean(data.esp32Connected);
    const status = isConnected ? (data.machineStatus || 'HEALTHY') : 'OFFLINE';
    const statusClass = status.toLowerCase();

    if (heroCard) {
      heroCard.className = `health-hero-card ${statusClass}`;
    }

    if (badge) {
      badge.className = `health-status-badge ${statusClass}`;
      badge.innerHTML = `<span class="status-dot ${statusClass}" style="width: 10px; height: 10px;"></span> ${status}`;
    }

    if (descText) {
      descText.textContent = isConnected
        ? (data.statusMessage || 'Machine operating within its established baseline.')
        : (data.statusMessage || 'No recent telemetry received from ESP32. Waiting for device connection.');
    }

    if (quickRms) {
      const val = (isConnected && typeof data.vibrationRMS === 'number') ? data.vibrationRMS : 0.0;
      quickRms.textContent = `${val.toFixed(3)} g`;
    }

    if (quickTemp) {
      const val = (isConnected && typeof data.temperature === 'number') ? data.temperature : 0.0;
      quickTemp.textContent = `${val.toFixed(1)} °C`;
    }
  }

  /**
   * Section 5.2: Sensor Overview Cards
   */
  renderSensorCards(data) {
    const isConnected = data.mode === 'DEMO' ? true : Boolean(data.esp32Connected);

    // 1. Vibration Card
    const vibVal = document.getElementById('cardVibRmsVal');
    const vibBase = document.getElementById('cardVibBaseVal');
    const vibMax = document.getElementById('cardVibMaxVal');
    const vibTag = document.getElementById('cardVibStatusTag');

    if (vibVal) {
      const val = (isConnected && typeof data.vibrationRMS === 'number') ? data.vibrationRMS : 0.0;
      vibVal.textContent = val.toFixed(3);
    }
    if (vibBase) {
      const base = (isConnected && typeof data.baselineRMS === 'number') ? data.baselineRMS : 0.080;
      vibBase.textContent = `${base.toFixed(3)} g`;
    }
    if (vibMax) {
      vibMax.textContent = `${Math.max(0.082, this.maxVibrationSeen).toFixed(3)} g`;
    }
    if (vibTag) {
      if (!isConnected) {
        vibTag.className = 'sensor-status-tag offline';
        vibTag.textContent = 'OFFLINE';
      } else {
        const st = (data.vibrationStatus || 'HEALTHY').toLowerCase();
        vibTag.className = `sensor-status-tag ${st}`;
        vibTag.textContent = data.vibrationStatus || 'HEALTHY';
      }
    }

    // 2. Temperature Card
    const tempVal = document.getElementById('cardTempVal');
    const tempThresh = document.getElementById('cardTempThresholdVal');
    const tempTrend = document.getElementById('cardTempTrendVal');
    const tempTag = document.getElementById('cardTempStatusTag');

    if (tempVal) {
      const val = (isConnected && typeof data.temperature === 'number') ? data.temperature : 0.0;
      tempVal.textContent = val.toFixed(1);
    }
    if (tempThresh) {
      const thresh = (isConnected && typeof data.tempThreshold === 'number') ? data.tempThreshold : 45.0;
      tempThresh.textContent = `${thresh.toFixed(1)} °C`;
    }
    if (tempTrend) {
      tempTrend.textContent = isConnected ? (data.tempTrend || 'STABLE') : 'UNKNOWN';
    }
    if (tempTag) {
      if (!isConnected) {
        tempTag.className = 'sensor-status-tag offline';
        tempTag.textContent = 'OFFLINE';
      } else {
        const st = (data.tempStatus || 'HEALTHY').toLowerCase();
        tempTag.className = `sensor-status-tag ${st}`;
        tempTag.textContent = data.tempStatus || 'HEALTHY';
      }
    }

    // 3. System Information Card
    const devId = document.getElementById('cardSysDeviceId');
    const espConn = document.getElementById('cardSysEspStatus');
    const uptime = document.getElementById('cardSysUptime');
    const lastUpdate = document.getElementById('cardSysLastUpdate');

    if (devId) devId.textContent = data.system?.deviceId || 'ESP32-HARDWARE-01';
    if (espConn) {
      if (data.mode === 'DEMO') {
        espConn.innerHTML = `<span style="color: var(--cyan-accent); font-weight: 600;">SIMULATED (DEMO)</span>`;
      } else {
        espConn.innerHTML = isConnected 
          ? `<span style="color: var(--status-healthy); font-weight: 600;">ONLINE (WI-FI)</span>`
          : `<span style="color: var(--status-critical); font-weight: 600;">DISCONNECTED</span>`;
      }
    }
    if (uptime) {
      const sec = data.system?.uptimeSeconds || 0;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      uptime.textContent = `${h}h ${m}m`;
    }
    if (lastUpdate) {
      lastUpdate.textContent = data.mode === 'DEMO' ? 'Active (Demo)' : (isConnected ? 'Live' : 'Lost Link');
    }

    // 4. Anomaly Detection Card
    const anomStatus = document.getElementById('cardAnomalyStatusVal');
    const anomScore = document.getElementById('cardAnomalyScoreVal');
    const anomAlerts = document.getElementById('cardAnomalyAlertsVal');
    const anomMethod = document.getElementById('cardAnomalyMethodVal');

    if (anomStatus) {
      const isDetected = isConnected && data.anomalyStatus === 'ANOMALY_DETECTED';
      anomStatus.innerHTML = isDetected 
        ? `<span style="color: var(--status-critical); font-weight: 700;">ANOMALY DETECTED</span>`
        : `<span style="color: var(--status-healthy); font-weight: 600;">NORMAL</span>`;
    }
    if (anomScore) {
      const score = (isConnected && typeof data.anomalyScore === 'number') ? data.anomalyScore : 0;
      anomScore.textContent = `${score} σ`;
    }
    if (anomAlerts) anomAlerts.textContent = data.totalAlerts ?? 0;
    if (anomMethod) {
      anomMethod.className = isConnected ? 'sensor-status-tag healthy' : 'sensor-status-tag healthy';
      anomMethod.textContent = '3-Sigma Z-Score';
    }
  }

  /**
   * Section 7: Machine Monitoring Detailed View
   */
  renderMachineMonitoring(data) {
    const isConnected = data.mode === 'DEMO' ? true : Boolean(data.esp32Connected);

    // 3-Axis Gauges
    const gaugeX = document.getElementById('gaugeXRms');
    const gaugeY = document.getElementById('gaugeYRms');
    const gaugeZ = document.getElementById('gaugeZRms');

    const barX = document.getElementById('barXRms');
    const barY = document.getElementById('barYRms');
    const barZ = document.getElementById('barZRms');

    const x = (isConnected && typeof data.xRMS === 'number') ? data.xRMS : 0.0;
    const y = (isConnected && typeof data.yRMS === 'number') ? data.yRMS : 0.0;
    const z = (isConnected && typeof data.zRMS === 'number') ? data.zRMS : 0.0;

    if (gaugeX) gaugeX.textContent = `${x.toFixed(3)} g`;
    if (gaugeY) gaugeY.textContent = `${y.toFixed(3)} g`;
    if (gaugeZ) gaugeZ.textContent = `${z.toFixed(3)} g`;

    // Max visual meter scale ~0.50g
    const toPct = (val) => Math.min(100, Math.round((val / 0.50) * 100));

    if (barX) barX.style.width = isConnected ? `${toPct(x)}%` : '0%';
    if (barY) barY.style.width = isConnected ? `${toPct(y)}%` : '0%';
    if (barZ) barZ.style.width = isConnected ? `${toPct(z)}%` : '0%';

    // Sensor availability table
    const mpuRow = document.getElementById('sensorStatusMpu');
    const dsRow = document.getElementById('sensorStatusDs');
    const espRow = document.getElementById('sensorStatusEsp');

    if (mpuRow) {
      mpuRow.innerHTML = isConnected && data.sensors?.mpu6050 === 'ONLINE'
        ? `<span class="sensor-status-tag healthy">ONLINE (0x68)</span>`
        : `<span class="sensor-status-tag offline">OFFLINE / NO DATA</span>`;
    }
    if (dsRow) {
      dsRow.innerHTML = isConnected && data.sensors?.ds18b20 === 'ONLINE'
        ? `<span class="sensor-status-tag healthy">ONLINE (GPIO 4)</span>`
        : `<span class="sensor-status-tag offline">OFFLINE / NO DATA</span>`;
    }
    if (espRow) {
      if (data.mode === 'DEMO') {
        espRow.innerHTML = `<span class="sensor-status-tag warning">DEMO EMULATION</span>`;
      } else {
        espRow.innerHTML = isConnected
          ? `<span class="sensor-status-tag healthy">CONNECTED</span>`
          : `<span class="sensor-status-tag critical">DISCONNECTED</span>`;
      }
    }

    // Update diagram pulsing sensor pins
    const pinMpu = document.getElementById('motorSvgMpuPin');
    const pinDs = document.getElementById('motorSvgDsPin');
    if (pinMpu) {
      pinMpu.setAttribute('fill', !isConnected ? '#64748B' : (data.vibrationRMS >= window.edgeSenseDataService.vibrationCrit ? '#EF4444' : (data.vibrationRMS >= window.edgeSenseDataService.vibrationWarn ? '#F59E0B' : '#22D3EE')));
    }
    if (pinDs) {
      pinDs.setAttribute('fill', !isConnected ? '#64748B' : (data.temperature >= window.edgeSenseDataService.tempCrit ? '#EF4444' : (data.temperature >= window.edgeSenseDataService.tempWarn ? '#F59E0B' : '#10B981')));
    }
  }

  /**
   * Section 9: System Information & Raw JSON Preview
   */
  renderSystemInfo(data) {
    const jsonBox = document.getElementById('liveJsonPayloadPreview');
    if (jsonBox) {
      const sanitized = {
        machineId: data.machineId,
        vibrationRMS: data.vibrationRMS,
        xRMS: data.xRMS,
        yRMS: data.yRMS,
        zRMS: data.zRMS,
        temperature: data.temperature,
        machineStatus: data.machineStatus,
        anomalyStatus: data.anomalyStatus,
        anomalyScore: data.anomalyScore,
        esp32Connected: data.esp32Connected,
        mode: data.mode,
        timestamp: data.timestamp,
        sensors: data.sensors,
        system: data.system
      };

      jsonBox.innerHTML = this.syntaxHighlightJSON(JSON.stringify(sanitized, null, 2));
    }
  }

  syntaxHighlightJSON(jsonStr) {
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-num';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-bool';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  /**
   * Toast notification system
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-dot ${type === 'warning' ? 'warning' : (type === 'critical' || type === 'error' ? 'critical' : 'healthy')}"></span>
        <span>${message}</span>
      </div>
      <button style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding-left: 8px;" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Audio chime if enabled in settings
    this.playChime(type);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4500);
  }

  playChime(type) {
    try {
      const config = window.edgeSenseSettings?.current;
      if (!config || !config.enableAudioChime) return;

      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      const freq = type === 'critical' ? 880 : (type === 'warning' ? 660 : 440);
      osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.05, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.25);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.25);
    } catch (e) {
      // Audio playback restrictions in browsers without user interaction
    }
  }
}

// Global instance export
window.edgeSenseDashboard = new EdgeSenseDashboard();
