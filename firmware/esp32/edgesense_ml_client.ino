/**
 * EdgeSense — ESP32 Random Forest & ML Health Prediction Firmware
 * 
 * Packages 50-sample sliding windows of MPU6050 6-DOF IMU + DS18B20 thermal data,
 * and posts them to the FastAPI /predict endpoint for Random Forest speed classification
 * and Isolation Forest anomaly detection.
 * 
 * Hardware Pin Schedule:
 * - OLED SH1106: Dedicated Hardware I2C0 (Wire)      -> SDA: GPIO 21, SCL: GPIO 22
 * - MPU6050/9250: Dedicated Hardware I2C1 (MPU_Wire) -> SDA: GPIO 26, SCL: GPIO 25
 * - DS18B20 Temp: 1-Wire                             -> DATA: GPIO 4 (with 4.7k pull-up to 3.3V)
 * - Power: 3.3V and GND Rails
 * 
 * Zero external library dependencies: Compiles without ArduinoJson.h
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

// --- FastAPI Random Forest /predict Endpoint ---
// If running locally: "http://192.168.1.100:8000/predict"
// If running on Render: "https://edgesense-backend.onrender.com/predict" or your Render URL
const char* serverUrl = "https://edgesense-5q6k.onrender.com/predict";

// --- Hardware Pin Definitions ---
#define OLED_SDA      21
#define OLED_SCL      22
#define MPU_SDA       26
#define MPU_SCL       25
#define ONE_WIRE_BUS  4      // DS18B20 Data pin on GPIO 4

// --- Display Configuration (SH1106 128x64 on Wire) ---
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_I2C_ADDR 0x3C

Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- Dedicated Second I2C Bus for MPU on Pins 26 & 25 ---
TwoWire MPU_Wire = TwoWire(1);

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
const int MPU_ADDR = 0x68;

// --- 50-Sample ML Window Buffer ---
const int WINDOW_SIZE = 50;
struct SensorSample {
  float ax, ay, az;
  float gx, gy, gz;
  float temp;
};

SensorSample sampleBuffer[WINDOW_SIZE];
int sampleIndex = 0;

// --- Timing Variables ---
unsigned long lastSampleTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastTempRequestTime = 0;
const unsigned long sampleInterval = 20;         // 20ms = 50 Hz sampling cadence
const unsigned long sendInterval = 2500;         // Evaluate ML model every 2.5 seconds
const unsigned long tempInterval = 1000;         // 1-second temperature read cadence

float currentTemp = 25.0;                        // Cached temperature variable

void setup() {
  Serial.begin(115200);
  delay(500);

  // 1. Initialize OLED on dedicated I2C0 (GPIO 21, 22)
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
  display.println(F("EdgeSense AI Boot..."));
  display.display();

  // 2. Initialize MPU on dedicated I2C1 (GPIO 26, 25)
  MPU_Wire.begin(MPU_SDA, MPU_SCL);
  MPU_Wire.setClock(100000);

  MPU_Wire.beginTransmission(MPU_ADDR);
  MPU_Wire.write(0x6B); // Wake up MPU6050
  MPU_Wire.write(0);
  MPU_Wire.endTransmission(true);

  // 3. Initialize DS18B20 in non-blocking mode
  sensors.begin();
  sensors.setWaitForConversion(false); // Non-blocking 1-Wire mode
  sensors.requestTemperatures();       // Initial conversion trigger

  // 4. Connect to Wi-Fi in Station Mode (Clean initialization with timeout)
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
    display.println(F("Starting Local..."));
    display.display();
    delay(1500);
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

  unsigned long currentMillis = millis();

  // 1. Non-blocking DS18B20 Temperature Reading (1000ms cadence)
  if (currentMillis - lastTempRequestTime >= tempInterval) {
    lastTempRequestTime = currentMillis;
    float tempC = sensors.getTempCByIndex(0);
    if (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0 && tempC < 125.0) {
      currentTemp = tempC;
    }
    sensors.requestTemperatures();
  }

  // 2. High-Speed 50 Hz MPU Sampling into ML Rolling Window
  if (currentMillis - lastSampleTime >= sampleInterval) {
    lastSampleTime = currentMillis;

    MPU_Wire.beginTransmission(MPU_ADDR);
    MPU_Wire.write(0x3B);
    MPU_Wire.endTransmission(false);
    MPU_Wire.requestFrom(MPU_ADDR, 14, true);

    int16_t axRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
    int16_t ayRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
    int16_t azRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
    MPU_Wire.read(); MPU_Wire.read(); // Skip die temp
    int16_t gxRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
    int16_t gyRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
    int16_t gzRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());

    // Scale to m/s2 (accelerometer) and deg/s (gyroscope) required by Random Forest
    float ax = (axRaw / 16384.0) * 9.80665;
    float ay = (ayRaw / 16384.0) * 9.80665;
    float az = (azRaw / 16384.0) * 9.80665;
    float gx = (gxRaw / 131.0);
    float gy = (gyRaw / 131.0);
    float gz = (gzRaw / 131.0);

    sampleBuffer[sampleIndex] = {ax, ay, az, gx, gy, gz, currentTemp};
    sampleIndex = (sampleIndex + 1) % WINDOW_SIZE;
  }

  // 3. Dispatch 50-Sample Batch to Random Forest /predict Endpoint
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    // Pre-allocate buffer to prevent memory fragmentation (no ArduinoJson library required)
    String jsonPayload;
    jsonPayload.reserve(4500);

    jsonPayload = "{\"load\":\"NO_LOAD\",\"speed_level\":2,\"accel_unit\":\"m/s2\",\"samples\":[";
    for (int i = 0; i < WINDOW_SIZE; i++) {
      int idx = (sampleIndex + i) % WINDOW_SIZE;
      jsonPayload += "{\"ax\":"; jsonPayload += String(sampleBuffer[idx].ax, 3);
      jsonPayload += ",\"ay\":"; jsonPayload += String(sampleBuffer[idx].ay, 3);
      jsonPayload += ",\"az\":"; jsonPayload += String(sampleBuffer[idx].az, 3);
      jsonPayload += ",\"gx\":"; jsonPayload += String(sampleBuffer[idx].gx, 2);
      jsonPayload += ",\"gy\":"; jsonPayload += String(sampleBuffer[idx].gy, 2);
      jsonPayload += ",\"gz\":"; jsonPayload += String(sampleBuffer[idx].gz, 2);
      jsonPayload += ",\"temp\":"; jsonPayload += String(sampleBuffer[idx].temp, 1);
      jsonPayload += "}";
      if (i < WINDOW_SIZE - 1) jsonPayload += ",";
    }
    jsonPayload += "]}";

    HTTPClient http;
    if (String(serverUrl).startsWith("https")) {
      WiFiClientSecure secureClient;
      secureClient.setInsecure(); // Handles Render SSL without requiring hardcoded certificates
      http.begin(secureClient, serverUrl);
    } else {
      WiFiClient plainClient;
      http.begin(plainClient, serverUrl);
    }

    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("ML Predict Response: " + String(httpResponseCode));

      // Parse Random Forest prediction results from response
      String status = "HEALTHY";
      float score = 100.0;
      String speed = "SPEED_2";

      int statusIdx = response.indexOf("\"status\":");
      if (statusIdx != -1) {
        int q1 = response.indexOf("\"", statusIdx + 9);
        int q2 = response.indexOf("\"", q1 + 1);
        if (q1 != -1 && q2 != -1) {
          status = response.substring(q1 + 1, q2);
        }
      }

      int scoreIdx = response.indexOf("\"health_score\":");
      if (scoreIdx != -1) {
        score = response.substring(scoreIdx + 15).toFloat();
      }

      int speedIdx = response.indexOf("\"speed_detected\":");
      if (speedIdx != -1) {
        int q1 = response.indexOf("\"", speedIdx + 17);
        int q2 = response.indexOf("\"", q1 + 1);
        if (q1 != -1 && q2 != -1) {
          speed = response.substring(q1 + 1, q2);
        }
      }

      Serial.println("Model Result -> Status: " + status + " | Score: " + String(score) + " | Speed: " + speed);

      // 4. Update OLED with Random Forest ML Prediction
      display.clearDisplay();
      display.setCursor(0, 0);
      display.print(F("=== EDGESENSE AI ==="));
      display.setCursor(0, 14);
      display.print(F("Status: ")); display.println(status);
      display.setCursor(0, 28);
      display.print(F("Score:  ")); display.print(score, 1); display.println(F("/100"));
      display.setCursor(0, 42);
      display.print(F("Speed:  ")); display.println(speed);
      display.setCursor(0, 54);
      display.print(F("Temp: ")); display.print(currentTemp, 1); display.print(F(" C"));
      display.display();
    } else {
      Serial.print("HTTP Error: ");
      Serial.println(httpResponseCode);

      // Local fallback display if backend is offline
      display.clearDisplay();
      display.setCursor(0, 0);
      display.print(F("=== EDGESENSE AI ==="));
      display.setCursor(0, 16);
      display.print(F("ML Server Offline"));
      display.setCursor(0, 32);
      display.print(F("Temp: ")); display.print(currentTemp, 1); display.print(F(" C"));
      display.display();
    }
    http.end();
  }
}
