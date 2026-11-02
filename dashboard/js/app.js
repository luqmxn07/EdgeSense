/**
 * EdgeSense - Application Entry Point & Router
 * Coordinates page switching, mobile navigation, global event bindings,
 * and component lifecycle bootstrapping.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Subsystems
  if (window.edgeSenseSettings) {
    window.edgeSenseSettings.init();
  }

  if (window.edgeSenseAlerts) {
    window.edgeSenseAlerts.init();
  }

  if (window.edgeSenseDashboard) {
    window.edgeSenseDashboard.init();
  }

  if (window.edgeSenseCharts) {
    window.edgeSenseCharts.init();
  }

  if (window.edgeSenseDataService) {
    window.edgeSenseDataService.start();
  }

  // 2. Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 3. Setup Navigation & Routing
  setupNavigation();

  // 4. Setup Global Header Actions
  setupHeaderActions();

  // 5. Setup Mobile Sidebar Drawer
  setupMobileDrawer();

  console.log('[EdgeSense] Industrial Machine Health Monitoring System Initialized.');
});

/**
 * Handles Tabbed Page Navigation
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-target-view]');
  const pageViews = document.querySelectorAll('.page-view');
  const pageTitle = document.getElementById('headerPageTitle');
  const breadcrumbView = document.getElementById('headerBreadcrumbView');

  const pageTitles = {
    'view-overview': 'Overview & Machine Health',
    'view-machine': 'Machine Monitoring: MOTOR_01',
    'view-analytics': 'Live Telemetry Analytics',
    'view-alerts': 'Alert History & Anomaly Events',
    'view-system': 'System Information & IoT Architecture',
    'view-settings': 'Configuration & Setpoints'
  };

  const breadcrumbNames = {
    'view-overview': 'Overview',
    'view-machine': 'Machine Detail',
    'view-analytics': 'Analytics',
    'view-alerts': 'Alerts',
    'view-system': 'System Info',
    'view-settings': 'Settings'
  };

  function switchPage(targetViewId) {
    // Update active nav class
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.targetView === targetViewId);
    });

    // Update view visibility
    pageViews.forEach(view => {
      const isTarget = view.id === targetViewId;
      view.classList.toggle('active', isTarget);
    });

    // Update header labels
    if (pageTitle && pageTitles[targetViewId]) {
      pageTitle.textContent = pageTitles[targetViewId];
    }
    if (breadcrumbView && breadcrumbNames[targetViewId]) {
      breadcrumbView.textContent = breadcrumbNames[targetViewId];
    }

    // If switching to analytics, trigger Chart.js resize so it fills canvas accurately
    if (targetViewId === 'view-analytics' && window.edgeSenseCharts) {
      setTimeout(() => {
        if (window.edgeSenseCharts.vibrationChart) window.edgeSenseCharts.vibrationChart.resize();
        if (window.edgeSenseCharts.temperatureChart) window.edgeSenseCharts.temperatureChart.resize();
      }, 50);
    }

    // Close mobile drawer if open
    closeMobileDrawer();

    // Re-render Lucide icons for freshly displayed elements
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.dataset.targetView;
      if (targetView) switchPage(targetView);
    });
  });

  // Support direct jump links from banners or buttons
  document.querySelectorAll('[data-jump-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = e.currentTarget.dataset.jumpView;
      if (targetView) switchPage(targetView);
    });
  });
}

/**
 * Top Header Control Binds
 */
function setupHeaderActions() {
  // Manual refresh button
  const refreshBtn = document.getElementById('headerRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      if (window.edgeSenseDataService) {
        window.edgeSenseDataService.tick();
      }
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        if (window.edgeSenseDashboard) {
          window.edgeSenseDashboard.showToast('Telemetry refreshed.', 'info');
        }
      }, 600);
    });
  }

  // Quick Demo Scenario Selector
  const demoPresetSelect = document.getElementById('headerDemoScenarioSelect');
  if (demoPresetSelect) {
    demoPresetSelect.addEventListener('change', (e) => {
      const scenario = e.target.value;
      if (window.edgeSenseDataService) {
        window.edgeSenseDataService.setDemoScenario(scenario);
      }

      const labels = {
        'NORMAL': 'Normal Operation Baseline',
        'WARNING_VIBRATION': 'High Radial Vibration (Warning)',
        'CRITICAL_VIBRATION': 'Severe Bearing Fault (Critical)',
        'OVERHEATING': 'Motor Casing Overheating (Warning)',
        'SENSOR_FAULT': 'MPU6050 Disconnect Simulation'
      };

      if (window.edgeSenseDashboard) {
        window.edgeSenseDashboard.showToast(`Simulation preset: ${labels[scenario] || scenario}`, 'info');
      }
    });
  }

  // Notification Icon click -> jumps to alerts view
  const notifyBtn = document.getElementById('headerNotifyBtn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      const alertsNav = document.querySelector('.nav-item[data-target-view="view-alerts"]');
      if (alertsNav) alertsNav.click();
    });
  }
}

/**
 * Mobile Navigation Drawer
 */
function setupMobileDrawer() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (toggleBtn && sidebar && backdrop) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('active');
    });

    backdrop.addEventListener('click', () => {
      closeMobileDrawer();
    });
  }
}

function closeMobileDrawer() {
  const sidebar = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
}
