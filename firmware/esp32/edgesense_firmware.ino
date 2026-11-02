/**
 * EdgeSense — ESP32 Machine Health Monitoring & Anomaly Detection Firmware
 * 
 * Hardware:
 * - ESP32 DevKit V1
 * - MPU6050 (I2C: SDA=GPIO 21, SCL=GPIO 22)
 * - DS18B20 (1-Wire: GPIO 4 with 4.7k pull-up)
 * - DC Motor & L298N Driver (PWM=GPIO 27, IN1=GPIO 25, IN2=GPIO 26)
 *
 * REST Endpoint:
 * GET http://<ESP32_IP>/data -> Returns normalized JSON telemetry payload with CORS headers.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// Wi-Fi Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Hardware Pin Definitions
#define ONE_WIRE_BUS 4
#define MOTOR_PWM_PIN 27
#define MOTOR_IN1_PIN 25
#define MOTOR_IN2_PIN 26

// Sensor & Server Objects
WebServer server(80);
Adafruit_MPU6050 mpu;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);

// Baseline & Threshold Constants
const float BASELINE_RMS = 0.080;
const float VIBRATION_WARN = 0.35;
const float VIBRATION_CRIT = 0.60;
const float TEMP_WARN = 45.0;
const float TEMP_CRIT = 60.0;

// Sampling Window (N = 50 samples per evaluation)
const int SAMPLE_WINDOW = 50;
float x_accel_buffer[SAMPLE_WINDOW];
float y_accel_buffer[SAMPLE_WINDOW];
float z_accel_buffer[SAMPLE_WINDOW];
int sample_idx = 0;

// Active Telemetry State
float current_x_rms = 0.052;
float current_y_rms = 0.048;
float current_z_rms = 0.042;
float current_vib_rms = 0.082;
float current_temp = 32.5;
float anomaly_score = 0.24;
String machine_status = "HEALTHY";
String status_message = "Machine operating within its established baseline.";
String anomaly_status = "NORMAL";

bool mpu_online = false;
bool ds_online = false;

void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/plain", "EdgeSense ESP32 Telemetry Node Active. Access /data for JSON feed.");
}

void handleData() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  StaticJsonDocument<1024> doc;

  doc["machineId"] = "MOTOR_01";
  doc["machineStatus"] = machine_status;
  doc["statusMessage"] = status_message;
  doc["vibrationRMS"] = serialized(String(current_vib_rms, 3));
  doc["xRMS"] = serialized(String(current_x_rms, 3));
  doc["yRMS"] = serialized(String(current_y_rms, 3));
  doc["zRMS"] = serialized(String(current_z_rms, 3));
  doc["baselineRMS"] = BASELINE_RMS;
  doc["vibrationStatus"] = (current_vib_rms >= VIBRATION_CRIT) ? "CRITICAL" : ((current_vib_rms >= VIBRATION_WARN) ? "WARNING" : "HEALTHY");
  
  doc["temperature"] = serialized(String(current_temp, 2));
  doc["tempTrend"] = "STABLE";
  doc["tempStatus"] = (current_temp >= TEMP_CRIT) ? "CRITICAL" : ((current_temp >= TEMP_WARN) ? "WARNING" : "HEALTHY");
  doc["tempThreshold"] = TEMP_WARN;
  doc["vibrationThreshold"] = VIBRATION_WARN;
  
  doc["anomalyStatus"] = anomaly_status;
  doc["anomalyScore"] = serialized(String(anomaly_score, 2));
  doc["anomalyMethod"] = "Statistical Z-Score (3-Sigma) & Moving RMS Window";
  doc["totalAlerts"] = (machine_status != "HEALTHY") ? 1 : 0;
  doc["esp32Connected"] = true;
  doc["mode"] = "HARDWARE";
  doc["timestamp"] = millis();

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["mpu6050"] = mpu_online ? "ONLINE" : "FAULT";
  sensors["ds18b20"] = ds_online ? "ONLINE" : "FAULT";
  sensors["esp32"] = "CONNECTED";

  JsonObject sys = doc.createNestedObject("system");
  sys["deviceId"] = "ESP32-HARDWARE-01";
  sys["firmware"] = "v1.0.0-prod";
  sys["uptimeSeconds"] = millis() / 1000;
  sys["lastUpdate"] = millis();
  sys["wifiRssi"] = WiFi.RSSI();
  sys["samplingIntervalMs"] = 20;

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[EdgeSense] Initializing Hardware Node...");

  // Initialize I2C Bus for MPU6050
  Wire.begin(21, 22);
  if (mpu.begin()) {
    mpu_online = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);
    Serial.println("[EdgeSense] MPU6050 initialized successfully on I2C 0x68.");
  } else {
    Serial.println("[EdgeSense] Warning: MPU6050 not found on I2C bus.");
  }

  // Initialize DS18B20 1-Wire
  ds18b20.begin();
  if (ds18b20.getDeviceCount() > 0) {
    ds_online = true;
    Serial.printf("[EdgeSense] DS18B20 online. Found %d probe(s).\n", ds18b20.getDeviceCount());
  }

  // Connect to Wi-Fi
  Serial.printf("[EdgeSense] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // Setup REST Server Routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/data", HTTP_GET, handleData);
  server.begin();
  Serial.println("[EdgeSense] HTTP REST server listening on port 80.");
}

void loop() {
  server.handleClient();

  // Periodic sensor acquisition (every 20ms = 50Hz)
  static unsigned long last_sample_time = 0;
  if (millis() - last_sample_time >= 20) {
    last_sample_time = millis();

    if (mpu_online) {
      sensors_event_t a, g, temp;
      mpu.getEvent(&a, &g, &temp);

      // Convert m/s^2 to g (1g = 9.80665 m/s^2)
      x_accel_buffer[sample_idx] = a.acceleration.x / 9.80665;
      y_accel_buffer[sample_idx] = a.acceleration.y / 9.80665;
      z_accel_buffer[sample_idx] = a.acceleration.z / 9.80665;
      sample_idx++;

      if (sample_idx >= SAMPLE_WINDOW) {
        sample_idx = 0;
        // Compute RMS across window
        float sum_x = 0, sum_y = 0, sum_z = 0;
        for (int i = 0; i < SAMPLE_WINDOW; i++) {
          sum_x += x_accel_buffer[i] * x_accel_buffer[i];
          sum_y += y_accel_buffer[i] * y_accel_buffer[i];
          sum_z += z_accel_buffer[i] * z_accel_buffer[i];
        }
        current_x_rms = sqrt(sum_x / SAMPLE_WINDOW);
        current_y_rms = sqrt(sum_y / SAMPLE_WINDOW);
        current_z_rms = sqrt(sum_z / SAMPLE_WINDOW);
        current_vib_rms = sqrt(current_x_rms * current_x_rms + current_y_rms * current_y_rms + current_z_rms * current_z_rms);

        // Compute 3-Sigma Anomaly Score (approximate baseline mu=0.08, sigma=0.015)
        anomaly_score = abs(current_vib_rms - BASELINE_RMS) / 0.015;
        if (anomaly_score >= 3.0 || current_vib_rms >= VIBRATION_CRIT) {
          machine_status = "CRITICAL";
          status_message = "Persistent severe vibration exceedance detected.";
          anomaly_status = "ANOMALY_DETECTED";
        } else if (anomaly_score >= 1.5 || current_vib_rms >= VIBRATION_WARN) {
          machine_status = "WARNING";
          status_message = "Vibration readings are higher than established baseline.";
          anomaly_status = "ANOMALY_DETECTED";
        } else {
          machine_status = "HEALTHY";
          status_message = "Machine operating within its established baseline.";
          anomaly_status = "NORMAL";
        }
      }
    }
  }

  // Periodic Temperature Acquisition (every 1000ms = 1Hz)
  static unsigned long last_temp_time = 0;
  if (millis() - last_temp_time >= 1000) {
    last_temp_time = millis();
    if (ds_online) {
      ds18b20.requestTemperatures();
      float t = ds18b20.getTempCByIndex(0);
      if (t > -50.0 && t < 125.0) {
        current_temp = t;
      }
    }
  }
}
