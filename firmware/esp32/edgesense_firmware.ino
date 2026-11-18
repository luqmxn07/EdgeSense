/**
 * EdgeSense ESP32 Live Telemetry Firmware (Restored Production Build)
 * 
 * Hardware Pin Schedule:
 * - OLED SH1106: Dedicated Hardware I2C0 (Wire)      -> SDA: GPIO 21, SCL: GPIO 22
 * - MPU6050/9250: Dedicated Hardware I2C1 (MPU_Wire) -> SDA: GPIO 26, SCL: GPIO 25
 * - DS18B20 Temp: 1-Wire                             -> DATA: GPIO 4 (with 4.7k pull-up to 3.3V)
 * - Power: 3.3V and GND Rails
 * 
 * Target: Render Cloud Backend (feeds live Vercel Dashboard)
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
const char* ssid = "rubythroat";
const char* password = "alfa1234beta5678";

// --- Cloud Backend Endpoint (feeds Vercel Dashboard) ---
const char* serverUrl = "https://edgesense-5q6k.onrender.com/api/telemetry";

// --- Hardware Pin Definitions ---
#define OLED_SDA      21
#define OLED_SCL      22
#define MPU_SDA       26     // MPU on GPIO 26
#define MPU_SCL       25     // MPU on GPIO 25
#define ONE_WIRE_BUS  4      // DS18B20 Data pin on GPIO 4

// --- Display Configuration (SH1106 128x64 on Wire) ---
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_I2C_ADDR 0x3C

Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- Second I2C Bus for MPU on Pins 26 & 25 ---
TwoWire MPU_Wire = TwoWire(1);

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
const int MPU_ADDR = 0x68;

unsigned long lastSendTime = 0;
unsigned long lastTempRequestTime = 0;
const unsigned long sendInterval = 2000;         // Send telemetry every 2 seconds
const unsigned long tempInterval = 1000;         // Request temperature every 1 second

float currentTemp = 25.0;                        // Cached temperature variable

void setup() {
  Serial.begin(115200);
  delay(1000);

  // 1. Initialize OLED on default I2C (GPIO 21, 22)
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

  // 2. Initialize MPU on second I2C (GPIO 26, 25)
  MPU_Wire.begin(MPU_SDA, MPU_SCL);
  MPU_Wire.setClock(100000);

  MPU_Wire.beginTransmission(MPU_ADDR);
  MPU_Wire.write(0x6B); // Wake up MPU
  MPU_Wire.write(0);
  MPU_Wire.endTransmission(true);

  // 3. Initialize DS18B20
  sensors.begin();
  sensors.setWaitForConversion(false); // Non-blocking 1-Wire mode
  sensors.requestTemperatures();       // Initial request

  // 4. Connect to Wi-Fi
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  delay(100);
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

  unsigned long currentMillis = millis();

  // 1. Non-blocking DS18B20 Temperature Reading
  if (currentMillis - lastTempRequestTime >= tempInterval) {
    lastTempRequestTime = currentMillis;
    float tempC = sensors.getTempCByIndex(0);
    if (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0 && tempC < 125.0) {
      currentTemp = tempC; 
    }
    sensors.requestTemperatures(); 
  }

  // 2. Read MPU Acceleration Data using MPU_Wire on pins 26/25
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
  
  // Calculate true 3D vector magnitude and subtract 1.0g gravity baseline
  float totalMagnitude = sqrt(ax * ax + ay * ay + az * az);
  float vibrationRms = abs(totalMagnitude - 1.0);

  // Apply deadband filter to eliminate minor sensor noise when stationary
  if (vibrationRms < 0.01) {
    vibrationRms = 0.0;
  }

  String sysStatus = (vibrationRms > 0.6) ? "CRITICAL" : ((vibrationRms > 0.35) ? "WARNING" : "HEALTHY");

  // 3. Update Local SH1106 OLED Display (Restored exact previous screen)
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print(F("=== EDGESENSE LOCAL ==="));
  display.setCursor(0, 12);
  display.print(F("RMS: ")); display.print(vibrationRms, 3); display.print(F(" g"));
  display.setCursor(0, 24);
  display.print(F("Temp: ")); display.print(currentTemp, 1); display.print(F(" C"));
  display.setCursor(0, 36);
  display.print(F("Status: ")); display.print(sysStatus);
  display.setCursor(0, 48);
  display.print(F("Cloud: SYNCED"));
  display.display();

  // 4. Send Telemetry to Cloud API every 2 seconds
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    String jsonPayload = "{";
    jsonPayload += "\"machine_id\": \"MOTOR_01\",";
    jsonPayload += "\"vibration_rms\":" + String(vibrationRms, 4) + ",";
    jsonPayload += "\"vibration_x\":" + String(ax, 4) + ",";
    jsonPayload += "\"vibration_y\":" + String(ay, 4) + ",";
    jsonPayload += "\"vibration_z\":" + String(az, 4) + ",";
    jsonPayload += "\"casing_temp\":" + String(currentTemp, 2) + ",";
    jsonPayload += "\"status\": \"" + sysStatus + "\"";
    jsonPayload += "}";

    HTTPClient http;
    WiFiClientSecure client;
    client.setInsecure(); // Handles Render SSL without requiring certificate thumbprints

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
      Serial.println("Telemetry posted successfully to Cloud!");
    } else {
      Serial.print("HTTP Error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }

  delay(50);
}
