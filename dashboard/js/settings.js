/**
 * EdgeSense - Settings & Configuration Manager
 * Manages threshold setpoints, operating mode (DEMO vs HARDWARE),
 * ESP32 hardware endpoint configuration, and localStorage persistence.
 */

class EdgeSenseSettings {
  constructor() {
    this.defaultSettings = {
      machineName: 'DC Motor Testbench #1',
      machineId: 'MOTOR_01',
      vibrationWarn: 0.35,
      vibrationCrit: 0.60,
      tempWarn: 45.0,
      tempCrit: 60.0,
      pollingIntervalMs: 1000,
      mode: 'DEMO', // 'DEMO' | 'HARDWARE'
      endpointUrl: 'http://192.168.4.1/data',
      enableToasts: true,
      enableAudioChime: false
    };

    this.current = { ...this.defaultSettings };
  }

  init() {
    this.loadFromStorage();
    this.populateForm();
    this.setupEventListeners();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('edgesense_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.current = { ...this.defaultSettings, ...parsed };
      }
    } catch (e) {
      console.warn('[EdgeSense Settings] Error loading localStorage:', e);
      this.current = { ...this.defaultSettings };
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('edgesense_config', JSON.stringify(this.current));
      // Sync into dataService
      if (window.edgeSenseDataService) {
        window.edgeSenseDataService.saveConfig(this.current);
      }
      return true;
    } catch (e) {
      console.error('[EdgeSense Settings] Error saving to localStorage:', e);
      return false;
    }
  }

  populateForm() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('settingMachineName', this.current.machineName);
    setVal('settingMachineId', this.current.machineId);
    setVal('settingVibWarn', this.current.vibrationWarn);
    setVal('settingVibCrit', this.current.vibrationCrit);
    setVal('settingTempWarn', this.current.tempWarn);
    setVal('settingTempCrit', this.current.tempCrit);
    setVal('settingRefreshInterval', this.current.pollingIntervalMs);
    setVal('settingEndpointUrl', this.current.endpointUrl);

    // Numeric display labels
    const vibWarnVal = document.getElementById('vibWarnVal');
    const vibCritVal = document.getElementById('vibCritVal');
    const tempWarnVal = document.getElementById('tempWarnVal');
    const tempCritVal = document.getElementById('tempCritVal');

    if (vibWarnVal) vibWarnVal.textContent = `${this.current.vibrationWarn} g`;
    if (vibCritVal) vibCritVal.textContent = `${this.current.vibrationCrit} g`;
    if (tempWarnVal) tempWarnVal.textContent = `${this.current.tempWarn} °C`;
    if (tempCritVal) tempCritVal.textContent = `${this.current.tempCrit} °C`;

    // Checkboxes
    const toastCheck = document.getElementById('settingEnableToasts');
    const audioCheck = document.getElementById('settingEnableAudio');
    if (toastCheck) toastCheck.checked = !!this.current.enableToasts;
    if (audioCheck) audioCheck.checked = !!this.current.enableAudioChime;

    // Mode Toggle buttons
    this.updateModeSelectorUI(this.current.mode);
  }

  updateModeSelectorUI(mode) {
    const demoBtn = document.getElementById('modeSelectDemo');
    const hwBtn = document.getElementById('modeSelectHw');

    if (demoBtn && hwBtn) {
      if (mode === 'DEMO') {
        demoBtn.classList.add('active', 'demo-active');
        hwBtn.classList.remove('active', 'hw-active');
      } else {
        hwBtn.classList.add('active', 'hw-active');
        demoBtn.classList.remove('active', 'demo-active');
      }
    }

    // Toggle endpoint config visibility or emphasis
    const hwSettingsBox = document.getElementById('hardwareSettingsCard');
    if (hwSettingsBox) {
      hwSettingsBox.style.opacity = mode === 'HARDWARE' ? '1' : '0.85';
    }
  }

  setupEventListeners() {
    // Mode switcher buttons
    const demoBtn = document.getElementById('modeSelectDemo');
    const hwBtn = document.getElementById('modeSelectHw');

    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        this.current.mode = 'DEMO';
        this.updateModeSelectorUI('DEMO');
        this.saveToStorage();
        if (window.edgeSenseDashboard) {
          window.edgeSenseDashboard.showToast('Switched to DEMO MODE (Simulated Sensors)', 'success');
        }
      });
    }

    if (hwBtn) {
      hwBtn.addEventListener('click', () => {
        this.current.mode = 'HARDWARE';
        this.updateModeSelectorUI('HARDWARE');
        this.saveToStorage();
        if (window.edgeSenseDashboard) {
          window.edgeSenseDashboard.showToast('Switched to HARDWARE MODE. Waiting for ESP32 connection...', 'warning');
        }
      });
    }

    // Live slider value synchronizers
    const bindSlider = (sliderId, labelId, suffix, prop) => {
      const slider = document.getElementById(sliderId);
      const label = document.getElementById(labelId);
      if (slider && label) {
        slider.addEventListener('input', (e) => {
          label.textContent = `${e.target.value} ${suffix}`;
          this.current[prop] = parseFloat(e.target.value);
        });
      }
    };

    bindSlider('settingVibWarn', 'vibWarnVal', 'g', 'vibrationWarn');
    bindSlider('settingVibCrit', 'vibCritVal', 'g', 'vibrationCrit');
    bindSlider('settingTempWarn', 'tempWarnVal', '°C', 'tempWarn');
    bindSlider('settingTempCrit', 'tempCritVal', '°C', 'tempCrit');

    // Save Settings form submit
    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.current.machineName = document.getElementById('settingMachineName')?.value || this.defaultSettings.machineName;
        this.current.machineId = document.getElementById('settingMachineId')?.value || this.defaultSettings.machineId;
        this.current.endpointUrl = document.getElementById('settingEndpointUrl')?.value || this.defaultSettings.endpointUrl;
        this.current.pollingIntervalMs = parseInt(document.getElementById('settingRefreshInterval')?.value || 1000, 10);
        this.current.enableToasts = document.getElementById('settingEnableToasts')?.checked ?? true;
        this.current.enableAudioChime = document.getElementById('settingEnableAudio')?.checked ?? false;

        this.saveToStorage();

        if (window.edgeSenseDashboard) {
          window.edgeSenseDashboard.showToast('Settings saved successfully.', 'success');
        }
      });
    }

    // Reset Defaults
    const resetBtn = document.getElementById('resetSettingsBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all EdgeSense settings to factory defaults?')) {
          this.current = { ...this.defaultSettings };
          this.saveToStorage();
          this.populateForm();
          if (window.edgeSenseDashboard) {
            window.edgeSenseDashboard.showToast('Configuration reset to defaults.', 'warning');
          }
        }
      });
    }

    // Test ESP32 Connection Button
    const testBtn = document.getElementById('testEsp32ConnBtn');
    const resultBox = document.getElementById('testConnResultBox');

    if (testBtn && resultBox) {
      testBtn.addEventListener('click', async () => {
        const url = document.getElementById('settingEndpointUrl')?.value || this.current.endpointUrl;
        
        resultBox.className = 'conn-test-box show testing';
        resultBox.innerHTML = `
          <span class="status-dot warning pulse"></span>
          <span>Attempting HTTP GET connection to <strong>${url}</strong>...</span>
        `;

        const result = await window.edgeSenseDataService.testHardwareConnection(url);

        if (result.success) {
          resultBox.className = 'conn-test-box show success';
          resultBox.innerHTML = `
            <span class="status-dot healthy"></span>
            <span>${result.message}</span>
          `;
        } else {
          resultBox.className = 'conn-test-box show error';
          resultBox.innerHTML = `
            <span class="status-dot critical"></span>
            <div>
              <div style="font-weight: 600;">ESP32 Hardware Disconnected</div>
              <div style="font-size: 0.72rem; margin-top: 2px;">${result.message}</div>
            </div>
          `;
        }
      });
    }
  }
}

// Global instance export
window.edgeSenseSettings = new EdgeSenseSettings();
