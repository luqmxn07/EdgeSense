/**
 * EdgeSense — ESP32 Cloud-Connected Telemetry Client Firmware
 *
 * Hardware:
 * - ESP32 DevKit V1
 * - MPU6050 Accelerometer (I2C: SDA=GPIO 21, SCL=GPIO 22)
 * - DS18B20 Temperature Sensor (1-Wire: GPIO 4 with 4.7k pull-up)
 * - SH1106 1.3" I2C OLED Display (128x64, Address 0x3C)
 *
 * Telemetry Protocol:
 * - Direct HTTP POST JSON to Render Cloud Backend:
 *   https://edgesense-5q6k.onrender.com/api/telemetry
 * - Interval: Every 2000ms
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// --- Wi-Fi Credentials ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- Cloud Backend Endpoint ---
const char* serverUrl = "https://edgesense-5q6k.onrender.com/api/telemetry";

// --- Hardware Pin Definitions ---
#define PIN_OLED_SDA  21
#define PIN_OLED_SCL  22
#define ONE_WIRE_BUS  4     // DS18B20 Data pin on GPIO 4

// --- Display Configuration (SH1106 128x64) ---
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_I2C_ADDR 0x3C

Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
const int MPU_ADDR = 0x68;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000; // Send telemetry every 2 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize I2C bus for MPU and SH1106 OLED
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  Wire.setClock(100000);

  // Initialize SH1106 OLED Display
  if (!display.begin(OLED_I2C_ADDR, true)) {
    Serial.println(F("SH1106 allocation failed"));
    for(;;);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.println(F("EdgeSense Booting..."));
  display.display();

  // Initialize MPU Sensor
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  // Initialize DS18B20
  sensors.begin();

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  display.setCursor(0, 16);
  display.print(F("Connecting WiFi..."));
  display.display();
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Connected!");
}

void loop() {
  // Maintain Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); }
  }

  // 1. Read MPU Acceleration Data
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t axRaw = (Wire.read() << 8 | Wire.read());
  int16_t ayRaw = (Wire.read() << 8 | Wire.read());
  int16_t azRaw = (Wire.read() << 8 | Wire.read());

  float ax = axRaw / 16384.0;
  float ay = ayRaw / 16384.0;
  float az = azRaw / 16384.0;
  float vibrationRms = sqrt((ax * ax + ay * ay + az * az) / 3.0);

  // 2. Read DS18B20 Temperature
  sensors.requestTemperatures();
  float casingTemp = sensors.getTempCByIndex(0);
  if (casingTemp == DEVICE_DISCONNECTED_C) {
    casingTemp = 25.0; // Fallback default
  }

  // Determine system status
  String sysStatus = (vibrationRms > 0.6) ? "CRITICAL" : ((vibrationRms > 0.35) ? "WARNING" : "HEALTHY");

  // 3. Update Local SH1106 OLED Display (Live local feed)
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print(F("=== EDGESENSE LOCAL ==="));
  display.setCursor(0, 12);
  display.print(F("RMS: ")); display.print(vibrationRms, 3); display.print(F(" g"));
  display.setCursor(0, 24);
  display.print(F("Temp: ")); display.print(casingTemp, 1); display.print(F(" C"));
  display.setCursor(0, 36);
  display.print(F("Status: ")); display.print(sysStatus);
  display.setCursor(0, 48);
  display.print(F("Cloud: SYNCED"));
  display.display();

  // 4. Send Telemetry to Render Cloud Backend every 2 seconds
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    String jsonPayload = "{";
    jsonPayload += "\"machine_id\": \"MOTOR_01\",";
    jsonPayload += "\"vibration_rms\":" + String(vibrationRms, 4) + ",";
    jsonPayload += "\"vibration_x\":" + String(ax, 4) + ",";
    jsonPayload += "\"vibration_y\":" + String(ay, 4) + ",";
    jsonPayload += "\"vibration_z\":" + String(az, 4) + ",";
    jsonPayload += "\"casing_temp\":" + String(casingTemp, 2) + ",";
    jsonPayload += "\"status\": \"" + sysStatus + "\"";
    jsonPayload += "}";

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
      Serial.println("Telemetry posted successfully to Cloud!");
    } else {
      Serial.print("HTTP POST error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }

  delay(50);
}
