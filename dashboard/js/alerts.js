/**
 * EdgeSense - Alert History & Anomaly Event Management
 * Handles industrial alert lifecycle: Active -> Acknowledged -> Resolved.
 * Contains realistic demonstration incident records & dynamic threshold breach detection.
 */

class EdgeSenseAlerts {
  constructor() {
    // Demonstration records clearly labelled as sample demonstration data
    this.alerts = [
      {
        id: 'ALT-1092',
        timestamp: Date.now() - 1000 * 60 * 14, // 14 mins ago
        machineId: 'MOTOR_01',
        type: 'Abnormal Vibration',
        description: 'Vibration RMS reached 0.42g (Threshold: 0.35g). Elevated radial harmonic detected.',
        severity: 'WARNING',
        status: 'ACTIVE'
      },
      {
        id: 'ALT-1091',
        timestamp: Date.now() - 1000 * 60 * 52, // 52 mins ago
        machineId: 'MOTOR_01',
        type: 'High Temperature',
        description: 'DS18B20 motor casing reading 46.8°C exceeded warning setpoint of 45.0°C.',
        severity: 'WARNING',
        status: 'ACKNOWLEDGED'
      },
      {
        id: 'ALT-1090',
        timestamp: Date.now() - 1000 * 60 * 128, // ~2 hours ago
        machineId: 'MOTOR_01',
        type: 'Baseline Calibration Completed',
        description: 'ESP32 automated statistical baseline recalibrated after 500-sample steady-state window.',
        severity: 'INFO',
        status: 'RESOLVED'
      },
      {
        id: 'ALT-1089',
        timestamp: Date.now() - 1000 * 60 * 240, // 4 hours ago
        machineId: 'MOTOR_01',
        type: 'Transient Vibration Spike',
        description: 'Instantaneous Z-axis crest factor spiked to 3.82σ during heavy start-up load.',
        severity: 'WARNING',
        status: 'RESOLVED'
      },
      {
        id: 'ALT-1088',
        timestamp: Date.now() - 1000 * 60 * 480, // 8 hours ago
        machineId: 'MOTOR_01',
        type: 'ESP32 Wi-Fi Reconnected',
        description: 'Telemetry link resumed after momentary access point channel hopping (RSSI -64 dBm).',
        severity: 'INFO',
        status: 'RESOLVED'
      },
      {
        id: 'ALT-1087',
        timestamp: Date.now() - 1000 * 60 * 720, // 12 hours ago
        machineId: 'MOTOR_01',
        type: 'Critical Vibration Exceedance',
        description: 'Sustained RMS 0.64g exceeded critical limit (0.60g). Severe bearing looseness indicated.',
        severity: 'CRITICAL',
        status: 'RESOLVED'
      }
    ];

    // Filter states
    this.currentSeverityFilter = 'ALL';
    this.currentStatusFilter = 'ALL';
    this.searchQuery = '';

    // Cooldown tracker for dynamic alerts to prevent flooding
    this.lastBreachAlertTime = 0;
  }

  init() {
    this.renderAlertsTable();
    this.renderOverviewAlertsList();
    this.setupEventListeners();
  }

