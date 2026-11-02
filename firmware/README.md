# EdgeSense — ESP32 Firmware

This directory contains the embedded C/C++ firmware implementation for the **ESP32 DevKit V1**.

## 1. Overview
The firmware is responsible for:
1. High-frequency triaxial acceleration sampling via the **MPU6050** over I2C.
2. Digital temperature reading via the **DS18B20** over Dallas 1-Wire.
3. On-device statistical vector RMS calculation ($RMS = \sqrt{\frac{1}{N} \sum a_i^2}$).
4. On-device 3-sigma Z-score anomaly detection against a moving baseline window.
5. Serving telemetry payloads over local Wi-Fi via an asynchronous HTTP REST server (`GET /data`) with CORS headers.

## 2. Directory Layout
```
firmware/
├── README.md
└── esp32/
    └── edgesense_firmware.ino    # Arduino ESP32 firmware sketch template
```

## 3. Library Dependencies (Arduino IDE / PlatformIO)
Install the following libraries using the Arduino Library Manager:
* **Adafruit MPU6050** (`v2.2.4` or later)
* **Adafruit BusIO** & **Adafruit Unified Sensor**
* **OneWire** (`v2.3.8` by Jim Studt, Paul Stoffregen)
* **DallasTemperature** (`v3.9.0` by Miles Burton)
* **ArduinoJson** (`v6.21.3` by Benoit Blanchon)
* **ESPAsyncWebServer** & **AsyncTCP** (or native `WebServer.h`)

## 4. Setup & Flashing Instructions
1. Open `firmware/esp32/edgesense_firmware.ino` in Arduino IDE.
2. In **Tools > Board**, select **ESP32 Dev Module** (or **DOIT ESP32 DEVKIT V1**).
3. Set Upload Speed to `921600` and Flash Frequency to `80MHz`.
4. Update the Wi-Fi credentials (`WIFI_SSID` and `WIFI_PASSWORD`) in the sketch.
5. Connect your ESP32 via Micro-USB, select the appropriate COM port, and click **Upload**.
6. Open the Serial Monitor at `115200 baud` to view the assigned IP address (e.g. `http://192.168.1.150/data`).
7. Enter this IP address in the **EdgeSense Dashboard Settings** under Hardware Mode.
