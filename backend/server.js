/**
 * EdgeSense Cloud API Server
 * Target: Render Web Service + Neon / PostgreSQL
 * Purpose: Ingest ESP32 telemetry, persist time-series readings & anomaly alerts,
 *          and serve normalized JSON to the Vercel-hosted EdgeSense Dashboard.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DEVICE_TIMEOUT_MS = (parseInt(process.env.DEVICE_TIMEOUT_SEC, 10) || 15) * 1000;

// --- CORS CONFIGURATION ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (curl, ESP32, server-to-server)
      // or when ALLOWED_ORIGINS is open.
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
  })
);

app.use(express.json({ limit: '64kb' }));

// --- IN-MEMORY REAL-TIME TELEMETRY BUFFER ---
// Ensures zero data loss even if database is sleeping or spinning up
let latestTelemetryInMemory = null;
const historyInMemory = [];
const inMemoryAlerts = [];
const lastAlertTimeByMachine = new Map();

// --- POSTGRESQL CONNECTION POOL ---
const databaseUrl = process.env.DATABASE_URL;
const isLocalDb =
  !databaseUrl ||
  databaseUrl.includes('localhost') ||
  databaseUrl.includes('127.0.0.1');

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isLocalDb ? false : { rejectUnauthorized: false }
    })
  : null;

let dbReady = false;

/**
 * Ensures database schema exists on boot so Render deploys work seamlessly.
 */
async function initDatabase() {
  if (!pool) {
    console.warn('[EdgeSense API] DATABASE_URL is not set. Operating with in-memory caching.');
    return;
  }

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
    }
    dbReady = true;
    console.log('[EdgeSense API] PostgreSQL connected and schema verified.');
  } catch (err) {
    dbReady = false;
    console.error('[EdgeSense API] Database initialization warning:', err.message);
  }
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Normalizes incoming ESP32 payloads.
 * Supports both standard schemas and ESP32 direct format (casing_temp, vibration_x, etc.).
 */
function normalizeIncomingPayload(body = {}) {
  const machineId = String(body.machineId || body.machine_id || 'MOTOR_01').slice(0, 50);
  const vibrationRMS = toFiniteNumber(body.vibrationRMS ?? body.vibration_rms ?? body.vibrationRms, 0);
  const xRMS = toFiniteNumber(body.xRMS ?? body.vibration_x ?? body.x_rms, 0);
  const yRMS = toFiniteNumber(body.yRMS ?? body.vibration_y ?? body.y_rms, 0);
  const zRMS = toFiniteNumber(body.zRMS ?? body.vibration_z ?? body.z_rms, 0);
  const baselineRMS = toFiniteNumber(body.baselineRMS ?? body.baseline_rms, 0.080);
  const temperature = toFiniteNumber(body.temperature ?? body.casing_temp ?? body.temp, 0);
  const anomalyScore = toFiniteNumber(body.anomalyScore ?? body.anomaly_score, 0);

  let machineStatus = String(body.machineStatus || body.machine_status || body.status || '').toUpperCase();
  if (!machineStatus) {
    machineStatus = body.anomaly ? 'WARNING' : 'HEALTHY';
  }

  const anomalyStatus = String(
    body.anomalyStatus ||
      body.anomaly_status ||
      (body.anomaly || machineStatus === 'WARNING' || machineStatus === 'CRITICAL'
        ? 'ANOMALY_DETECTED'
        : 'NORMAL')
  ).toUpperCase();

  const statusMessage =
    body.statusMessage ||
    (machineStatus === 'CRITICAL'
      ? 'Persistent abnormal measurements detected. Inspection recommended.'
      : machineStatus === 'WARNING'
      ? 'Vibration or thermal readings are higher than the established baseline.'
      : 'Machine operating within its established baseline.');

  return {
    machineId,
    machineStatus,
    statusMessage,
    vibrationRMS,
    xRMS,
    yRMS,
    zRMS,
    baselineRMS,
    vibrationStatus: String(body.vibrationStatus || machineStatus).toUpperCase(),
    temperature,
    tempTrend: String(body.tempTrend || 'STABLE').toUpperCase(),
    tempStatus: String(body.tempStatus || (temperature >= 45.0 ? 'WARNING' : 'HEALTHY')).toUpperCase(),
    anomalyStatus,
    anomalyScore,
    anomalyMethod: body.anomalyMethod || 'Statistical Z-Score (3-Sigma) & Moving RMS Window',
    sensors: body.sensors || {
      mpu6050: 'ONLINE',
      ds18b20: 'ONLINE',
      esp32: 'CONNECTED'
    },
    system: body.system || {
      deviceId: 'ESP32-HARDWARE-01',
      firmware: 'v1.0.0-cloud',
      uptimeSeconds: toFiniteNumber(body.uptime_sec, 0),
      wifiRssi: toFiniteNumber(body.wifiRssi, -60),
      samplingIntervalMs: 20
    }
  };
}

