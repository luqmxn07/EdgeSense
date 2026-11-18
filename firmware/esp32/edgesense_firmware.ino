/**
 * EdgeSense — ESP32 Dual-Bus Production Firmware
 * 
 * Hardware Pin Schedule:
 * - OLED SH1106: Dedicated Hardware I2C0 (Wire) -> SDA: GPIO 21, SCL: GPIO 22
 * - MPU6050/9250: Dedicated Hardware I2C1 (MPU_Wire) -> SDA: GPIO 26, SCL: GPIO 25
 * - DS18B20 Temp Probe: 1-Wire -> DATA: GPIO 4 (with 4.7k pull-up to 3.3V)
 * - Power: 3.3V and GND Rails
 *
 * Cloud API Endpoint:
 * - https://edgesense-5q6k.onrender.com/api/telemetry (Feeds Live Vercel Dashboard)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// --- Wi-Fi Credentials ---
const char* ssid = "V2029";
const char* password = "97019701";

// --- Live Cloud Backend Endpoint ---
const char* serverUrl = "https://edgesense-5q6k.onrender.com/api/telemetry";

// --- Hardware Pin Definitions ---
// 1. OLED Display (Hardware I2C0 Bus)
#define OLED_SDA      21
#define OLED_SCL      22

// 2. MPU6050 / MPU9250 (Dedicated Hardware I2C1 Bus)
#define MPU_SDA       26
#define MPU_SCL       25

// 3. DS18B20 Digital Temperature Sensor (1-Wire Bus)
#define ONE_WIRE_BUS  4      // GPIO 4 with 4.7k pull-up to 3.3V

// --- Display Configuration (SH1106 128x64, I2C 0x3C) ---
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_I2C_ADDR 0x3C

Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
TwoWire MPU_Wire = TwoWire(1); // Dedicated hardware I2C controller 1

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
const int MPU_ADDR = 0x68;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000; // Send telemetry every 2 seconds

void setup() {
  Serial.begin(115200);
  delay(500);

  // 1. Initialize Dedicated I2C Bus 0 for OLED (GPIO 21, 22)
  Wire.begin(OLED_SDA, OLED_SCL);
  Wire.setClock(100000);

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

  // 2. Initialize Dedicated I2C Bus 1 for MPU (GPIO 26, 25)
  MPU_Wire.begin(MPU_SDA, MPU_SCL);
  MPU_Wire.setClock(100000);

  // Wake up MPU on MPU_Wire
  MPU_Wire.beginTransmission(MPU_ADDR);
  MPU_Wire.write(0x6B); // PWR_MGMT_1
  MPU_Wire.write(0);    // Wake up
  MPU_Wire.endTransmission(true);

  // 3. Initialize DS18B20 Temperature Sensor
  sensors.begin();

  // 4. Connect to Wi-Fi in Station Mode (Clean initialization)
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  delay(100);
  WiFi.begin(ssid, password);

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);

  display.setCursor(0, 16);
  display.print(F("Connecting WiFi..."));
  display.display();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    attempts++;
    Serial.print(".");
    display.print(".");
    display.display();
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Connected!");
    display.println(F("WiFi Connected!"));
    display.setCursor(0, 16);
    display.print(F("IP: "));
    display.println(WiFi.localIP());
    display.display();
    delay(1000);
  } else {
    Serial.println("\nWi-Fi Timeout!");
    display.println(F("WiFi Timeout!"));
    display.setCursor(0, 16);
    display.println(F("Continuing Offline..."));
    display.display();
    delay(2000);
  }
}

void loop() {
  // Auto-reconnect if Wi-Fi drops
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 4000) {
      delay(250);
    }
  }

  // 1. Read MPU Acceleration Data from dedicated MPU_Wire
  MPU_Wire.beginTransmission(MPU_ADDR);
  MPU_Wire.write(0x3B);
  MPU_Wire.endTransmission(false);
  MPU_Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t axRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
  int16_t ayRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
  int16_t azRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());

  float ax = axRaw / 16384.0;
  float ay = ayRaw / 16384.0;
  float az = azRaw / 16384.0;
  float vibrationRms = sqrt((ax * ax + ay * ay + az * az) / 3.0);

  // 2. Read DS18B20 Casing Temperature
  sensors.requestTemperatures();
  float casingTemp = sensors.getTempCByIndex(0);
  if (casingTemp == DEVICE_DISCONNECTED_C || casingTemp < -40.0) {
    casingTemp = 28.0; // Fallback default
  }

  // Determine system status
  String sysStatus = (vibrationRms > 0.6) ? "CRITICAL" : ((vibrationRms > 0.35) ? "WARNING" : "HEALTHY");

  // 3. Update Local SH1106 OLED Display (on dedicated Wire)
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print(F("=== EDGESENSE LOCAL ==="));
  display.setCursor(0, 12);
  display.print(F("RMS:  ")); display.print(vibrationRms, 4); display.print(F(" g"));
  display.setCursor(0, 24);
  display.print(F("Temp: ")); display.print(casingTemp, 1); display.print(F(" C"));
  display.setCursor(0, 36);
  display.print(F("Stat: ")); display.print(sysStatus);
  display.setCursor(0, 48);
  display.print(F("Cloud: LIVE SYNC"));
  display.display();

  // 4. Send Telemetry to Cloud Backend every 2 seconds
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    String jsonPayload = "{";
    jsonPayload += "\"machine_id\":\"MOTOR_01\",";
    jsonPayload += "\"vibration_rms\":" + String(vibrationRms, 4) + ",";
    jsonPayload += "\"vibration_x\":" + String(ax, 4) + ",";
    jsonPayload += "\"vibration_y\":" + String(ay, 4) + ",";
    jsonPayload += "\"vibration_z\":" + String(az, 4) + ",";
    jsonPayload += "\"casing_temp\":" + String(casingTemp, 2) + ",";
    jsonPayload += "\"status\":\"" + sysStatus + "\"";
    jsonPayload += "}";

    HTTPClient http;
    WiFiClientSecure client;
    client.setInsecure(); // Handles Render SSL without requiring hardcoded certificates

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.println("Telemetry posted to Cloud! HTTP Code: " + String(httpResponseCode));
    } else {
      Serial.print("HTTP Error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }

  delay(50);
}
