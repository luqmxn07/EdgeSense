# EdgeSense — Hardware Wiring & Interconnection Guide

## 1. Final Consolidated Pin Connection Schedule

To eliminate I2C bus arbitration collisions and bus capacitance overload between the SH1106 OLED display and the MPU6050/9250 IMU, the ESP32 utilizes two independent hardware I2C controllers (`TwoWire(0)` and `TwoWire(1)`).

---

### A. ESP32 Power & Ground Rails
* **ESP32 3.3V Pin** $\rightarrow$ Breadboard **Positive (3.3V) Power Rail**
* **ESP32 GND Pin** $\rightarrow$ Breadboard **Negative (GND) Ground Rail**

---

### B. SH1106 OLED Display (Hardware I2C0 Bus — `Wire`)
| Component Pin | ESP32 Pin / Rail | Description |
| :--- | :--- | :--- |
| **VCC** | `3V3` Power Rail | 3.3V power supply |
| **GND** | `GND` Ground Rail | Common ground reference |
| **SDA** | **GPIO 21** | Hardware I2C0 Data line (`Wire`) |
| **SCL / SCK** | **GPIO 22** | Hardware I2C0 Clock line (`Wire`) |

---

### C. MPU6050 / MPU9250 6-DOF IMU (Dedicated Hardware I2C1 Bus — `MPU_Wire`)
| Component Pin | ESP32 Pin / Rail | Description |
| :--- | :--- | :--- |
| **VCC** | `3V3` Power Rail | 3.3V power supply |
| **GND** | `GND` Ground Rail | Common ground reference |
| **SDA** | **GPIO 26** | Dedicated Hardware I2C1 Data line (`TwoWire(1)`) |
| **SCL** | **GPIO 25** | Dedicated Hardware I2C1 Clock line (`TwoWire(1)`) |
| **AD0** | `GND` | Sets I2C device address to `0x68` |

---

### D. DS18B20 Digital Temperature Sensor (Dallas 1-Wire Bus)
| Component Wire | ESP32 Pin / Rail | Description |
| :--- | :--- | :--- |
| **Red Wire (VCC)** | `3V3` Power Rail | 3.3V power supply |
| **Black Wire (GND)** | `GND` Ground Rail | Common ground reference |
| **Yellow / White Wire (Data)** | **GPIO 4** | 1-Wire Bidirectional Data bus |
| **4.7kΩ Pull-Up Resistor** | Between **GPIO 4 (Data)** and **3V3 Rail** | **Mandatory pull-up resistor** for 1-Wire protocol |

---

## 2. Sensor Placement & Mounting Guidelines

1. **MPU6050 / MPU9250 Mounting:**
   * Mount firmly on the **drive-end bearing housing** of the DC motor using rigid industrial adhesive or an M3 bolt bracket.
   * Do not use soft foam tape, as soft materials dampen high-frequency vibration signals and introduce measurement distortion.
   * Align the X-axis tangentially (radial vibration) and the Z-axis axially along the motor shaft.

2. **DS18B20 Thermal Probe:**
   * Apply thermal heat-sink paste between the stainless-steel probe tip and the mid-section of the motor stator casing.
   * Secure with a thermal cable tie or clamp to maximize conductive thermal transfer and eliminate ambient convective cooling interference.

3. **Grounding & Noise Mitigation:**
   * Tie all DC grounds (ESP32, motor driver, 12V supply) to a single common star-ground point.
   * Solder a 100nF ceramic capacitor across the DC motor terminals to suppress brush-commutator EMI.
