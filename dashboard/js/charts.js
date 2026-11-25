/**
 * EdgeSense - Charts & Visualisation Module
 * Powered by Chart.js (Dark Industrial SCADA theme)
 */

class EdgeSenseCharts {
  constructor() {
    this.vibrationChart = null;
    this.temperatureChart = null;
    this.overviewVibrationChart = null;
    this.overviewTemperatureChart = null;

    this.selectedTimeRangeMin = 5; // default 5 minutes
    this.scrollOffsetSec = 0;      // 0 = live stream; > 0 = viewing history seconds in the past
    this.maxScrollSec = 3600;      // Allow up to 60 minutes historical scrollback
    this.isPaused = false;

    // Axis visibility toggles
    this.visibleAxes = {
      total: true,
      x: true,
      y: true,
      z: true
    };
  }

  init() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('[EdgeSense Charts] Chart.js is not loaded.');
      return;
    }

    // Set global Chart.js dark defaults
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'JetBrains Mono', 'Inter', monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.tooltip.backgroundColor = '#151F30';
    Chart.defaults.plugins.tooltip.titleColor = '#F8FAFC';
    Chart.defaults.plugins.tooltip.bodyColor = '#22D3EE';
    Chart.defaults.plugins.tooltip.borderColor = '#1E293B';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;

    this.createOverviewCharts();
    this.createVibrationChart();
    this.createTemperatureChart();
    this.setupEventListeners();
  }

  /**
   * Formats timestamps into 24-hour real-time clock labels (HH:MM:SS)
   * Ensures every axis tick and tooltip shows the actual real-world time.
   */
  formatTimeLabel(timestamp) {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  formatFullTime(timestamp) {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * 1. Overview Page: Dual Dedicated Telemetry Previews (Vibration Upper, Temperature Lower)
   */
  createOverviewCharts() {
    const ctxVib = document.getElementById('overviewVibrationChart');
    const ctxTemp = document.getElementById('overviewTemperatureChart');

    const history = window.edgeSenseDataService.getHistory(15);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));
    const vibData = history.map(h => (typeof h.vibrationRMS === 'number' ? h.vibrationRMS : 0.0));
    const tempData = history.map(h => (typeof h.temperature === 'number' ? h.temperature : 0.0));

    const warnVib = window.edgeSenseDataService.vibrationWarn || 0.35;
    const critVib = window.edgeSenseDataService.vibrationCrit || 0.60;
    const warnTemp = window.edgeSenseDataService.tempWarn || 45.0;
    const critTemp = window.edgeSenseDataService.tempCrit || 55.0;

    // 1A. Vibration Acceleration RMS Chart
    if (ctxVib) {
      this.overviewVibrationChart = new Chart(ctxVib, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Vibration RMS (g)',
              data: vibData,
              borderColor: '#22D3EE',
              backgroundColor: 'rgba(34, 211, 238, 0.08)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
              pointRadius: 0
            },
            {
              label: `Warning Threshold (${warnVib.toFixed(2)}g)`,
              data: history.map(() => warnVib),
              borderColor: '#F59E0B',
              borderDash: [5, 4],
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            },
            {
              label: `Critical Threshold (${critVib.toFixed(2)}g)`,
              data: history.map(() => critVib),
              borderColor: '#EF4444',
              borderDash: [4, 4],
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { color: '#94A3B8', boxWidth: 10, font: { size: 10 } }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { maxTicksLimit: 10, color: '#64748B' }
            },
            y: {
              title: { display: true, text: 'Vibration (g RMS)', color: '#22D3EE', font: { size: 10 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              min: 0,
              suggestedMax: 0.5
            }
          }
        }
      });
    }

    // 1B. Motor Casing Temperature Chart
    if (ctxTemp) {
      this.overviewTemperatureChart = new Chart(ctxTemp, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Casing Temp (°C)',
              data: tempData,
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
              pointRadius: 0
            },
            {
              label: `Warning Threshold (${warnTemp.toFixed(1)}°C)`,
              data: history.map(() => warnTemp),
              borderColor: '#F97316',
              borderDash: [5, 4],
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            },
            {
              label: `Critical Threshold (${critTemp.toFixed(1)}°C)`,
              data: history.map(() => critTemp),
              borderColor: '#EF4444',
              borderDash: [4, 4],
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { color: '#94A3B8', boxWidth: 10, font: { size: 10 } }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { maxTicksLimit: 10, color: '#64748B' }
            },
            y: {
              title: { display: true, text: 'Temperature (°C)', color: '#F59E0B', font: { size: 10 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              min: 0,
              suggestedMax: 60
            }
          }
        }
      });
    }
  }

  /**
   * 2. Live Analytics Page: Real-time Vibration RMS Graph (with 3-Axis breakdown & Thresholds)
   */
  createVibrationChart() {
    const ctx = document.getElementById('vibrationAnalyticsChart');
    if (!ctx) return;

    const history = window.edgeSenseDataService.getHistory(this.selectedTimeRangeMin);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));

    const totalRms = history.map(h => h.vibrationRMS);
    const xRms = history.map(h => h.xRMS || 0);
    const yRms = history.map(h => h.yRMS || 0);
    const zRms = history.map(h => h.zRMS || 0);

    const warnThreshold = window.edgeSenseDataService.vibrationWarn;
    const critThreshold = window.edgeSenseDataService.vibrationCrit;
    const baseline = 0.080;

    const warnLine = history.map(() => warnThreshold);
    const critLine = history.map(() => critThreshold);
    const baseLine = history.map(() => baseline);

    this.vibrationChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total RMS (Vector Sum)',
            data: totalRms,
            borderColor: '#22D3EE',
            backgroundColor: 'rgba(34, 211, 238, 0.10)',
            borderWidth: 2.2,
            tension: 0.25,
            fill: true,
            pointRadius: 0,
            hidden: !this.visibleAxes.total
          },
          {
            label: 'X-Axis RMS (Radial)',
            data: xRms,
            borderColor: '#3B82F6',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 0,
            fill: false,
            hidden: !this.visibleAxes.x
          },
          {
            label: 'Y-Axis RMS (Radial-Y)',
            data: yRms,
            borderColor: '#818CF8',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 0,
            fill: false,
            hidden: !this.visibleAxes.y
          },
          {
            label: 'Z-Axis RMS (Axial)',
            data: zRms,
            borderColor: '#C084FC',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: 0,
            fill: false,
            hidden: !this.visibleAxes.z
          },
          {
            label: `Baseline Reference (${baseline.toFixed(3)}g)`,
            data: baseLine,
            borderColor: '#10B981',
            borderDash: [5, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Warning Threshold (${warnThreshold.toFixed(2)}g)`,
            data: warnLine,
            borderColor: '#F59E0B',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical Threshold (${critThreshold.toFixed(2)}g)`,
            data: critLine,
            borderColor: '#EF4444',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 10, font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { maxTicksLimit: 12, color: '#64748B' }
          },
          y: {
            title: { display: true, text: 'Vibration Acceleration (g RMS)', color: '#22D3EE' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            min: 0,
            suggestedMax: 0.7
          }
        }
      }
    });
  }

  /**
   * 3. Live Analytics Page: Temperature Variation Graph
   */
  createTemperatureChart() {
    const ctx = document.getElementById('temperatureAnalyticsChart');
    if (!ctx) return;

    const history = window.edgeSenseDataService.getHistory(this.selectedTimeRangeMin);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));
    const tempData = history.map(h => h.temperature);

    const warnThreshold = window.edgeSenseDataService.tempWarn;
    const critThreshold = window.edgeSenseDataService.tempCrit;

    const warnLine = history.map(() => warnThreshold);
    const critLine = history.map(() => critThreshold);

    this.temperatureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Motor Casing Temperature (°C)',
            data: tempData,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 0
          },
          {
            label: `Warning Threshold (${warnThreshold.toFixed(1)}°C)`,
            data: warnLine,
            borderColor: '#F97316',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical Limit (${critThreshold.toFixed(1)}°C)`,
            data: critLine,
            borderColor: '#EF4444',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 10, font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { maxTicksLimit: 12, color: '#64748B' }
          },
          y: {
            title: { display: true, text: 'DS18B20 Temp (°C)', color: '#F59E0B' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            suggestedMin: 25,
            suggestedMax: 65
          }
        }
      }
    });
  }

  /**
   * Called on every dataService tick to stream updates
   */
  updateCharts(latestReading) {
    if (this.isPaused) return;

    // Refresh history based on active time range and historical scroll offset
    const history = window.edgeSenseDataService.getHistory(this.selectedTimeRangeMin, this.scrollOffsetSec);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));

    this.updateScrubberUI(history);

    // Update Overview Vibration Chart if exists (Always pinned to live 15m)
    if (this.overviewVibrationChart) {
      const overviewHistory = window.edgeSenseDataService.getHistory(15, 0);
      const oLabels = overviewHistory.map(h => this.formatTimeLabel(h.timestamp));
      const oVib = overviewHistory.map(h => (typeof h.vibrationRMS === 'number' ? h.vibrationRMS : 0.0));
      const warnVib = window.edgeSenseDataService.vibrationWarn || 0.35;
      const critVib = window.edgeSenseDataService.vibrationCrit || 0.60;

      this.overviewVibrationChart.data.labels = oLabels;
      this.overviewVibrationChart.data.datasets[0].data = oVib;
      this.overviewVibrationChart.data.datasets[1].data = overviewHistory.map(() => warnVib);
      this.overviewVibrationChart.data.datasets[2].data = overviewHistory.map(() => critVib);
      this.overviewVibrationChart.update('none');
    }

    // Update Overview Temperature Chart if exists (Always pinned to live 15m)
    if (this.overviewTemperatureChart) {
      const overviewHistory = window.edgeSenseDataService.getHistory(15, 0);
      const oLabels = overviewHistory.map(h => this.formatTimeLabel(h.timestamp));
      const oTemp = overviewHistory.map(h => (typeof h.temperature === 'number' ? h.temperature : 0.0));
      const warnTemp = window.edgeSenseDataService.tempWarn || 45.0;
      const critTemp = window.edgeSenseDataService.tempCrit || 55.0;

      this.overviewTemperatureChart.data.labels = oLabels;
      this.overviewTemperatureChart.data.datasets[0].data = oTemp;
      this.overviewTemperatureChart.data.datasets[1].data = overviewHistory.map(() => warnTemp);
      this.overviewTemperatureChart.data.datasets[2].data = overviewHistory.map(() => critTemp);
      this.overviewTemperatureChart.update('none');
    }

    // Update Vibration Analytics Chart (Supports Historical Scrubbing)
    if (this.vibrationChart) {
      const warnThreshold = window.edgeSenseDataService.vibrationWarn;
      const critThreshold = window.edgeSenseDataService.vibrationCrit;
      const baseline = 0.080;

      this.vibrationChart.data.labels = labels;
      this.vibrationChart.data.datasets[0].data = history.map(h => h.vibrationRMS);
      this.vibrationChart.data.datasets[1].data = history.map(h => h.xRMS || 0);
      this.vibrationChart.data.datasets[2].data = history.map(h => h.yRMS || 0);
      this.vibrationChart.data.datasets[3].data = history.map(h => h.zRMS || 0);
      this.vibrationChart.data.datasets[4].data = history.map(() => baseline);
      this.vibrationChart.data.datasets[5].data = history.map(() => warnThreshold);
      this.vibrationChart.data.datasets[6].data = history.map(() => critThreshold);
      this.vibrationChart.update('none');
    }

    // Update Temperature Analytics Chart (Supports Historical Scrubbing)
    if (this.temperatureChart) {
      const warnThreshold = window.edgeSenseDataService.tempWarn;
      const critThreshold = window.edgeSenseDataService.tempCrit;

      this.temperatureChart.data.labels = labels;
      this.temperatureChart.data.datasets[0].data = history.map(h => h.temperature);
      this.temperatureChart.data.datasets[1].data = history.map(() => warnThreshold);
      this.temperatureChart.data.datasets[2].data = history.map(() => critThreshold);
      this.temperatureChart.update('none');
    }
  }

  /**
   * Synchronizes timeline scrubber UI controls with active viewing window
   */
  updateScrubberUI(history) {
    const slider = document.getElementById('timelineRangeSlider');
    const statusPill = document.getElementById('scrubberStatusPill');
    const statusText = document.getElementById('scrubberStatusText');
    const dot = document.getElementById('scrubberLiveDot');
    const snapBtn = document.getElementById('scrubberSnapLive');
    const card = document.getElementById('timelineScrubberCard');
    const winStart = document.getElementById('scrubberWindowStart');
    const winEnd = document.getElementById('scrubberWindowEnd');

    if (slider && !this.isUserDraggingSlider) {
      slider.value = this.scrollOffsetSec;
    }

    const isLive = this.scrollOffsetSec <= 2;

    if (statusPill && statusText && dot) {
      if (isLive) {
        statusPill.className = 'scrubber-status-pill live';
        dot.className = 'status-dot healthy pulse';
        statusText.textContent = 'LIVE STREAM (REAL-TIME)';
        if (card) card.classList.remove('scrubbing-active');
        if (snapBtn) snapBtn.classList.add('active');
      } else {
        statusPill.className = 'scrubber-status-pill history';
        dot.className = 'status-dot warning';
        const mins = (this.scrollOffsetSec / 60).toFixed(this.scrollOffsetSec % 60 === 0 ? 0 : 1);
        statusText.textContent = `⏮ VIEWING HISTORY (${mins}m ago)`;
        if (card) card.classList.add('scrubbing-active');
        if (snapBtn) snapBtn.classList.remove('active');
      }
    }

    if (history && history.length >= 2) {
      if (winStart) winStart.textContent = this.formatFullTime(history[0].timestamp);
      if (winEnd) winEnd.textContent = this.formatFullTime(history[history.length - 1].timestamp);
    }
  }

  setScrollOffset(sec) {
    this.scrollOffsetSec = Math.max(0, Math.min(sec, this.maxScrollSec));
    this.updateCharts();
  }

  stepScrollOffset(deltaSec) {
    this.setScrollOffset(this.scrollOffsetSec + deltaSec);
  }

  snapToLive() {
    this.setScrollOffset(0);
  }

  setTimeRange(minutes) {
    this.selectedTimeRangeMin = minutes;
    this.updateCharts();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  toggleAxis(axisKey) {
    if (this.visibleAxes.hasOwnProperty(axisKey)) {
      this.visibleAxes[axisKey] = !this.visibleAxes[axisKey];
      if (this.vibrationChart) {
        const indexMap = { total: 0, x: 1, y: 2, z: 3 };
        const dsIndex = indexMap[axisKey];
        if (dsIndex !== undefined) {
          this.vibrationChart.data.datasets[dsIndex].hidden = !this.visibleAxes[axisKey];
          this.vibrationChart.update();
        }
      }
    }
    return this.visibleAxes[axisKey];
  }

  formatDateTimeLocal(d) {
    if (!d || isNaN(d.getTime())) d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  openCsvExportModal() {
    const backdrop = document.getElementById('csvExportModalBackdrop');
    if (!backdrop) return;

    // Calculate current visible window on chart
    const currentEndMs = Date.now() - (this.scrollOffsetSec * 1000);
    const currentStartMs = currentEndMs - (this.selectedTimeRangeMin * 60 * 1000);

    const fromInput = document.getElementById('csvExportFrom');
    const toInput = document.getElementById('csvExportTo');
    if (fromInput) fromInput.value = this.formatDateTimeLocal(new Date(currentStartMs));
    if (toInput) toInput.value = this.formatDateTimeLocal(new Date(currentEndMs));

    // Reset preset chips to 'view'
    document.querySelectorAll('.export-preset-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.preset === 'view');
    });

    this.updateCsvExportSummary();

    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('show'));
    if (window.lucide) window.lucide.createIcons();
  }

  closeCsvExportModal() {
    const backdrop = document.getElementById('csvExportModalBackdrop');
    if (!backdrop) return;
    backdrop.classList.remove('show');
    setTimeout(() => { backdrop.style.display = 'none'; }, 220);
  }

  updateCsvExportSummary() {
    const fromInput = document.getElementById('csvExportFrom');
    const toInput = document.getElementById('csvExportTo');
    const filterCheckbox = document.getElementById('csvFilterSynthetic');
    if (!fromInput || !toInput) return;

    const startMs = new Date(fromInput.value).getTime();
    const endMs = new Date(toInput.value).getTime();

    const startValEl = document.getElementById('csvSummaryStart');
    const endValEl = document.getElementById('csvSummaryEnd');
    const durationValEl = document.getElementById('csvSummaryDuration');
    const countValEl = document.getElementById('csvSummaryCount');
    const confirmBtnText = document.getElementById('confirmExportCsvText');

    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      if (startValEl) startValEl.textContent = 'Invalid Time';
      if (endValEl) endValEl.textContent = 'Invalid Time';
      if (durationValEl) durationValEl.textContent = '--';
      if (countValEl) countValEl.textContent = '0 rows';
      if (confirmBtnText) confirmBtnText.textContent = 'Select Valid Range';
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const formatTimeOnly = (ms) => {
      const d = new Date(ms);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    if (startValEl) startValEl.textContent = formatTimeOnly(startMs);
    if (endValEl) endValEl.textContent = formatTimeOnly(endMs);

    // Calculate duration
    const diffSec = Math.round((endMs - startMs) / 1000);
    let durStr = `${diffSec}s`;
    if (diffSec >= 3600) {
      durStr = `${(diffSec / 3600).toFixed(1)} hrs`;
    } else if (diffSec >= 60) {
      durStr = `${(diffSec / 60).toFixed(1)} mins`;
    }
    if (durationValEl) durationValEl.textContent = durStr;

    // Count records in buffer
    const filterSynthetic = filterCheckbox ? filterCheckbox.checked : true;
    const records = window.edgeSenseDataService 
      ? window.edgeSenseDataService.getRangeHistory(startMs, endMs, filterSynthetic)
      : [];

    const rowCount = records.length;
    if (countValEl) countValEl.textContent = `${rowCount} rows`;
    if (confirmBtnText) confirmBtnText.textContent = `Download CSV (${rowCount} Rows)`;
  }

  async exportHistoryCSVByRange(startMs, endMs, filterSynthetic = true, syncDb = false) {
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      if (window.edgeSenseDashboard?.showToast) {
        window.edgeSenseDashboard.showToast('Please select a valid start and end time range.', 'warning');
      }
      return;
    }

    // Optional: Fetch older points from Cloud API/PostgreSQL if requested
    if (syncDb && window.edgeSenseDataService?.fetchHistoryRange) {
      try {
        await window.edgeSenseDataService.fetchHistoryRange(startMs, endMs);
      } catch (e) {
        console.warn('Database range sync error:', e);
      }
    }

    const history = window.edgeSenseDataService 
      ? window.edgeSenseDataService.getRangeHistory(startMs, endMs, filterSynthetic)
      : [];

    if (!history.length) {
      if (window.edgeSenseDashboard?.showToast) {
        window.edgeSenseDashboard.showToast('No recorded telemetry found in the selected range.', 'warning');
      }
      return;
    }

    let csv = 'Timestamp,ISO_Time,Machine_ID,Vibration_RMS_g,X_RMS_g,Y_RMS_g,Z_RMS_g,Temp_C,Status,Mode\n';
    history.forEach(row => {
      const iso = new Date(row.timestamp).toISOString();
      csv += `${row.timestamp},"${iso}","${row.machineId}",${row.vibrationRMS},${row.xRMS || 0},${row.yRMS || 0},${row.zRMS || 0},${row.temperature},"${row.machineStatus || 'HEALTHY'}","${row.mode}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const pad = (n) => String(n).padStart(2, '0');
    const d1 = new Date(startMs);
    const d2 = new Date(endMs);
    const startTag = `${d1.getFullYear()}${pad(d1.getMonth()+1)}${pad(d1.getDate())}_${pad(d1.getHours())}${pad(d1.getMinutes())}`;
    const endTag = `${pad(d2.getHours())}${pad(d2.getMinutes())}`;

    link.setAttribute('download', `EdgeSense_MOTOR_01_${startTag}_to_${endTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.closeCsvExportModal();
    if (window.edgeSenseDashboard?.showToast) {
      window.edgeSenseDashboard.showToast(`Exported ${history.length} telemetry records to CSV.`, 'healthy');
    }
  }

  exportHistoryCSV() {
    this.openCsvExportModal();
  }

  setupEventListeners() {
    // Time range buttons
    document.querySelectorAll('[data-time-range]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-time-range]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const min = parseInt(e.currentTarget.dataset.timeRange, 10);
        this.setTimeRange(min);
      });
    });

    // Timeline Scrubber Slider
    const slider = document.getElementById('timelineRangeSlider');
    if (slider) {
      slider.addEventListener('mousedown', () => { this.isUserDraggingSlider = true; });
      slider.addEventListener('touchstart', () => { this.isUserDraggingSlider = true; }, { passive: true });
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setScrollOffset(val);
      });
      slider.addEventListener('change', () => { this.isUserDraggingSlider = false; });
      slider.addEventListener('mouseup', () => { this.isUserDraggingSlider = false; });
      slider.addEventListener('touchend', () => { this.isUserDraggingSlider = false; });
    }

    // Timeline Scrubber Step Buttons
    const btnRewind5m = document.getElementById('scrubberRewind5m');
    const btnRewind1m = document.getElementById('scrubberRewind1m');
    const btnRewind15s = document.getElementById('scrubberRewind15s');
    const btnFwd15s = document.getElementById('scrubberFwd15s');
    const btnFwd1m = document.getElementById('scrubberFwd1m');
    const btnFwd5m = document.getElementById('scrubberFwd5m');
    const btnSnapLive = document.getElementById('scrubberSnapLive');

    if (btnRewind5m) btnRewind5m.addEventListener('click', () => this.stepScrollOffset(300));
    if (btnRewind1m) btnRewind1m.addEventListener('click', () => this.stepScrollOffset(60));
    if (btnRewind15s) btnRewind15s.addEventListener('click', () => this.stepScrollOffset(15));
    if (btnFwd15s) btnFwd15s.addEventListener('click', () => this.stepScrollOffset(-15));
    if (btnFwd1m) btnFwd1m.addEventListener('click', () => this.stepScrollOffset(-60));
    if (btnFwd5m) btnFwd5m.addEventListener('click', () => this.stepScrollOffset(-300));
    if (btnSnapLive) btnSnapLive.addEventListener('click', () => this.snapToLive());

    // Mouse Wheel Scroll & Drag-to-Pan on Graph Canvases
    ['vibrationAnalyticsChart', 'temperatureAnalyticsChart'].forEach(canvasId => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      // Mouse wheel scrubbing: Wheel down = back in time; Wheel up = forward towards live
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = (this.selectedTimeRangeMin <= 1) ? 10 : (this.selectedTimeRangeMin <= 5 ? 20 : 60);
        const dir = e.deltaY > 0 ? 1 : -1;
        this.stepScrollOffset(dir * step);
      }, { passive: false });

      // Click-and-drag horizontal timeline panning
      let isDragging = false;
      let startX = 0;
      let startOffset = 0;

      canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startOffset = this.scrollOffsetSec;
        canvas.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const secPerPixel = (this.selectedTimeRangeMin * 60) / (canvas.clientWidth || 600);
        const deltaSec = Math.round(-dx * secPerPixel);
        this.setScrollOffset(startOffset + deltaSec);
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          canvas.style.cursor = 'default';
        }
      });
    });

    // Pause/Resume button
    const pauseBtn = document.getElementById('pauseStreamBtn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        const paused = this.togglePause();
        pauseBtn.innerHTML = paused 
          ? `<i data-lucide="play"></i><span>Resume Stream</span>`
          : `<i data-lucide="pause"></i><span>Pause Stream</span>`;
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Export CSV button
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.openCsvExportModal());
    }

    // CSV Export Modal listeners
    const closeCsvBtn = document.getElementById('closeCsvModalBtn');
    const cancelCsvBtn = document.getElementById('cancelCsvModalBtn');
    const backdrop = document.getElementById('csvExportModalBackdrop');
    if (closeCsvBtn) closeCsvBtn.addEventListener('click', () => this.closeCsvExportModal());
    if (cancelCsvBtn) cancelCsvBtn.addEventListener('click', () => this.closeCsvExportModal());
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeCsvExportModal();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop && backdrop.classList.contains('show')) {
        this.closeCsvExportModal();
      }
    });

    // Preset Chips
    document.querySelectorAll('.export-preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.export-preset-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const preset = e.currentTarget.dataset.preset;
        const now = Date.now();
        const fInput = document.getElementById('csvExportFrom');
        const tInput = document.getElementById('csvExportTo');

        if (!fInput || !tInput) return;

        if (preset === 'view') {
          const currentEndMs = now - (this.scrollOffsetSec * 1000);
          const currentStartMs = currentEndMs - (this.selectedTimeRangeMin * 60 * 1000);
          fInput.value = this.formatDateTimeLocal(new Date(currentStartMs));
          tInput.value = this.formatDateTimeLocal(new Date(currentEndMs));
        } else if (preset === '1m') {
          fInput.value = this.formatDateTimeLocal(new Date(now - 60 * 1000));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === '5m') {
          fInput.value = this.formatDateTimeLocal(new Date(now - 5 * 60 * 1000));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === '15m') {
          fInput.value = this.formatDateTimeLocal(new Date(now - 15 * 60 * 1000));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === '30m') {
          fInput.value = this.formatDateTimeLocal(new Date(now - 30 * 60 * 1000));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === '1h') {
          fInput.value = this.formatDateTimeLocal(new Date(now - 60 * 60 * 1000));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === 'all') {
          const buffer = window.edgeSenseDataService?.historyBuffer || [];
          const firstMs = buffer.length > 0 ? buffer[0].timestamp : (now - 3600 * 1000);
          fInput.value = this.formatDateTimeLocal(new Date(firstMs));
          tInput.value = this.formatDateTimeLocal(new Date(now));
        } else if (preset === 'custom') {
          fInput.focus();
        }

        this.updateCsvExportSummary();
      });
    });

    // Helper Buttons
    const setFromViewStartBtn = document.getElementById('setFromViewStartBtn');
    if (setFromViewStartBtn) {
      setFromViewStartBtn.addEventListener('click', () => {
        const fInput = document.getElementById('csvExportFrom');
        const currentEndMs = Date.now() - (this.scrollOffsetSec * 1000);
        const currentStartMs = currentEndMs - (this.selectedTimeRangeMin * 60 * 1000);
        if (fInput) fInput.value = this.formatDateTimeLocal(new Date(currentStartMs));
        this.updateCsvExportSummary();
      });
    }

    const setFrom5mBtn = document.getElementById('setFrom5mBtn');
    if (setFrom5mBtn) {
      setFrom5mBtn.addEventListener('click', () => {
        const fInput = document.getElementById('csvExportFrom');
        const tInput = document.getElementById('csvExportTo');
        const endMs = tInput ? new Date(tInput.value).getTime() : Date.now();
        if (fInput && !isNaN(endMs)) {
          fInput.value = this.formatDateTimeLocal(new Date(endMs - 5 * 60 * 1000));
        }
        this.updateCsvExportSummary();
      });
    }

    const setFrom1hBtn = document.getElementById('setFrom1hBtn');
    if (setFrom1hBtn) {
      setFrom1hBtn.addEventListener('click', () => {
        const fInput = document.getElementById('csvExportFrom');
        const tInput = document.getElementById('csvExportTo');
        const endMs = tInput ? new Date(tInput.value).getTime() : Date.now();
        if (fInput && !isNaN(endMs)) {
          fInput.value = this.formatDateTimeLocal(new Date(endMs - 60 * 60 * 1000));
        }
        this.updateCsvExportSummary();
      });
    }

    const setToViewEndBtn = document.getElementById('setToViewEndBtn');
    if (setToViewEndBtn) {
      setToViewEndBtn.addEventListener('click', () => {
        const tInput = document.getElementById('csvExportTo');
        const currentEndMs = Date.now() - (this.scrollOffsetSec * 1000);
        if (tInput) tInput.value = this.formatDateTimeLocal(new Date(currentEndMs));
        this.updateCsvExportSummary();
      });
    }

    const setToNowBtn = document.getElementById('setToNowBtn');
    if (setToNowBtn) {
      setToNowBtn.addEventListener('click', () => {
        const tInput = document.getElementById('csvExportTo');
        if (tInput) tInput.value = this.formatDateTimeLocal(new Date());
        this.updateCsvExportSummary();
      });
    }

    // Input listeners
    const fromIn = document.getElementById('csvExportFrom');
    const toIn = document.getElementById('csvExportTo');
    const filterCb = document.getElementById('csvFilterSynthetic');
    if (fromIn) fromIn.addEventListener('input', () => this.updateCsvExportSummary());
    if (toIn) toIn.addEventListener('input', () => this.updateCsvExportSummary());
    if (filterCb) filterCb.addEventListener('change', () => this.updateCsvExportSummary());

    // Confirm Download Button
    const confirmBtn = document.getElementById('confirmExportCsvBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const fInput = document.getElementById('csvExportFrom');
        const tInput = document.getElementById('csvExportTo');
        const filterCheckbox = document.getElementById('csvFilterSynthetic');
        const syncDbCheckbox = document.getElementById('csvSyncDatabase');

        if (!fInput || !tInput) return;
        const startMs = new Date(fInput.value).getTime();
        const endMs = new Date(tInput.value).getTime();
        const filterSynth = filterCheckbox ? filterCheckbox.checked : true;
        const syncDb = syncDbCheckbox ? syncDbCheckbox.checked : false;

        confirmBtn.disabled = true;
        const originalText = confirmBtn.innerHTML;
        confirmBtn.innerHTML = `<span>Exporting...</span>`;

        try {
          await this.exportHistoryCSVByRange(startMs, endMs, filterSynth, syncDb);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = originalText;
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }

    // Axis toggles
    document.querySelectorAll('[data-axis-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const axis = e.currentTarget.dataset.axisToggle;
        const visible = this.toggleAxis(axis);
        e.currentTarget.classList.toggle('active', visible);
      });
    });
  }
}

// Global instance export
window.edgeSenseCharts = new EdgeSenseCharts();
