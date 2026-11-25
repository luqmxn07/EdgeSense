/**
 * EdgeSense ESP32 Live Telemetry Firmware (Restored Production Build with Audio Alert System)
 * 
 * Hardware Pin Schedule:
 * - OLED SH1106: Dedicated Hardware I2C0 (Wire)      -> SDA: GPIO 21, SCL: GPIO 22
 * - MPU6050/9250: Dedicated Hardware I2C1 (MPU_Wire) -> SDA: GPIO 26, SCL: GPIO 25
 * - DS18B20 Temp: 1-Wire                             -> DATA: GPIO 4 (with 4.7k pull-up to 3.3V)
 * - Buzzer Alert: PWM / Digital Output               -> (+) to GPIO 18, (-) to GND
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
const char* ssid = "CYBER GHOST";
const char* password = "Ishan 2007";

// --- Cloud Backend Endpoint (feeds Vercel Dashboard) ---
const char* serverUrl = "https://edgesense-5q6k.onrender.com/api/telemetry";

// --- Hardware Pin Definitions ---
#define OLED_SDA      21
#define OLED_SCL      22
#define MPU_SDA       26     // MPU on GPIO 26
#define MPU_SCL       25     // MPU on GPIO 25
#define ONE_WIRE_BUS  4      // DS18B20 Data pin on GPIO 4
#define BUZZER_PIN    18     // Buzzer positive (+) pin on GPIO 18

// --- 6-LED Severity Ladder Pins (Continuous Single-Side Layout) ---
#define LED_G1        13     // Green 1: Baseline running (> 0.02g) on D13
#define LED_G2        12     // Green 2: Low operating speed (> 0.12g) on D12
#define LED_G3        14     // Green 3: Normal full speed (> 0.22g) on D14
#define LED_R1        27     // Red 1: Warning threshold (> 0.35g) on D27
#define LED_R2        33     // Red 2: Elevated vibration (> 0.48g) on D33
#define LED_R3        32     // Red 3: Critical alarm (> 0.60g) on D32

// Set to true if you are using a 2-pin passive buzzer (supports frequency pitch modulation)
// Set to false if you are using a standard active buzzer (HIGH=ON, LOW=OFF)
#define USE_PASSIVE_BUZZER false

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

// --- High-Speed Windowed RMS Sampling & Filter Variables ---
unsigned long lastSampleTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastTempRequestTime = 0;
unsigned long lastDisplayTime = 0;

const unsigned long sampleInterval = 20;         // 20ms = 50 Hz continuous sampling cadence
const unsigned long sendInterval = 2000;         // Send windowed telemetry every 2 seconds
const unsigned long tempInterval = 1000;         // Request temperature every 1 second
const unsigned long displayInterval = 250;       // Update OLED 4 times per second (smooth, non-blocking)

// Static Gravity Vector Tracking (Exponential Moving Average / High-Pass Filter)
float gravX = 0.0, gravY = 0.0, gravZ = -1.0;
bool gravInitialized = false;
const float gravAlpha = 0.96;                    // Low-pass factor: tracks static tilt/orientation while isolating dynamic AC vibration

// Running Window Accumulators (computed over the 2-second telemetry window)
float sumSqX = 0.0;
float sumSqY = 0.0;
float sumSqZ = 0.0;
unsigned long windowSampleCount = 0;

// Cached Telemetry Values
float latestTotalRms = 0.0;
float latestRmsX = 0.0;
float latestRmsY = 0.0;
float latestRmsZ = 0.0;
float currentTemp = 25.0;                        // Cached temperature variable
String currentSysStatus = "HEALTHY";

// --- Non-blocking Buzzer State Machine ---
unsigned long lastBuzzerToggle = 0;
bool buzzerActive = false;

void soundBuzzer(bool on, int freqHz) {
  if (USE_PASSIVE_BUZZER) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
    if (on) { tone(BUZZER_PIN, freqHz); } else { noTone(BUZZER_PIN); }
#else
    if (on) {
      ledcAttachPin(BUZZER_PIN, 0);
      ledcWriteTone(0, freqHz);
    } else {
      ledcWriteTone(0, 0);
      pinMode(BUZZER_PIN, OUTPUT);
      digitalWrite(BUZZER_PIN, LOW);
    }
#endif
  } else {
    // Active Buzzer (Direct Digital Logic)
    digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
  }
}

/**
 * Non-blocking Audio Alert Engine
 * - CRITICAL (Loud / Urgent): Rapid 120ms ON / 80ms OFF loud pulse (2800 Hz resonance peak)
 * - WARNING (Mild): Short gentle 80ms chirp once every 1500ms (900 Hz soft tone)
 * - HEALTHY: Completely silent
 */