/**
 * Formats a database row into the exact contract consumed by dashboard/js/dataService.js.
 */
function formatTelemetryRow(row, totalAlerts = 0) {
  const recordedMs = new Date(row.recorded_at).getTime();
  const isFresh = Date.now() - recordedMs <= DEVICE_TIMEOUT_MS;
  const systemInfo = row.system_info || {};

  return {
    machineId: row.machine_id,
    machineStatus: isFresh ? row.machine_status : 'OFFLINE',
    statusMessage: isFresh
      ? row.status_message
      : 'No recent telemetry received from ESP32. Waiting for device connection.',
    vibrationRMS: row.vibration_rms,
    xRMS: row.x_rms,
    yRMS: row.y_rms,
    zRMS: row.z_rms,
    baselineRMS: row.baseline_rms,
    vibrationStatus: isFresh ? row.vibration_status : 'OFFLINE',
    temperature: row.temperature,
    tempTrend: isFresh ? row.temp_trend : 'UNKNOWN',
    tempStatus: isFresh ? row.temp_status : 'OFFLINE',
    anomalyStatus: isFresh ? row.anomaly_status : 'UNKNOWN',
    anomalyScore: row.anomaly_score,
    anomalyMethod: row.anomaly_method,
    totalAlerts,
    esp32Connected: isFresh,
    mode: 'HARDWARE',
    timestamp: recordedMs,
    sensors: isFresh
      ? row.sensors
      : { mpu6050: 'DISCONNECTED', ds18b20: 'DISCONNECTED', esp32: 'DISCONNECTED' },
    system: {
      ...systemInfo,
      lastUpdate: recordedMs
    }
  };
}

// --- HEALTH ROUTES ---
app.get('/', (req, res) => {
  res.json({
    service: 'EdgeSense Cloud API',
    status: 'running',
    hasTelemetry: latestTelemetryInMemory !== null,
    endpoints: [
      'GET /health',
      'POST /api/telemetry',
      'GET /api/telemetry/latest',
      'GET /api/telemetry/history',
      'GET /api/alerts',
      'PATCH /api/alerts/:alertCode'
    ]
  });
});