  formatTimestamp(ts) {
    const d = new Date(ts);
    const dateStr = d.toLocaleDateString([], { month: 'short', day: '2-digit' });
    const timeStr = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dateStr} ${timeStr}`;
  }

  /**
   * Monitor live telemetry and generate alert if threshold breached
   */
  processLiveTelemetry(telemetry) {
    const now = Date.now();
    // 30s cooldown between automatic alerts
    if (now - this.lastBreachAlertTime < 30000) return;

    if (telemetry.machineStatus === 'CRITICAL' && telemetry.vibrationRMS >= window.edgeSenseDataService.vibrationCrit) {
      this.addAlert({
        type: 'Critical Vibration',
        description: `Persistent vibration RMS ${telemetry.vibrationRMS}g exceeded critical setpoint (${window.edgeSenseDataService.vibrationCrit}g).`,
        severity: 'CRITICAL',
        machineId: telemetry.machineId
      });
      this.lastBreachAlertTime = now;
    } else if (telemetry.machineStatus === 'WARNING' && telemetry.temperature >= window.edgeSenseDataService.tempWarn) {
      this.addAlert({
        type: 'Elevated Temperature',
        description: `DS18B20 temperature ${telemetry.temperature}°C exceeded threshold (${window.edgeSenseDataService.tempWarn}°C).`,
        severity: 'WARNING',
        machineId: telemetry.machineId
      });
      this.lastBreachAlertTime = now;
    }
  }

  addAlert({ type, description, severity, machineId }) {
    const newAlert = {
      id: `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: Date.now(),
      machineId: machineId || 'MOTOR_01',
      type,
      description,
      severity: severity || 'WARNING',
      status: 'ACTIVE'
    };

    this.alerts.unshift(newAlert);
    this.renderAlertsTable();
    this.renderOverviewAlertsList();
    this.updateNotificationBadge();

    // Trigger toast notification if enabled
    if (window.edgeSenseDashboard && window.edgeSenseDashboard.showToast) {
      window.edgeSenseDashboard.showToast(`[${severity}] ${type}: ${description}`, severity.toLowerCase());
    }
  }

  acknowledgeAlert(id) {
    const target = this.alerts.find(a => a.id === id);
    if (target && target.status === 'ACTIVE') {
      target.status = 'ACKNOWLEDGED';
      this.renderAlertsTable();
      this.renderOverviewAlertsList();
      this.updateNotificationBadge();
      if (window.edgeSenseDashboard) {
        window.edgeSenseDashboard.showToast(`Alert ${id} acknowledged.`, 'warning');
      }
    }
  }

  resolveAlert(id) {
    const target = this.alerts.find(a => a.id === id);
    if (target) {
      target.status = 'RESOLVED';
      this.renderAlertsTable();
      this.renderOverviewAlertsList();
      this.updateNotificationBadge();
      if (window.edgeSenseDashboard) {
        window.edgeSenseDashboard.showToast(`Alert ${id} marked as resolved.`, 'success');
      }
    }
  }

  getFilteredAlerts() {
    return this.alerts.filter(a => {
      // Severity filter
      if (this.currentSeverityFilter !== 'ALL' && a.severity !== this.currentSeverityFilter) {
        return false;
      }
      // Status filter
      if (this.currentStatusFilter !== 'ALL' && a.status !== this.currentStatusFilter) {
        return false;
      }
      // Free text search
      if (this.searchQuery.trim() !== '') {
        const query = this.searchQuery.toLowerCase();
        const matches = 
          a.id.toLowerCase().includes(query) ||
          a.machineId.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }

  renderAlertsTable() {
    const tbody = document.getElementById('alertsTableBody');
    if (!tbody) return;

    const filtered = this.getFilteredAlerts();

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-muted);">
            <i data-lucide="check-circle" style="width: 24px; height: 24px; margin-bottom: 8px; color: var(--status-healthy); display: inline-block;"></i>
            <p>No alert records match current filter criteria.</p>
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const sevClass = item.severity.toLowerCase();
      let statusClass = 'active-alert';
      if (item.status === 'ACKNOWLEDGED') statusClass = 'acknowledged';
      if (item.status === 'RESOLVED') statusClass = 'resolved';

      return `
        <tr>
          <td class="table-time">${this.formatTimestamp(item.timestamp)}</td>
          <td><span class="mono" style="color: var(--text-muted); font-size: 0.72rem;">${item.id}</span></td>
          <td class="table-machine">${item.machineId}</td>
          <td style="font-weight: 600; color: var(--text-primary);">${item.type}</td>
          <td style="max-width: 320px; font-size: 0.78rem;">${item.description}</td>
          <td>
            <span class="severity-pill ${sevClass}">
              <span class="status-dot ${sevClass}" style="width: 5px; height: 5px;"></span>
              ${item.severity}
            </span>
          </td>
          <td>
            <span class="alert-status-badge ${statusClass}">
              ${item.status}
            </span>
          </td>
          <td style="text-align: right;">
            ${item.status === 'ACTIVE' ? `
              <button class="table-action-btn" onclick="window.edgeSenseAlerts.acknowledgeAlert('${item.id}')" title="Acknowledge">Ack</button>
            ` : ''}
            ${item.status !== 'RESOLVED' ? `
              <button class="table-action-btn" onclick="window.edgeSenseAlerts.resolveAlert('${item.id}')" title="Resolve">Resolve</button>
            ` : `<span style="font-size: 0.72rem; color: var(--text-muted);">Closed</span>`}
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    this.updateStatsCounters();
  }

  /**
   * Render compact list of recent active/warning alerts on Overview page
   */
  renderOverviewAlertsList() {
    const container = document.getElementById('overviewRecentAlertsList');
    if (!container) return;

    const recent = this.alerts.slice(0, 4);
    if (!recent.length) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.75rem;">No recent alerts recorded.</div>`;
      return;
    }

    container.innerHTML = recent.map(item => {
      const sevClass = item.severity.toLowerCase();
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg-card-inner); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="status-dot ${sevClass}"></span>
            <div>
              <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-primary);">${item.type}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${this.formatTimestamp(item.timestamp)}</div>
            </div>
          </div>
          <span class="severity-pill ${sevClass}" style="font-size: 0.65rem;">${item.severity}</span>
        </div>
      `;
    }).join('');
  }

  updateStatsCounters() {
    const totalCount = this.alerts.length;
    const activeCount = this.alerts.filter(a => a.status === 'ACTIVE').length;
    const critCount = this.alerts.filter(a => a.severity === 'CRITICAL' && a.status !== 'RESOLVED').length;

    const totalEl = document.getElementById('statTotalAlerts');
    const activeEl = document.getElementById('statActiveAlerts');
    const critEl = document.getElementById('statCritAlerts');

    if (totalEl) totalEl.textContent = totalCount;
    if (activeEl) activeEl.textContent = activeCount;
    if (critEl) critEl.textContent = critCount;
  }

  updateNotificationBadge() {
    const activeCount = this.alerts.filter(a => a.status === 'ACTIVE').length;
    const badge = document.getElementById('headerNotifyBadge');
    const navBadge = document.getElementById('sidebarAlertBadge');

    if (badge) {
      badge.textContent = activeCount;
      badge.style.display = activeCount > 0 ? 'flex' : 'none';
    }
    if (navBadge) {
      navBadge.textContent = activeCount;
      navBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }
  }

  setupEventListeners() {
    // Severity Filter dropdown
    const sevSelect = document.getElementById('alertSeverityFilter');
    if (sevSelect) {
      sevSelect.addEventListener('change', (e) => {
        this.currentSeverityFilter = e.target.value;
        this.renderAlertsTable();
      });
    }

    // Status Filter dropdown
    const statusSelect = document.getElementById('alertStatusFilter');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.currentStatusFilter = e.target.value;
        this.renderAlertsTable();
      });
    }

    // Free text search input
    const searchInput = document.getElementById('alertSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderAlertsTable();
      });
    }

    // Trigger Demo Alert button (for easy evaluation during demonstration)
    const triggerDemoAlertBtn = document.getElementById('triggerDemoAlertBtn');
    if (triggerDemoAlertBtn) {
      triggerDemoAlertBtn.addEventListener('click', () => {
        const types = [
          { type: 'Abnormal Vibration Harmonics', desc: 'Spectral 2x line frequency vibration detected at 0.44g RMS.', sev: 'WARNING' },
          { type: 'Critical Stator Casing Overheating', desc: 'DS18B20 digital temperature reached 58.2°C.', sev: 'CRITICAL' },
          { type: 'Transient Anomaly Peak', desc: 'ESP32 statistical anomaly score escalated to 3.42σ.', sev: 'WARNING' }
        ];
        const chosen = types[Math.floor(Math.random() * types.length)];
        this.addAlert({
          type: chosen.type,
          description: chosen.desc,
          severity: chosen.sev,
          machineId: 'MOTOR_01'
        });
      });
    }
  }
}

// Global instance export
window.edgeSenseAlerts = new EdgeSenseAlerts();