void updateBuzzer(String status) {
  unsigned long now = millis();

  if (status == "CRITICAL") {
    // Loud, urgent rapid alarm (120ms ON, 80ms OFF)
    if (buzzerActive) {
      if (now - lastBuzzerToggle >= 120) {
        buzzerActive = false;
        lastBuzzerToggle = now;
        soundBuzzer(false, 0);
      }
    } else {
      if (now - lastBuzzerToggle >= 80) {
        buzzerActive = true;
        lastBuzzerToggle = now;
        soundBuzzer(true, 2800); // 2.8 kHz is the loudest resonant acoustic peak
      }
    }
  } 
  else if (status == "WARNING") {
    // Mild, non-intrusive warning blip (80ms chirp every 1.5 seconds)
    if (buzzerActive) {
      if (now - lastBuzzerToggle >= 80) {
        buzzerActive = false;
        lastBuzzerToggle = now;
        soundBuzzer(false, 0);
      }
    } else {
      if (now - lastBuzzerToggle >= 1500) {
        buzzerActive = true;
        lastBuzzerToggle = now;
        soundBuzzer(true, 900); // 900 Hz gentle alert tone
      }
    }
  } 
  else {
    // Normal / Healthy: Silence buzzer immediately
    if (buzzerActive) {
      buzzerActive = false;
      soundBuzzer(false, 0);
    }
    digitalWrite(BUZZER_PIN, LOW);
  }
}

/**
 * 6-LED Dynamic Severity Ladder
 * - Progressive VU meter for vibration: G1 -> G2 -> G3 -> R1 -> R2 -> R3
 * - CRITICAL: All 3 red LEDs strobe rapidly in sync with acoustic buzzer alarm
 */
