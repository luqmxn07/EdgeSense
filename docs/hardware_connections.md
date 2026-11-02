# EdgeSense — Hardware Wiring & Interconnection Guide

## 1. Pin Assignment Table

### A. MPU6050 Accelerometer & Gyroscope (I2C Bus)
| MPU6050 Pin | ESP32 Pin | Function | Notes |
| :--- | :--- | :--- | :--- |
| **VCC** | `3V3` | Power Supply | 3.3V power (ensure clean decoupling) |
| **GND** | `GND` | Ground Reference | Common ground |
| **SCL** | `GPIO 22` | I2C Clock | Default hardware I2C SCL |
| **SDA** | `GPIO 21` | I2C Data | Default hardware I2C SDA |
| **AD0** | `GND` | Address Select | Sets I2C address to `0x68` |
| **INT** | `GPIO 19` | Hardware Interrupt | Optional data-ready interrupt |

### B. DS18B20 Digital Temperature Sensor (Dallas 1-Wire Bus)
| DS18B20 Pin | ESP32 Pin | Function | Notes |
| :--- | :--- | :--- | :--- |
| **VCC (Red)** | `3V3` | Power Supply | 3.0V – 5.5V operating range |
| **GND (Black)** | `GND` | Ground Reference | Common ground |
| **DATA (Yellow/White)**| `GPIO 4` | 1-Wire Bidirectional Data | **Requires 4.7kΩ pull-up resistor to 3V3** |

### C. L298N Motor Driver & DC Motor
| L298N Terminal | Connected Component | Function |
| :--- | :--- | :--- |
| **12V In** | External 12V DC Supply | Motor power line (do NOT power from ESP32!) |
| **GND** | External Supply GND & ESP32 GND | **Common ground must be tied together** |
| **5V Out** | NC / Optional Logic | Unused if ESP32 is powered via USB |
| **IN1** | `GPIO 25` | Direction control pin A |
| **IN2** | `GPIO 26` | Direction control pin B |
| **ENA** | `GPIO 27` (LEDC PWM) | Motor speed regulation via PWM |
| **OUT1 & OUT2**| DC Motor Terminals | High-torque brushed DC motor |

---

## 2. Sensor Placement & Mechanical Mounting Recommendations

1. **MPU6050 Mounting:**
   * Mount firmly on the **drive-end bearing housing** of the DC motor using rigid industrial adhesive or an M3 bolt bracket.
   * Do not use soft foam tape, as soft materials dampen high-frequency vibration signals and introduce measurement distortion.
   * Align the X-axis tangentially (radial rotation) and the Z-axis axially along the shaft center line.

2. **DS18B20 Thermal Probe:**
   * Apply thermal heat-sink paste between the stainless-steel probe tip and the mid-section of the motor stator casing.
   * Secure with a thermal cable tie or clamp to maximize conductive thermal transfer and eliminate ambient convective cooling interference.

3. **Grounding & Noise Mitigation:**
   * Tie all DC grounds (ESP32, L298N, 12V power supply) to a single star-ground point to avoid inductive ground bounce from motor brush sparking.
   * Solder a 100nF ceramic capacitor across the DC motor terminals to suppress brush-commutator EMI.
