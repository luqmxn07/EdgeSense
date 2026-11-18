// Drop this into your dashboard. `readings` = last 50-100 MPU6050 samples.
async function getMotorHealth(readings, speedLevel, load) {
  const res = await fetch("http://YOUR_SERVER:8000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" /* , "X-API-Key": "..." */ },
    body: JSON.stringify({
      samples: readings,          // [{ax,ay,az,gx,gy,gz,temp}, ...]  (Acel_X.. names also work)
      speed_level: speedLevel,    // 0 OFF, 1 LOW, 2 MEDIUM, 3 HIGH  (what the dashboard selected)
      load: load,                 // "NO_LOAD" | "ON_LOAD"
      accel_unit: "m/s2",         // use "g" if your firmware sends g
      sample_rate_hz: 10          // optional: enables heating-rate check
    }),
  });
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();              // {status, health_score, summary, recommendation, reasons, ...}
}