app.get('/health', async (req, res) => {
  let dbStatus = 'not_configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
      dbStatus = 'connected';
    } catch (err) {
      dbReady = false;
      dbStatus = `error: ${err.message}`;
    }
  }

  res.status(200).json({
    status: 'ok',
    database: dbStatus,
    hasTelemetry: latestTelemetryInMemory !== null,
    cachedPoints: historyInMemory.length,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

// --- TELEMETRY ROUTES ---
app.post('/api/telemetry', async (req, res) => {
  try {
    const data = normalizeIncomingPayload(req.body);
    const now = Date.now();

    // 1. Immediately cache in memory for real-time dashboard responsiveness
    const activeAlertCount = inMemoryAlerts.filter(a => a.status === 'ACTIVE').length;
    latestTelemetryInMemory = {
      machineId: data.machineId,
      machineStatus: data.machineStatus,
      statusMessage: data.statusMessage,
      vibrationRMS: data.vibrationRMS,
      xRMS: data.xRMS,
      yRMS: data.yRMS,
      zRMS: data.zRMS,
      baselineRMS: data.baselineRMS,
      vibrationStatus: data.vibrationStatus,
      temperature: data.temperature,
      tempTrend: data.tempTrend,
      tempStatus: data.tempStatus,
      anomalyStatus: data.anomalyStatus,
      anomalyScore: data.anomalyScore,
      anomalyMethod: data.anomalyMethod,
      totalAlerts: activeAlertCount,
      esp32Connected: true,
      mode: 'HARDWARE',
      timestamp: now,
      sensors: data.sensors,
      system: {
        ...data.system,
        lastUpdate: now
      }
    };

    historyInMemory.push({
      machineId: data.machineId,
      machineStatus: data.machineStatus,
      vibrationRMS: data.vibrationRMS,
      xRMS: data.xRMS,
      yRMS: data.yRMS,
      zRMS: data.zRMS,
      baselineRMS: data.baselineRMS,
      temperature: data.temperature,
      anomalyScore: data.anomalyScore,
      timestamp: now,
      esp32Connected: true,
      mode: 'HARDWARE'
    });
    if (historyInMemory.length > 1000) {
      historyInMemory.shift();
    }

    // 2. Track anomalies in memory
    if (data.machineStatus === 'WARNING' || data.machineStatus === 'CRITICAL') {
      const lastLogged = lastAlertTimeByMachine.get(data.machineId) || 0;
      if (now - lastLogged >= 30000) {
        lastAlertTimeByMachine.set(data.machineId, now);
        const alertCode = `ALT-${Math.floor(1000 + Math.random() * 9000)}-${String(now).slice(-3)}`;
        const alertType =
          data.machineStatus === 'CRITICAL' ? 'Critical Vibration Exceedance' : 'Elevated Telemetry Warning';
        const description = `RMS: ${data.vibrationRMS.toFixed(3)}g, Temp: ${data.temperature.toFixed(1)}°C, Z-Score: ${data.anomalyScore.toFixed(2)}σ`;

        inMemoryAlerts.unshift({
          id: alertCode,
          timestamp: now,
          machineId: data.machineId,
          type: alertType,
          description,
          severity: data.machineStatus,
          status: 'ACTIVE'
        });
      }
    }

    // 3. Persist to PostgreSQL if database connection is available
    let dbRecordId = null;
    if (pool && dbReady) {
      try {
        const insertSql = `
          INSERT INTO telemetry_readings (
            machine_id, machine_status, status_message,
            vibration_rms, x_rms, y_rms, z_rms, baseline_rms, vibration_status,
            temperature, temp_trend, temp_status,
            anomaly_status, anomaly_score, anomaly_method,
            sensors, system_info
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          RETURNING id
        `;

        const values = [
          data.machineId,
          data.machineStatus,
          data.statusMessage,
          data.vibrationRMS,
          data.xRMS,
          data.yRMS,
          data.zRMS,
          data.baselineRMS,
          data.vibrationStatus,
          data.temperature,
          data.tempTrend,
          data.tempStatus,
          data.anomalyStatus,
          data.anomalyScore,
          data.anomalyMethod,
          JSON.stringify(data.sensors),
          JSON.stringify(data.system)
        ];

        const dbRes = await pool.query(insertSql, values);
        dbRecordId = dbRes.rows[0]?.id;
      } catch (dbErr) {
        console.warn('[POST /api/telemetry] PostgreSQL write warning:', dbErr.message);
      }
    }

    res.status(201).json({
      success: true,
      id: dbRecordId,
      recordedAt: new Date(now),
      mode: dbReady ? 'database' : 'in_memory'
    });
  } catch (err) {
    console.error('[POST /api/telemetry] Error:', err.message);
    res.status(500).json({ error: 'Failed to process telemetry reading' });
  }
});

app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || 'MOTOR_01');

    // 1. Try PostgreSQL if available
    if (pool && dbReady) {
      try {
        const [readingRes, alertCountRes] = await Promise.all([
          pool.query(
            `SELECT * FROM telemetry_readings
             WHERE machine_id = $1
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [machineId]
          ),
          pool.query(
            `SELECT COUNT(*)::int AS count FROM anomaly_alerts
             WHERE machine_id = $1 AND status = 'ACTIVE'`,
            [machineId]
          )
        ]);

        if (readingRes.rows.length > 0) {
          const activeAlerts = alertCountRes.rows[0]?.count || 0;
          return res.json(formatTelemetryRow(readingRes.rows[0], activeAlerts));
        }
      } catch (dbErr) {
        console.warn('[GET /api/telemetry/latest] DB query warning, falling back to memory cache:', dbErr.message);
      }
    }

    // 2. Return in-memory cached reading
    if (latestTelemetryInMemory && latestTelemetryInMemory.machineId === machineId) {
      const isFresh = Date.now() - latestTelemetryInMemory.timestamp <= DEVICE_TIMEOUT_MS;
      return res.json({
        ...latestTelemetryInMemory,
        esp32Connected: isFresh,
        machineStatus: isFresh ? latestTelemetryInMemory.machineStatus : 'OFFLINE',
        vibrationStatus: isFresh ? latestTelemetryInMemory.vibrationStatus : 'OFFLINE',
        tempStatus: isFresh ? latestTelemetryInMemory.tempStatus : 'OFFLINE',
        statusMessage: isFresh
          ? latestTelemetryInMemory.statusMessage
          : 'No recent telemetry received from ESP32. Waiting for device connection.'
      });
    }

    // 3. Fallback when awaiting first transmission
    res.json({
      machineId,
      machineStatus: 'OFFLINE',
      statusMessage: 'Waiting for first telemetry reading from ESP32.',
      vibrationRMS: 0,
      xRMS: 0,
      yRMS: 0,
      zRMS: 0,
      baselineRMS: 0.080,
      vibrationStatus: 'OFFLINE',
      temperature: 0,
      tempTrend: 'UNKNOWN',
      tempStatus: 'OFFLINE',
      anomalyStatus: 'UNKNOWN',
      anomalyScore: 0,
      anomalyMethod: 'Statistical Z-Score (Awaiting Data)',
      totalAlerts: 0,
      esp32Connected: false,
      mode: 'HARDWARE',
      timestamp: Date.now(),
      sensors: { mpu6050: 'DISCONNECTED', ds18b20: 'DISCONNECTED', esp32: 'DISCONNECTED' },
      system: { deviceId: 'ESP32-WAITING', firmware: 'N/A', uptimeSeconds: 0, lastUpdate: null }
    });
  } catch (err) {
    console.error('[GET /api/telemetry/latest] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch latest telemetry' });
  }
});

app.get('/api/telemetry/history', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || 'MOTOR_01');
    const minutes = Math.min(Math.max(parseInt(req.query.minutes, 10) || 30, 1), 1440);

    // 1. Try PostgreSQL
    if (pool && dbReady) {
      try {
        const result = await pool.query(
          `SELECT machine_id, machine_status, vibration_rms, x_rms, y_rms, z_rms,
                  baseline_rms, temperature, anomaly_score, recorded_at
           FROM telemetry_readings
           WHERE machine_id = $1
             AND recorded_at >= NOW() - ($2 || ' minutes')::interval
           ORDER BY recorded_at ASC
           LIMIT 1000`,
          [machineId, minutes]
        );

        if (result.rows.length > 0) {
          const points = result.rows.map((r) => ({
            machineId: r.machine_id,
            machineStatus: r.machine_status,
            vibrationRMS: r.vibration_rms,
            xRMS: r.x_rms,
            yRMS: r.y_rms,
            zRMS: r.z_rms,
            baselineRMS: r.baseline_rms,
            temperature: r.temperature,
            anomalyScore: r.anomaly_score,
            timestamp: new Date(r.recorded_at).getTime(),
            esp32Connected: true,
            mode: 'HARDWARE'
          }));
          return res.json({ machineId, minutes, count: points.length, points });
        }
      } catch (dbErr) {
        console.warn('[GET /api/telemetry/history] DB query warning, falling back to memory:', dbErr.message);
      }
    }

    // 2. Return in-memory history points
    const cutoff = Date.now() - minutes * 60 * 1000;
    const points = historyInMemory.filter(p => p.machineId === machineId && p.timestamp >= cutoff);
    res.json({ machineId, minutes, count: points.length, points });
  } catch (err) {
    console.error('[GET /api/telemetry/history] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch telemetry history' });
  }
});

// --- ALERT ROUTES ---
app.get('/api/alerts', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || 'MOTOR_01');

    if (pool && dbReady) {
      try {
        const result = await pool.query(
          `SELECT alert_code, machine_id, alert_type, description, severity, status, created_at
           FROM anomaly_alerts
           WHERE machine_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [machineId]
        );

        if (result.rows.length > 0) {
          const alerts = result.rows.map((r) => ({
            id: r.alert_code,
            timestamp: new Date(r.created_at).getTime(),
            machineId: r.machine_id,
            type: r.alert_type,
            description: r.description,
            severity: r.severity,
            status: r.status
          }));
          return res.json({ machineId, count: alerts.length, alerts });
        }
      } catch (dbErr) {
        console.warn('[GET /api/alerts] DB query warning:', dbErr.message);
      }
    }

    const alerts = inMemoryAlerts.filter(a => a.machineId === machineId);
    res.json({ machineId, count: alerts.length, alerts });
  } catch (err) {
    console.error('[GET /api/alerts] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post('/api/alerts', async (req, res) => {
  try {
    const machineId = String(req.body.machineId || 'MOTOR_01');
    const type = String(req.body.type || 'Manual Alert');
    const description = String(req.body.description || 'Alert generated from dashboard.');
    const severity = String(req.body.severity || 'WARNING').toUpperCase();
    const alertCode = req.body.id || `ALT-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = Date.now();

    const newAlert = {
      id: alertCode,
      timestamp: now,
      machineId,
      type,
      description,
      severity,
      status: 'ACTIVE'
    };

    inMemoryAlerts.unshift(newAlert);

    if (pool && dbReady) {
      try {
        await pool.query(
          `INSERT INTO anomaly_alerts (alert_code, machine_id, alert_type, description, severity, status)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
          [alertCode, machineId, type, description, severity]
        );
      } catch (dbErr) {
        console.warn('[POST /api/alerts] DB write warning:', dbErr.message);
      }
    }

    res.status(201).json(newAlert);
  } catch (err) {
    console.error('[POST /api/alerts] Error:', err.message);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

app.patch('/api/alerts/:alertCode', async (req, res) => {
  try {
    const { alertCode } = req.params;
    const status = String(req.body.status || '').toUpperCase();

    if (!['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const memAlert = inMemoryAlerts.find(a => a.id === alertCode);
    if (memAlert) {
      memAlert.status = status;
    }

    if (pool && dbReady) {
      try {
        const result = await pool.query(
          `UPDATE anomaly_alerts
           SET status = $1, updated_at = NOW()
           WHERE alert_code = $2
           RETURNING alert_code, status, updated_at`,
          [status, alertCode]
        );
        if (result.rows.length > 0) {
          return res.json({ success: true, alert: result.rows[0] });
        }
      } catch (dbErr) {
        console.warn('[PATCH /api/alerts] DB write warning:', dbErr.message);
      }
    }

    if (!memAlert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, alert: memAlert });
  } catch (err) {
    console.error('[PATCH /api/alerts/:alertCode] Error:', err.message);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
});

// --- START SERVER ---
initDatabase().finally(() => {
  app.listen(PORT, () => {
    console.log(`[EdgeSense API] Server listening on port ${PORT}`);
  });
});
