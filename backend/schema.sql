-- EdgeSense PostgreSQL Schema
-- Stores time-series motor health telemetry and anomaly alert logs

CREATE TABLE IF NOT EXISTS telemetry_readings (
  id SERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL DEFAULT 'MOTOR_01',
  machine_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
  status_message TEXT,
  vibration_rms DOUBLE PRECISION NOT NULL,
  x_rms DOUBLE PRECISION NOT NULL DEFAULT 0,
  y_rms DOUBLE PRECISION NOT NULL DEFAULT 0,
  z_rms DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_rms DOUBLE PRECISION NOT NULL DEFAULT 0.080,
  vibration_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
  temperature DOUBLE PRECISION NOT NULL,
  temp_trend VARCHAR(20) NOT NULL DEFAULT 'STABLE',
  temp_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
  anomaly_status VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  anomaly_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  anomaly_method TEXT NOT NULL DEFAULT 'Statistical Z-Score (3-Sigma) & Moving RMS Window',
  sensors JSONB NOT NULL DEFAULT '{}'::jsonb,
  system_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_machine_time
  ON telemetry_readings (machine_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id SERIAL PRIMARY KEY,
  alert_code VARCHAR(32) UNIQUE NOT NULL,
  machine_id VARCHAR(50) NOT NULL DEFAULT 'MOTOR_01',
  alert_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_machine_time
  ON anomaly_alerts (machine_id, created_at DESC);

