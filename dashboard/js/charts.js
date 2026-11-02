/**
 * EdgeSense - Charts & Visualisation Module
 * Powered by Chart.js (Dark Industrial SCADA theme)
 */

class EdgeSenseCharts {
  constructor() {
    this.vibrationChart = null;
    this.temperatureChart = null;
    this.overviewPreviewChart = null;

    this.selectedTimeRangeMin = 5; // default 5 minutes
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

    this.createOverviewPreviewChart();
    this.createVibrationChart();
    this.createTemperatureChart();
    this.setupEventListeners();
  }

  formatTimeLabel(timestamp) {
    const d = new Date(timestamp);
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * 1. Overview Page: Mini Telemetry Dual-Trend Chart
   */
  createOverviewPreviewChart() {
    const ctx = document.getElementById('overviewTelemetryChart');
    if (!ctx) return;

    const history = window.edgeSenseDataService.getHistory(15);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));
    const vibData = history.map(h => h.vibrationRMS);
    const tempData = history.map(h => h.temperature);

    this.overviewPreviewChart = new Chart(ctx, {
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
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            yAxisID: 'yVib'
          },
          {
            label: 'Casing Temp (°C)',
            data: tempData,
            borderColor: '#F59E0B',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0.3,
            fill: false,
            pointRadius: 0,
            yAxisID: 'yTemp'
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
            labels: { color: '#94A3B8', font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { maxTicksLimit: 8, color: '#64748B' }
          },
          yVib: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Vibration (g)', color: '#22D3EE', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            min: 0,
            suggestedMax: 0.5
          },
          yTemp: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Temp (°C)', color: '#F59E0B', font: { size: 10 } },
            grid: { drawOnChartArea: false },
            suggestedMin: 25,
            suggestedMax: 55
          }
        }
      }
    });
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

    // Refresh history based on active time range
    const history = window.edgeSenseDataService.getHistory(this.selectedTimeRangeMin);
    const labels = history.map(h => this.formatTimeLabel(h.timestamp));

    // Update Overview chart if exists
    if (this.overviewPreviewChart) {
      const overviewHistory = window.edgeSenseDataService.getHistory(15);
      this.overviewPreviewChart.data.labels = overviewHistory.map(h => this.formatTimeLabel(h.timestamp));
      this.overviewPreviewChart.data.datasets[0].data = overviewHistory.map(h => h.vibrationRMS);
      this.overviewPreviewChart.data.datasets[1].data = overviewHistory.map(h => h.temperature);
      this.overviewPreviewChart.update('none');
    }

    // Update Vibration Analytics Chart
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

    // Update Temperature Analytics Chart
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

  exportHistoryCSV() {
    const history = window.edgeSenseDataService.getHistory(this.selectedTimeRangeMin);
    if (!history.length) return;

    let csv = 'Timestamp,ISO_Time,Machine_ID,Vibration_RMS_g,X_RMS_g,Y_RMS_g,Z_RMS_g,Temp_C,Status,Mode\n';
    history.forEach(row => {
      const iso = new Date(row.timestamp).toISOString();
      csv += `${row.timestamp},"${iso}","${row.machineId}",${row.vibrationRMS},${row.xRMS || 0},${row.yRMS || 0},${row.zRMS || 0},${row.temperature},"${row.machineStatus || 'HEALTHY'}","${row.mode}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `EdgeSense_MOTOR_01_Telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      exportBtn.addEventListener('click', () => this.exportHistoryCSV());
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