void updateLEDs(float rms, String status) {
  if (status == "CRITICAL" || rms >= 0.60) {
    digitalWrite(LED_G1, HIGH);
    digitalWrite(LED_G2, HIGH);
    digitalWrite(LED_G3, HIGH);
    bool blink = ((millis() / 120) % 2 == 0);
    digitalWrite(LED_R1, blink ? HIGH : LOW);
    digitalWrite(LED_R2, blink ? HIGH : LOW);
    digitalWrite(LED_R3, blink ? HIGH : LOW);
    return;
  }

  // Progressive Bargraph thresholds:
  digitalWrite(LED_G1, (rms > 0.02) ? HIGH : LOW);  // G1: Motor active / baseline
  digitalWrite(LED_G2, (rms > 0.12) ? HIGH : LOW);  // G2: Low-medium operating speed
  digitalWrite(LED_G3, (rms > 0.22) ? HIGH : LOW);  // G3: Normal steady speed
  digitalWrite(LED_R1, (rms > 0.35) ? HIGH : LOW);  // R1: Warning threshold exceeded
  digitalWrite(LED_R2, (rms > 0.48) ? HIGH : LOW);  // R2: Elevated vibration / looseness
  digitalWrite(LED_R3, (rms > 0.58) ? HIGH : LOW);  // R3: Near critical
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize Buzzer GPIO
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize 6 LED Severity Ladder GPIOs
  pinMode(LED_G1, OUTPUT);
  pinMode(LED_G2, OUTPUT);
  pinMode(LED_G3, OUTPUT);
  pinMode(LED_R1, OUTPUT);
  pinMode(LED_R2, OUTPUT);
  pinMode(LED_R3, OUTPUT);

  // Quick startup LED sweep to verify each LED connection
  const int testLeds[] = {LED_G1, LED_G2, LED_G3, LED_R1, LED_R2, LED_R3};
  for (int i = 0; i < 6; i++) {
    digitalWrite(testLeds[i], HIGH);
    delay(70);
    digitalWrite(testLeds[i], LOW);
  }
  for (int i = 0; i < 6; i++) digitalWrite(testLeds[i], HIGH);
  delay(150);
  for (int i = 0; i < 6; i++) digitalWrite(testLeds[i], LOW);

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

  // Configure Digital Low Pass Filter (DLPF = 44 Hz) to remove RF noise while preserving motor harmonics
  MPU_Wire.beginTransmission(MPU_ADDR);
  MPU_Wire.write(0x1A);
  MPU_Wire.write(0x03);
  MPU_Wire.endTransmission(true);

  // 3. Initialize DS18B20
  sensors.begin();
  sensors.setWaitForConversion(false); // Non-blocking 1-Wire mode
  sensors.requestTemperatures();       // Initial request

  // Quick boot beep to verify buzzer hardware
  soundBuzzer(true, 1500);
  delay(100);
  soundBuzzer(false, 0);

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

  // 1. Non-blocking DS18B20 Temperature Reading (every 1s)
  if (currentMillis - lastTempRequestTime >= tempInterval) {
    lastTempRequestTime = currentMillis;
    float tempC = sensors.getTempCByIndex(0);
    if (tempC != DEVICE_DISCONNECTED_C && tempC > -50.0 && tempC < 125.0) {
      currentTemp = tempC; 
    }
    sensors.requestTemperatures(); 
  }

  // 2. High-Speed 50 Hz Continuous MPU Sampling (every 20ms)
  if (currentMillis - lastSampleTime >= sampleInterval) {
    lastSampleTime = currentMillis;

    MPU_Wire.beginTransmission(MPU_ADDR);
    MPU_Wire.write(0x3B);
    MPU_Wire.endTransmission(false);
    MPU_Wire.requestFrom(MPU_ADDR, 6, true);

    if (MPU_Wire.available() >= 6) {
      int16_t axRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
      int16_t ayRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());
      int16_t azRaw = (MPU_Wire.read() << 8 | MPU_Wire.read());

      float ax = axRaw / 16384.0;
      float ay = ayRaw / 16384.0;
      float az = azRaw / 16384.0;

      // Initialize static gravity reference vector on first sample
      if (!gravInitialized) {
        gravX = ax;
        gravY = ay;
        gravZ = az;
        gravInitialized = true;
      } else {
        // High-pass filter: Low-pass EMA filter continuously isolates static gravity & mounting tilt
        gravX = gravAlpha * gravX + (1.0 - gravAlpha) * ax;
        gravY = gravAlpha * gravY + (1.0 - gravAlpha) * ay;
        gravZ = gravAlpha * gravZ + (1.0 - gravAlpha) * az;
      }

      // Dynamic AC vibration component (true deviation from static gravity reference)
      float dynX = ax - gravX;
      float dynY = ay - gravY;
      float dynZ = az - gravZ;

      // Accumulate squares over the 2-second continuous window
      sumSqX += (dynX * dynX);
      sumSqY += (dynY * dynY);
      sumSqZ += (dynZ * dynZ);
      windowSampleCount++;
    }
  }

  // 3. Compute True Windowed RMS & Send Telemetry to Cloud API every 2 seconds
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    if (windowSampleCount > 0) {
      latestRmsX = sqrt(sumSqX / windowSampleCount);
      latestRmsY = sqrt(sumSqY / windowSampleCount);
      latestRmsZ = sqrt(sumSqZ / windowSampleCount);
      latestTotalRms = sqrt(latestRmsX * latestRmsX + latestRmsY * latestRmsY + latestRmsZ * latestRmsZ);

      // Clean deadband filter: suppress ambient resting sensor noise floor below 0.010g
      if (latestTotalRms < 0.010) {
        latestTotalRms = 0.0;
        latestRmsX = 0.0;
        latestRmsY = 0.0;
        latestRmsZ = 0.0;
      }

      // Reset window accumulators for next 2-second window
      sumSqX = 0.0;
      sumSqY = 0.0;
      sumSqZ = 0.0;
      windowSampleCount = 0;
    }

    // Health state classification (ISO-10816 Vibration & DS18B20 Temperature)
    if (latestTotalRms > 0.60 || currentTemp > 60.0) {
      currentSysStatus = "CRITICAL";
    } else if (latestTotalRms > 0.35 || currentTemp > 45.0) {
      currentSysStatus = "WARNING";
    } else {
      currentSysStatus = "HEALTHY";
    }

    // Dispatch JSON payload to Render Backend
    String jsonPayload = "{";
    jsonPayload += "\"machine_id\": \"MOTOR_01\",";
    jsonPayload += "\"vibration_rms\":" + String(latestTotalRms, 4) + ",";
    jsonPayload += "\"vibration_x\":" + String(latestRmsX, 4) + ",";
    jsonPayload += "\"vibration_y\":" + String(latestRmsY, 4) + ",";
    jsonPayload += "\"vibration_z\":" + String(latestRmsZ, 4) + ",";
    jsonPayload += "\"casing_temp\":" + String(currentTemp, 2) + ",";
    jsonPayload += "\"status\": \"" + currentSysStatus + "\"";
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

    // Re-align sampling timer after network latency
    lastSampleTime = millis();
  }

  // 4. Non-blocking Buzzer and 6-LED Severity Ladder Update
  updateBuzzer(currentSysStatus);
  updateLEDs(latestTotalRms, currentSysStatus);

  // 5. Update Local SH1106 OLED Display (4 Hz refresh, smooth & non-blocking)
  if (currentMillis - lastDisplayTime >= displayInterval) {
    lastDisplayTime = currentMillis;
    display.clearDisplay();
    display.setCursor(0, 0);
    display.print(F("=== EDGESENSE LOCAL ==="));
    display.setCursor(0, 12);
    display.print(F("RMS: ")); display.print(latestTotalRms, 3); display.print(F(" g"));
    display.setCursor(0, 24);
    display.print(F("Temp: ")); display.print(currentTemp, 1); display.print(F(" C"));
    display.setCursor(0, 36);
    display.print(F("Status: ")); display.print(currentSysStatus);
    display.setCursor(0, 48);
    display.print(F("Cloud: SYNCED"));
    display.display();
  }
}
