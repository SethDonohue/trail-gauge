# TrailGauge Technical Specification — Rev B

Oct 20, 2026 · @Seth

## Review summary

Rev A is a sound concept, but it would not survive a vehicle's electrical environment, its heading field overflows, and neither code listing works as written. Rev B fixes six critical and nine high-severity defects, adds the missing requirements, and moves the wired sensor backbone from I2C to CAN.

| # | Severity | Area | Defect in Rev A | Rev B fix |
| --- | --- | --- | --- | --- |
| 1 | Critical | Power | MP2315 is rated to 24 V input and LM2596 to 40 V; neither survives a load dump, and there is no fuse, reverse-polarity or TVS protection. | Protected front end + 60 V-class automotive buck (§3) |
| 2 | Critical | BLE packet | `compass_heading` is int16 × 100, so any heading above 327.67° overflows (359.99° = 35999 > 32767). | uint16 centidegrees (§7) |
| 3 | Critical | Firmware | Engine temp is read with `analogRead()` and Arduino Uno math (5 V, 10-bit, LM35 scaling), but the specified sensor is a digital 1-Wire DS18B20, and the ESP32-S3 ADC is 12-bit with a \~3.1 V ceiling. | Non-blocking DS18B20 driver over RMT 1-Wire (§6) |
| 4 | Critical | App | `View` and `StyleSheet` are imported from `react`; the file does not compile. | Import from `react-native` (§8) |
| 5 | Critical | App | "Double-tap" is `onTouchEnd`, so every single touch toggles views; swipe is not implemented; `ENGINE_TEMP` (index 3) is unreachable. | Gesture Handler tap/fling, configurable group (§8) |
| 6 | Critical | Sensors | Pitch, roll and heading are core gauges, but no IMU or magnetometer exists in the design. | 6-axis IMU + magnetometer on the hub (§4) |
| 7 | High | Network | I2C is listed as a remote-node link; it is a board-level bus (400 pF limit) and fails on engine-bay cable runs. | CAN 2.0B backbone via the S3's TWAI controller (§5) |
| 8 | High | Firmware | Attitude is "filtered" with an EMA: accelerometer tilt is corrupted by vehicle acceleration, an EMA on heading breaks at the 359°→0° wrap, and vibration aliasing cannot be removed after sampling. | Gyro/accel fusion, circular heading filter, IMU anti-alias DLPF + mechanical isolation (§6) |
| 9 | High | Sensors | DS18B20 needs 750 ms per 12-bit conversion, so a 50 Hz loop is meaningless; its 125 °C ceiling is below hot oil temperatures. | 1 Hz sampling; thermistor or thermocouple option for oil (§4) |
| 10 | High | Firmware | EMA state starts at 0.0 (gauge ramps up from zero at boot); `vTaskDelay` drifts; the shared struct is written and read across tasks without synchronization. | Seed from first sample, `xTaskDelayUntil`, queue/mutex hand-off (§6) |
| 11 | High | Sensors | "True course bearing" conflates magnetic heading, true heading and GPS course over ground; a magnetic phone mount also ruins the phone's compass. | Defined heading semantics, declination from phone GPS (§4) |
| 12 | High | Network | US 915 MHz LoRa at 125 kHz bandwidth must frequency-hop under FCC 15.247; "cuts through metallic barriers" is not physically true; no isolation between vehicles in a convoy. | LoRa demoted to optional, 500 kHz BW, network ID + encryption (§5) |
| 13 | High | BLE | No pairing or bonding, so anyone in range can connect; no version or sequence field; endianness unspecified; status bits undefined; "modular XOR" checksum is self-contradictory and redundant with the BLE link-layer CRC. | Rev B GATT + packet (§7) |
| 14 | High | Thermal | An under-dash hub in a parked vehicle sees high cabin temperatures; some ESP32-S3 module variants are rated to only 65 °C ambient. | Module temperature grade requirement (§1, §3) |
| 15 | High | Power | No ignition sense or sleep state, so the hub drains the battery of a vehicle parked for weeks. | Ignition-sense wake, quiescent-current budget (§3) |
| 16 | Medium | App | Skia is claimed but unused; pushing 25 Hz BLE data through React state re-renders the tree. | Reanimated shared values drive Skia on the UI thread (§8) |
| 17 | Medium | App | No stale-data indication; a dropped link shows the last value as if live. | Staleness timeout + visual state (§8) |
| 18 | Medium | Sensors | Barometric altitude has no reference pressure; it drifts roughly 8 m per hPa of weather change. | GPS-referenced QNH calibration (§4) |
| 19 | Medium | Process | No requirements, environmental targets, or test plan. | §1, §9 |
| 20 | Low | Editorial | "Use code with caution" paste artifacts; MPS and TI parts listed under one vendor; field names imply degrees but carry scaled values. | Cleaned up throughout |

## 1. Scope and requirements

TrailGauge is a read-only, aftermarket telemetry display: it measures and shows, and never writes to vehicle systems or drives an actuator. Every requirement below has a target number and a verification method, so each one can pass or fail.

**Goals**

- Show attitude (pitch, roll), heading, altitude, engine and ambient temperature, and battery voltage on an Android phone at a glance.
- Survive a 12 V vehicle electrical environment, engine-bay heat and off-road vibration without field failures.
- Let users add remote sensor nodes without re-flashing the hub.

**Non-goals**

- Not a safety system. Tilt alerts are advisory; the app must not claim to predict rollover, which depends on vehicle, load and dynamics.
- No transmission onto the vehicle's own CAN bus. An OBD-II listen-only input is a future option (§10).
- 24 V trucks are out of scope for Rev B; the front end is sized so a 24 V variant needs only a TVS and capacitor change.

**System requirements**

| ID | Requirement | Target | Verified by |
| --- | --- | --- | --- |
| R-01 | Supply range, operating | 6–16 V continuous; clean brownout reset below 6 V (cold crank) | Bench sweep, crank profile |
| R-02 | Supply transients, survival | Suppressed load dump, reverse battery −14 V for 60 s, jump start +24 V for 60 s (ISO 16750-2 profiles) | Transient generator |
| R-03 | Ignition-off current | ≤ 0.5 mA total for hub + all wired nodes | DMM on battery feed, 1 h soak |
| R-04 | Hub operating ambient | −30 °C to +85 °C | Thermal chamber |
| R-05 | Node operating ambient | −40 °C to +105 °C; IP67 | Chamber, immersion |
| R-06 | Vibration | ISO 16750-3 random profile (passenger-car body for hub, engine-adjacent for nodes) | Shaker table |
| R-07 | Pitch / roll accuracy | ±0.5° static; ±2° during 0.3 g lateral manoeuvres | Tilt table, drive test vs. reference IMU |
| R-08 | Heading accuracy | ±3° after in-vehicle calibration, engine running | Drive test vs. GNSS course on straight segments |
| R-09 | Relative altitude | ±3 m drift over 1 h at a fixed location | Parked log vs. weather station |
| R-10 | Temperature accuracy | ±1 °C coolant, ±0.5 °C ambient | Reference thermometer |
| R-11 | Attitude latency | ≤ 100 ms sensor-to-pixel, p95 | High-speed camera on tilt step |
| R-12 | Render rate | 60 FPS sustained, < 1% dropped frames over 30 min | Android GPU profiler |
| R-13 | Link recovery | Reconnect ≤ 5 s after hub power-up or link loss; stale data flagged within 500 ms | Scripted power cycling |
| R-14 | Link security | LE Secure Connections bonding; unbonded centrals rejected | Connection attempt from unbonded phone |
| R-15 | Emissions | CISPR 25 conducted and radiated limits, class agreed before EVT (target class 3) | Pre-scan, then accredited lab |
| R-16 | Firmware update | Signed OTA over BLE with A/B rollback | Interrupted-update test |

## 2. System architecture

Rev B keeps the hub-and-spoke shape but changes the spokes: wired remote nodes share one CAN bus, LoRa serves only nodes that cannot be wired, and the hub's own IMU and barometer produce every fast-changing value.

![TrailGauge Rev B system architecture](architecture.svg)

Remote nodes report slow channels over CAN (or LoRa), the hub fuses and filters everything, and the phone displays it and contributes GNSS-derived references through control writes.

- **One source of truth per quantity.** Attitude and heading come only from the hub's rigidly mounted IMU and magnetometer. Rev A allowed either the hub or the phone, which would give two answers depending on how the phone sat in its mount.
- **The phone is a display plus GNSS.** It supplies position, speed, QNH and magnetic declination; it never computes attitude.
- **Nodes are plug-and-play.** A new node announces itself on CAN and its channels appear in the app without a hub firmware change (§5, §7).

## 3. Power subsystem

Rev B replaces both Rev A regulators with a protected front end and a 60 V automotive buck producing a single 3.3 V rail. Rev A's choice of a switcher over an LM7805 was correct; its parts were not rated for the vehicle.

| Regulator | Input range | Verdict |
| --- | --- | --- |
| [MP2315](https://docs.rs-online.com/28eb/A700000013717006.pdf) (Rev A) | 4.5–24 V, 28 V absolute max | Rejected: destroyed by any surge above 28 V, including a jump start with a 24 V pack |
| LM2596 module (Rev A) | Up to 40 V | Rejected: no margin over a clamped load dump; 150 kHz switching puts harmonics in the AM band; clone modules are common |
| [LMR36015-Q1](https://www.ti.com/product/LMR36015-Q1) (Rev B) | 4.2–60 V, 66 V transient, 1.5 A, AEC-Q100 | Selected. Use the 2.1 MHz variant so the switching frequency sits above the AM broadcast band. LMR38020-Q1 (to 80 V, 2 A) is the drop-in if more margin is wanted |

**Front-end chain, battery to rail**

1. **Fused tap.** 2 A blade fuse at the tap point, within 150 mm of the source. The hub takes constant battery (for voltage monitoring and sleep) plus a separate ignition-sense wire.
2. **Reverse polarity.** Ideal-diode controller driving an N-channel FET (e.g. TI LM74700-Q1). A Schottky diode's \~0.4 V drop costs too much headroom during cold crank.
3. **Transient clamp.** Unidirectional TVS with standoff ≥ 24 V, so a jump start does not conduct, and a clamp voltage below the buck's 60 V rating at the expected surge current (SM8S-class part; confirm against the load-dump profile in R-02).
4. **Input filter.** π filter (ceramic, ferrite or inductor, ceramic) plus ≥ 47 µF bulk, sized for CISPR 25 conducted emissions.
5. **Buck.** LMR36015-Q1 to 3.3 V. At 3.3 V out it stays in regulation through cold crank down to roughly 4.5 V in; Rev A's 5 V rail would have dropped out.
6. **Node power switch.** Automotive smart high-side switch feeding the 12 V pair in the CAN harness, so remote nodes are unpowered with ignition off and a shorted harness trips a current limit instead of a fuse.

**Rails.** Every Rev B part runs at 3.3 V (ESP32-S3, IMU, barometer, CAN transceiver, optional RFM95W), so the 5 V rail is deleted. Budget ≤ 250 mA at 3.3 V on the hub, about 70 mA from a 13.8 V battery.

**Ignition sense and sleep.** The ignition line passes through a divider and clamp to an RTC-capable GPIO. On ignition off, the hub waits a configurable grace period (default 60 s), cuts node power, and enters deep sleep. The battery-voltage divider is switched by a FET so it draws nothing in sleep. This meets R-03 (≤ 0.5 mA), which matters for vehicles parked for weeks between trips.

**Battery voltage.** The switched divider feeds an ADC1 channel, corrected with the chip's factory calibration (`esp_adc_cali`). Battery voltage is added to the telemetry stream (§7); it is the most useful electrical gauge on a trail rig with a winch.

**Module temperature grade.** Use ESP32-S3-WROOM-1-N8 or -N16 (rated −40 to 85 °C), or -H4 (to 105 °C). Do not use the -R8 octal-PSRAM variants: [Espressif's datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) rates them to 65 °C ambient, or 85 °C only with PSRAM ECC enabled and reduced PSRAM. The hub needs no PSRAM. Use the -1U variant with an external antenna if the hub sits behind a metal dash frame.

**Assembly.** Acrylic or silicone conformal coat on hub and node boards; strain-relieved, keyed connectors; no unsupported tall parts (bulk capacitors glued or snapped-in).

## 4. Sensors, mounting and calibration

Rev B adds the IMU and magnetometer that Rev A's gauges depended on but never specified, moves ambient temperature outside the cabin, and gives altitude a pressure reference. The hub's fixed-mount IMU is the single source of truth for attitude; the phone contributes only GNSS.

| Measurand | Rev A | Rev B part | Location | Output rate | Why |
| --- | --- | --- | --- | --- | --- |
| Pitch, roll | Not specified | 6-axis IMU with on-chip anti-alias filter (TDK ICM-42688-P class) | Hub, rigid-mounted on isolators | 200 Hz internal, 25 Hz to phone | Gyro + accel fusion is required; tilt from the accelerometer alone reads wrong whenever the vehicle accelerates or turns |
| Heading | Not specified | 3-axis magnetometer (MEMSIC MMC5983MA class) | Hub first; a separate CAN "mag puck" if R-08 is missed | 50 Hz internal, 25 Hz to phone | Phone compasses are unusable in magnetic mounts and in a steel cab |
| Altitude | BME280 | BMP390 class barometer | Hub, vented enclosure with membrane | 25 Hz | Lower pressure noise than BME280; humidity channel was unused |
| Ambient temp | BME280 in the hub | DS18B20 probe on a CAN node | Outside, shaded, away from radiator and exhaust (e.g. behind the bumper) | 1 Hz | A hub sensor reads cabin air plus its own self-heating, not ambient |
| Coolant temp | DS18B20 strapped to a hose | 2-wire automotive NTC sender in an inline hose adapter, read ratiometrically on a CAN node | Upper radiator hose | 1 Hz | A strapped probe reads hose surface with lag; DS18B20 is specified to ±0.5 °C only from −10 to +85 °C, below normal coolant temperature |
| Oil / trans temp (option) | None | K-type thermocouple with a MAX31856 converter, or NTC sender | Pan or line adapter | 1 Hz | Hot oil exceeds the DS18B20's 125 °C ceiling |
| Battery voltage | None | Hub ADC, switched divider (§3) | Hub | 5 Hz | Cheapest high-value gauge on a winch-equipped rig |
| Cabin temp | None | Barometer's internal sensor | Hub | 1 Hz | Free; labelled "cabin", never "ambient" |

**Heading semantics.** Rev A's "true course bearing" conflated three different quantities. Rev B defines them:

- *Magnetic heading*: where the vehicle points, from the calibrated magnetometer. Sent by the hub.
- *True heading*: magnetic heading plus declination. The app computes declination from the phone's GNSS position using the World Magnetic Model; the hub never needs position.
- *Course over ground*: direction of travel from GNSS. Valid only above about 5 km/h, so it is useless while crawling. Used as a slow correction to magnetometer bias when moving straight, never as the displayed heading.

The gauge shows true heading by default with a "T" marker; the user can switch to magnetic ("M").

**IMU mounting.** The hub mounts on silicone isolators whose resonance sits above the 0–5 Hz attitude band and below the dominant engine and road vibration; the isolator is validated on a shaker (R-06). The IMU's internal digital low-pass filter is set below half its output data rate so vibration cannot alias into the attitude band. No software filter can remove aliasing after sampling.

**Attitude zero.** The hub may be mounted in any orientation. Calibration step 1: park on level ground and tap "Zero level"; the hub stores the mounting rotation. Step 2: drive straight and brake firmly once; the deceleration vector defines the vehicle's forward axis. The rotation is stored in NVS and sent in the device-info characteristic so the app can display it.

**Magnetometer calibration.** Drive two slow full circles with the engine running and normal electrical load (lights, fans on). The hub fits hard- and soft-iron corrections to an ellipsoid and stores them. The hub reports a calibration quality figure (field-magnitude spread); the app prompts recalibration when it degrades, or after accessories such as a winch or light bar are added.

**Altitude reference.** Barometric altitude drifts with weather at roughly 8 m per hPa near sea level. The app derives a reference pressure (QNH) from GNSS altitude averaged over 60 s when the phone reports vertical accuracy better than 5 m, then sends it to the hub. It re-anchors at each stop longer than 2 minutes. Between anchors, the barometer supplies the smooth, responsive relative altitude that GNSS cannot.

**Sourcing.** Counterfeit DS18B20s are widespread and fail at temperature extremes. Buy sensors through authorised distribution only.

## 5. Remote node network

Wired nodes use CAN 2.0B at 250 kbit/s over a four-wire harness; LoRa is kept only for nodes that cannot be wired. Rev A's I2C option is removed, and its "TDMA polling" (two different schemes) is replaced by CAN arbitration.

**Why CAN replaces I2C and most LoRa use.** A wired engine-bay node already needs a 12 V pair, so adding a twisted data pair costs almost nothing. CAN is differential, tolerant of ground offsets, and has arbitration, CRC, acknowledgement and error confinement in hardware. The ESP32-S3 has a built-in TWAI (CAN 2.0B) controller, so the hub needs only a transceiver. I2C, by contrast, is a single-ended board-level bus with a 400 pF limit and no error recovery; ignition noise on a 2 m engine-bay run will hang it.

**Physical layer**

- Transceiver: 3.3 V-logic automotive part with a VIO pin (TCAN1042V-Q1 class), with a common-mode choke and ESD diode at the connector.
- Topology: linear bus, 120 Ω termination at each end. The hub's termination is switchable; the last node carries a termination jumper. Stubs under 0.3 m.
- Harness: Deutsch DT 4-pin (switched 12 V, GND, CAN\_H, CAN\_L), twisted pair for CAN, rated for 125 °C under-hood use.
- Node MCU: ESP32-C3 (same toolchain as the hub, has TWAI) or an STM32G0 with FDCAN. A node draws about 20 mA, so a small linear regulator is acceptable there: Rev A's "no linear regulators" rule is about dissipation, not a blanket ban.

**Message map (11-bit IDs; lower ID wins arbitration)**

| CAN ID | Direction | Rate | Payload |
| --- | --- | --- | --- |
| 0x080 | Hub → all | On ignition change | Network management: run, sleep, enter pairing |
| 0x200 + node | Node → hub | 1 Hz (per channel config) | Channel ID, value (int32, scaled per channel), status bits, 8-bit sequence |
| 0x600 + node | Hub → node | On demand | Config write: sample rate, scaling, calibration |
| 0x680 + node | Node → hub | On demand | Config read-back and acknowledgement |
| 0x700 + node | Node → hub | 1 Hz | Heartbeat: state, firmware version, supply voltage, board temperature, error counters |
| 0x7F0 | Node → hub | At boot until assigned | Discovery: 32-bit unique ID; hub replies on 0x7F1 with a node number stored in node NVS |

The hub marks a channel stale after three missed periods and sets its bit in `sensor_status` (§7). A node that enters CAN bus-off recovers automatically and reports the event in its next heartbeat.

**LoRa, for unwired nodes only.** Use LoRa where wiring is impractical and the node runs on its own battery or solar supply. If a node is wired to 12 V anyway, wire CAN. Corrections to Rev A:

- *Physics.* Sheet metal blocks RF at any frequency; signals reach around it through gaps and apertures. Sub-GHz links tolerate those paths better than 2.4 GHz, which is the real reason to prefer LoRa here, not "cutting through" firewalls.
- *Why not ESP-NOW.* The S3 has one 2.4 GHz radio, time-shared between Wi-Fi/ESP-NOW and BLE. A 2.4 GHz node link would contend with the 25 Hz phone stream. The RFM95W is a separate radio.
- *US regulation (902–928 MHz, FCC Part 15.247).* At 125 kHz bandwidth, the link must frequency-hop. Use 500 kHz bandwidth, which qualifies as digital modulation and needs no hopping. At SF7 and 500 kHz, a 12-byte frame takes about 10 ms on air.
- *EU regulation (868 MHz).* The main sub-band allows 1% duty cycle. A 12-byte frame at SF7 and 125 kHz takes about 41 ms, so one node may send at most about one frame every 4–5 s. Configure EU builds for a 5 s update.
- *Medium access.* Hub-polled request and response. It is deterministic and needs no time sync, unlike true TDMA.
- *Security and convoy isolation.* Several TrailGauge vehicles in a convoy share the same band. Each install gets a random network ID and a 128-bit key at pairing. Frames carry the network ID, a 32-bit frame counter and AES-128-CCM authentication (hardware AES on both ends). The hub drops frames with an unknown network ID or a replayed counter.

## 6. Firmware architecture and filtering

Rev B firmware runs on ESP-IDF 5.x with the NimBLE host, splits acquisition, fusion and transport into fixed-period tasks that hand off through mailboxes, and specifies every filter by time constant. Arduino-ESP32 3.x (built on IDF 5) is acceptable for prototypes; production uses IDF directly for Secure Boot, flash encryption and OTA rollback.

**What was wrong in Rev A's listing**

- `analogRead(A0) * (5.0 / 1023.0) * 100.0` is Arduino Uno math for an LM35 on a 5 V, 10-bit ADC. The S3's ADC is 12-bit, saturates near 3.1 V at maximum attenuation, is nonlinear without calibration, and the specified sensor (DS18B20) is digital anyway.
- The filter state starts at 0.0, so every gauge ramps up from zero for about a second after boot.
- `vTaskDelay(20)` sleeps 20 ms *after* the work, so the period drifts with execution time. `xTaskDelayUntil` holds a fixed cadence.
- The global struct is written by one task and read by others with no synchronisation; a reader can see a torn update.
- A 50 Hz loop on a sensor that converts in 750 ms reads the same value 37 times.
- `5.0` and `100.0` are double literals. The S3 FPU is single-precision, so doubles fall back to software; use `f` suffixes.

**Task model**

| Task | Core | Priority | Period | Job |
| --- | --- | --- | --- | --- |
| `imu_task` | 1 | 20 | 200 Hz, IMU FIFO watermark interrupt | Read FIFO, run attitude fusion, write attitude mailbox |
| `baro_task` | 1 | 15 | 25 Hz | Pressure → altitude using QNH; median + EMA |
| `can_task` | 1 | 15 | Event (TWAI RX) | Update channel table, stale detection, discovery |
| `adc_task` | 1 | 10 | 5 Hz | Battery voltage; median + EMA |
| `telemetry_task` | 0 | 12 | 25 Hz | Snapshot mailboxes, pack frame, BLE notify |
| `supervisor_task` | 0 | 5 | 1 Hz | Ignition state machine, health bits, watchdog, NVS commits |

The NimBLE host is pinned to core 0, so sensor timing on core 1 is unaffected by radio events. Set `CONFIG_FREERTOS_HZ=1000`. All tasks subscribe to the task watchdog. Producers publish with `xQueueOverwrite()` on length-1 queues (the FreeRTOS mailbox pattern); consumers read with `xQueuePeek()`, which removes torn reads without long-held locks.

**Filter chain, applied in this order**

1. **Plausibility.** Reject NaN, out-of-range and rate-of-change violations (e.g. coolant cannot move 20 °C in 1 s). Set the channel's fault bit.
2. **Spike rejection.** Median of 5. Jolts and ignition EMI produce single-sample impulses; an EMA only smears them, while a median removes them.
3. **Smoothing.** First-order low-pass (EMA) with α computed from the measured sample interval and a time constant τ chosen per channel, seeded from the first valid sample.

```latex
y_t = \alpha\,x_t + (1-\alpha)\,y_{t-1}, \qquad \alpha = 1 - e^{-\Delta t/\tau}, \qquad f_c \approx \frac{1}{2\pi\tau}
```

Rev A's α = 0.12 at 50 Hz corresponds to τ ≈ 0.16 s; the number had no stated basis and would change meaning if the sample rate changed. Rev B time constants, all tunable over BLE:

| Channel | τ (s) | Rationale |
| --- | --- | --- |
| Altitude | 0.5 | Responsive on climbs, hides HVAC pressure flutter |
| Battery voltage | 1 | Shows winch sag, hides PWM ripple |
| Coolant temp | 2 | Sensor lag already dominates |
| Ambient temp | 10 | Slow by nature; hides passing exhaust plumes |

**Attitude and heading are not EMA problems.** Pitch and roll come from a Mahony complementary filter (or a 6-state EKF) at 200 Hz: the gyro is integrated, and the accelerometer corrects drift with a gain that drops to near zero when the measured acceleration differs from 1 g by more than 0.1 g, i.e. while braking, accelerating or cornering. Heading is tilt-compensated using the fused attitude, then filtered on the unit circle. An EMA on raw degrees fails at the wrap: averaging 359° and 1° gives 180°, pointing the compass backwards.

**Reference implementation (C++17, ESP-IDF 5.x)**

```cpp
// filters.hpp
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>

// First-order low-pass specified by time constant; correct for any sample interval.
class EmaFilter {
public:
  explicit EmaFilter(float tau_s) : tau_s_(tau_s) {}
  float update(float x, float dt_s) {
    if (!std::isfinite(x) || dt_s <= 0.0f) return y_;
    if (!seeded_) { y_ = x; seeded_ = true; return y_; }  // no ramp from zero at boot
    const float alpha = 1.0f - std::exp(-dt_s / tau_s_);
    y_ += alpha * (x - y_);
    return y_;
  }
  bool seeded() const { return seeded_; }
  void reset() { seeded_ = false; }
private:
  float tau_s_;
  float y_ = 0.0f;
  bool seeded_ = false;
};

// Median of the last 5 samples: removes single-sample spikes before smoothing.
class Median5 {
public:
  float update(float x) {
    buf_[idx_] = x;
    idx_ = (idx_ + 1) % 5;
    if (count_ < 5) ++count_;
    float s[5];
    std::copy(buf_, buf_ + count_, s);
    std::nth_element(s, s + count_ / 2, s + count_);
    return s[count_ / 2];
  }
private:
  float buf_[5] = {};
  uint8_t idx_ = 0, count_ = 0;
};

// Heading filter on the unit circle: no 359 -> 0 degree wrap error.
class HeadingFilter {
public:
  explicit HeadingFilter(float tau_s) : s_(tau_s), c_(tau_s) {}
  float update(float deg, float dt_s) {
    const float r = deg * kDegToRad;
    const float s = s_.update(std::sin(r), dt_s);
    const float c = c_.update(std::cos(r), dt_s);
    const float out = std::atan2(s, c) * kRadToDeg;
    return out < 0.0f ? out + 360.0f : out;
  }
private:
  static constexpr float kDegToRad = 0.017453293f;
  static constexpr float kRadToDeg = 57.29577951f;
  EmaFilter s_, c_;
};
```

```cpp
// baro_task.cpp: fixed cadence, measured dt, median then EMA
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "filters.hpp"
#include "sensors.h"   // baro_read(), qnh_hpa(), env_publish_altitude(), env_set_fault()

static float pressure_to_altitude_m(float p_hpa, float qnh_hpa) {
  return 44330.0f * (1.0f - std::pow(p_hpa / qnh_hpa, 0.190295f));
}

void baro_task(void *) {
  EmaFilter alt_lpf(0.5f);
  Median5 alt_med;
  int64_t last_us = esp_timer_get_time();
  TickType_t wake = xTaskGetTickCount();
  for (;;) {
    xTaskDelayUntil(&wake, pdMS_TO_TICKS(40));          // 25 Hz, drift-free
    float p_hpa;
    if (!baro_read(&p_hpa) || p_hpa < 300.0f || p_hpa > 1100.0f) {
      env_set_fault(ENV_FAULT_BARO);
      continue;
    }
    const int64_t now_us = esp_timer_get_time();
    const float dt_s = (now_us - last_us) * 1e-6f;
    last_us = now_us;
    const float alt = pressure_to_altitude_m(p_hpa, qnh_hpa());
    env_publish_altitude(alt_lpf.update(alt_med.update(alt), dt_s));  // xQueueOverwrite inside
  }
}
```

```cpp
// telemetry_task.cpp: 25 Hz snapshot and notify
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "telemetry_frame.h"  // TelemetryFrameV2, build_frame(), ble_notify_telemetry()

extern QueueHandle_t g_attitude_mbx;  // length-1 mailboxes, written with xQueueOverwrite()
extern QueueHandle_t g_env_mbx;

void telemetry_task(void *) {
  esp_task_wdt_add(nullptr);
  TickType_t wake = xTaskGetTickCount();
  uint8_t seq = 0;
  for (;;) {
    xTaskDelayUntil(&wake, pdMS_TO_TICKS(40));
    Attitude att;
    EnvSnapshot env;
    const bool att_ok = xQueuePeek(g_attitude_mbx, &att, 0) == pdTRUE;
    const bool env_ok = xQueuePeek(g_env_mbx, &env, 0) == pdTRUE;
    const TelemetryFrameV2 f = build_frame(att_ok ? &att : nullptr,
                                           env_ok ? &env : nullptr, seq++);
    ble_notify_telemetry(&f, sizeof f);  // no-op when no subscribed central
    esp_task_wdt_reset();
  }
}
```

**Robustness**

- Brownout detector enabled at its highest threshold; NVS writes are deferred while battery voltage is below 10.5 V or during cranking.
- I2C bus recovery: on a stuck bus, clock out 9 pulses and re-initialise before declaring the sensor faulted.
- OTA: two app partitions, signed images, `esp_ota_mark_app_valid_cancel_rollback()` called only after the new image has streamed telemetry for 60 s.
- DS18B20 on nodes: use the RMT-based 1-Wire driver so interrupts cannot corrupt bit timing, and start a conversion, then yield for 750 ms rather than blocking.

## 7. BLE interface and telemetry frame

The Rev B fast frame is 20 bytes, little-endian, fits the default ATT MTU, fixes the heading overflow, and adds a version byte, sequence counter, battery voltage and a defined status word. Slow and node-supplied channels move to a separate, extensible characteristic, and the link requires an encrypted, bonded connection.

**GATT layout** (one custom 128-bit base UUID, generated once and frozen; characteristics differ in bytes 12–13)

| Characteristic | Properties | Rate | Content |
| --- | --- | --- | --- |
| Telemetry | Notify | 25 Hz | `TelemetryFrameV2`, 20 bytes (below) |
| Aux channels | Notify | 1 Hz | List of node channels: channel ID (uint8), value (int32), decimal exponent (int8), status (uint8); 7 bytes each. Covers oil temp, cabin temp, and any future node without a frame change |
| Control | Write with response | On demand | Opcode + TLV: zero level, start/stop magnetometer calibration, set QNH, set filter τ, enter pairing, reboot |
| Device info | Read | On connect | Firmware version, frame version, mounting rotation, calibration quality, channel map |
| Events | Indicate | On change | Faults and alerts that must not be lost (acknowledged by the phone) |
| Device Information (0x180A), OTA service | Standard / custom | — | Manufacturer, model, serial; signed firmware transfer |

**Security.** The hub has no display or keypad, so it pairs with LE Secure Connections "Just Works" bonding. Because Just Works has no man-in-the-middle protection, pairing is accepted only for 2 minutes after a physical button press on the hub. After bonding, the hub's filter accept list admits only bonded phones, and every characteristic requires an encrypted link. Rev A had none of this, so any phone in range could read or write.

**Connection parameters.** The app requests high connection priority (11.25–15 ms interval, latency 0) while the dashboard is in the foreground and balanced priority otherwise. 1M PHY is used for range; the stream needs only 500 B/s.

**Frame layout: `TelemetryFrameV2` (20 bytes, little-endian)**

| Offset | Type | Field | Units | Invalid value |
| --- | --- | --- | --- | --- |
| 0x00 | uint8 | `version` | Always 2 | — |
| 0x01 | uint8 | `seq` | Increments per frame; app detects drops and staleness | — |
| 0x02 | int16 | `pitch_cdeg` | 0.01°, nose-up positive, ±9000 | 0x8000 |
| 0x04 | int16 | `roll_cdeg` | 0.01°, right-side-down positive, ±18000 | 0x8000 |
| 0x06 | uint16 | `heading_mag_cdeg` | 0.01°, magnetic, 0–35999 | 0xFFFF |
| 0x08 | int32 | `altitude_cm` | 0.01 m above mean sea level using the current QNH | 0x80000000 |
| 0x0C | int16 | `coolant_cdegc` | 0.01 °C | 0x8000 |
| 0x0E | int16 | `ambient_cdegc` | 0.01 °C | 0x8000 |
| 0x10 | uint16 | `battery_mv` | mV | 0xFFFF |
| 0x12 | uint16 | `status` | Bit field (below) | — |

Changes from Rev A, with reasons:

- **Heading is uint16.** Rev A's int16 × 100 overflowed above 327.67°. True heading is computed in the app (§4).
- **Altitude is int32 centimetres, not float32.** Same size, exact resolution, no NaN handling, and the reference (MSL via QNH) is now stated.
- **Checksum removed.** BLE already protects every packet with a 24-bit link-layer CRC and retransmits until acknowledged, so an 8-bit XOR added nothing. Rev A also called it both "modular" and "XOR", which are different algorithms. The LoRa path has its own CRC and AES-CCM tag (§5).
- **Version and sequence added**, so the app can reject unknown frame versions and detect stale or dropped data.
- **Invalid sentinels defined**, so a failed sensor is shown as failed instead of as zero.
- **Every field is naturally aligned**, so the packed struct has no padding on either Xtensa or ARM.

**Status bits (`status`, uint16)**

| Bit | Meaning |
| --- | --- |
| 0 | IMU fault |
| 1 | Attitude not zeroed (mounting rotation unknown) |
| 2 | Magnetometer uncalibrated or quality below threshold |
| 3 | Magnetic disturbance (field magnitude out of range) |
| 4 | Barometer fault |
| 5 | QNH not set (altitude uses 1013.25 hPa) |
| 6 | Coolant stale |
| 7 | Coolant fault |
| 8 | Ambient stale |
| 9 | Ambient fault |
| 10 | Battery below alert threshold (default 11.8 V) |
| 11 | CAN bus error or node bus-off |
| 12 | Ignition off, shutdown grace period running |
| 13 | Dynamic manoeuvre: accelerometer correction gated, attitude gyro-only |
| 14–15 | Reserved, sent as 0 |

**Firmware definition**

```cpp
// telemetry_frame.h
#pragma once
#include <cstdint>

#pragma pack(push, 1)
struct TelemetryFrameV2 {
  uint8_t  version;           // 2
  uint8_t  seq;
  int16_t  pitch_cdeg;        // INT16_MIN = invalid
  int16_t  roll_cdeg;
  uint16_t heading_mag_cdeg;  // 0..35999, 0xFFFF = invalid
  int32_t  altitude_cm;       // INT32_MIN = invalid
  int16_t  coolant_cdegc;
  int16_t  ambient_cdegc;
  uint16_t battery_mv;        // 0xFFFF = invalid
  uint16_t status;
};
#pragma pack(pop)

static_assert(sizeof(TelemetryFrameV2) == 20, "must fit a 23-byte ATT MTU notification");
static_assert(__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__, "wire format is little-endian");
```

**Latency budget (R-11: ≤ 100 ms p95)**

| Stage | Typical (ms) | Worst (ms) |
| --- | --- | --- |
| IMU sample to FIFO watermark (200 Hz, watermark 2) | 5 | 10 |
| Fusion | < 1 | 1 |
| Wait for next 25 Hz frame | 20 | 40 |
| BLE connection event (15 ms interval) | 7.5 | 15 |
| Android BLE stack to app runtime | 10 | 20 |
| Next 60 Hz frame | 8 | 17 |
| **Total** | **≈ 51** | **≈ 103** |

The typical path meets R-11 with margin. If drive testing shows the tail exceeding 100 ms, raise the telemetry rate to 50 Hz (1 kB/s) before touching anything else.

## 8. Mobile app

The Rev B app keeps React Native and TypeScript, but streams telemetry into Reanimated shared values that Skia draws on the UI thread, so a 25 Hz stream never re-renders the React tree. It also replaces Rev A's touch handler with real double-tap and swipe gestures and makes every gauge reachable.

**Stack.** React Native (New Architecture) with strict TypeScript; `react-native-ble-plx` for BLE; `react-native-gesture-handler` for gestures; `react-native-reanimated` for shared values and needle animation; `@shopify/react-native-skia` for gauge drawing. Rev A's "Skia layouts" was a misnomer: layout is Yoga; Skia only draws. The Galaxy S24 is the reference device, but nothing is Samsung-specific, and a mid-range Android phone is in the test matrix.

**Data path.** BLE notification (base64) → `parseFrameV2()` with a `DataView` → one shared value → Skia gauges read it through `useDerivedValue` on the UI thread. React state changes only on low-rate transitions: connection state, staleness, status bits. Needles animate toward each new value over one frame period (40 ms), and the heading needle takes the shortest arc, so a 25 Hz stream looks smooth at 60 FPS. True heading = magnetic heading + declination from the World Magnetic Model at the phone's GNSS position.

**UI states.** `GROUP` shows three gauges the user chooses from the full registry. `SINGLE` shows one gauge full-screen; swiping cycles through *all* gauges, wrapping at the ends. This fixes Rev A, where `ENGINE_TEMP` was outside the hard-coded first three and swipe was never built, so it could never be displayed.

| From | Gesture | To |
| --- | --- | --- |
| `GROUP` | Double-tap a tile | `SINGLE` at that gauge's registry index |
| `SINGLE` | Double-tap | `GROUP` |
| `SINGLE` | Swipe left / right | `SINGLE`, next / previous gauge, wrapping |
| Any | Single tap | No change (prevents trail bumps from switching views) |

**Corrected components**

```tsx
// gauges.ts
export const GAUGE_REGISTRY = [
  'INCLINOMETER', 'COMPASS', 'ALTIMETER', 'ENGINE_TEMP', 'AMBIENT_TEMP', 'BATTERY',
] as const;
export type GaugeId = (typeof GAUGE_REGISTRY)[number];
```

```tsx
// DashboardCanvas.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native'; // Rev A imported these from 'react'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GaugeView } from './GaugeView';
import { GAUGE_REGISTRY, type GaugeId } from './gauges';

type ViewState = { mode: 'GROUP' } | { mode: 'SINGLE'; index: number };

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_DP = 40;
const wrap = (i: number, n: number) => ((i % n) + n) % n;

const makeDoubleTap = (onDoubleTap: () => void) =>
  Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .maxDistance(TAP_SLOP_DP)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) onDoubleTap();
    });

const GroupTile: React.FC<{ id: GaugeId; onOpen: (id: GaugeId) => void }> = ({ id, onOpen }) => {
  const gesture = useMemo(() => makeDoubleTap(() => onOpen(id)), [id, onOpen]);
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.tile}
        accessibilityRole="button"
        accessibilityLabel={`${id} gauge. Double-tap to enlarge.`}
      >
        <GaugeView id={id} size="compact" />
      </View>
    </GestureDetector>
  );
};

interface Props {
  groupGauges: readonly [GaugeId, GaugeId, GaugeId]; // user-configurable
}

export const DashboardCanvas: React.FC<Props> = ({ groupGauges }) => {
  const [view, setView] = useState<ViewState>({ mode: 'GROUP' });
  const n = GAUGE_REGISTRY.length;

  const open = useCallback(
    (id: GaugeId) => setView({ mode: 'SINGLE', index: GAUGE_REGISTRY.indexOf(id) }),
    [],
  );
  const close = useCallback(() => setView({ mode: 'GROUP' }), []);
  const step = useCallback(
    (delta: number) =>
      setView(v => (v.mode === 'SINGLE' ? { mode: 'SINGLE', index: wrap(v.index + delta, n) } : v)),
    [n],
  );

  // Race: a fling moves too far to count as a tap, so the gestures cannot both fire.
  const singleGesture = useMemo(
    () =>
      Gesture.Race(
        makeDoubleTap(close),
        Gesture.Fling().direction(Directions.LEFT).runOnJS(true)
          .onEnd((_e, ok) => { if (ok) step(+1); }),
        Gesture.Fling().direction(Directions.RIGHT).runOnJS(true)
          .onEnd((_e, ok) => { if (ok) step(-1); }),
      ),
    [close, step],
  );

  if (view.mode === 'GROUP') {
    return (
      <View style={[styles.container, styles.group]}>
        {groupGauges.map(id => <GroupTile key={id} id={id} onOpen={open} />)}
      </View>
    );
  }

  const activeId = GAUGE_REGISTRY[view.index];
  return (
    <GestureDetector gesture={singleGesture}>
      <View style={[styles.container, styles.single]} accessibilityLabel={`${activeId} gauge`}>
        <GaugeView id={activeId} size="full" />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  group: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tile: { width: '31%', aspectRatio: 1, borderWidth: 1, borderColor: '#333', borderRadius: 12 },
  single: { justifyContent: 'center', alignItems: 'center', padding: '4%' },
});
```

```ts
// telemetry.ts: frame parsing and stream hook
import { useEffect, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import type { Device } from 'react-native-ble-plx';
import { useSharedValue } from 'react-native-reanimated';
import { SERVICE_UUID, TELEMETRY_UUID } from './uuids';

export interface Telemetry {
  seq: number;
  pitchDeg: number | null;
  rollDeg: number | null;
  headingMagDeg: number | null;
  altitudeM: number | null;
  coolantC: number | null;
  ambientC: number | null;
  batteryV: number | null;
  status: number;
}

const FRAME_V2_LEN = 20;
const STALE_MS = 500;

export function parseFrameV2(base64: string): Telemetry | null {
  const b = Buffer.from(base64, 'base64');
  if (b.length !== FRAME_V2_LEN || b[0] !== 2) return null; // unknown version: ignore
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const i16 = (o: number, k: number) => { const v = dv.getInt16(o, true); return v === -0x8000 ? null : v / k; };
  const u16 = (o: number, k: number) => { const v = dv.getUint16(o, true); return v === 0xffff ? null : v / k; };
  const alt = dv.getInt32(8, true);
  return {
    seq: dv.getUint8(1),
    pitchDeg: i16(2, 100),
    rollDeg: i16(4, 100),
    headingMagDeg: u16(6, 100),
    altitudeM: alt === -0x80000000 ? null : alt / 100,
    coolantC: i16(12, 100),
    ambientC: i16(14, 100),
    batteryV: u16(16, 1000),
    status: dv.getUint16(18, true),
  };
}

export function useTelemetryStream(device: Device) {
  const latest = useSharedValue<Telemetry | null>(null); // read by Skia on the UI thread
  const [stale, setStale] = useState(true);
  const lastRx = useRef(0);

  useEffect(() => {
    const sub = device.monitorCharacteristicForService(SERVICE_UUID, TELEMETRY_UUID, (err, ch) => {
      if (err || !ch?.value) return;
      const t = parseFrameV2(ch.value);
      if (!t) return;
      latest.value = t; // no React re-render per frame
      lastRx.current = Date.now();
    });
    const timer = setInterval(() => {
      const isStale = Date.now() - lastRx.current > STALE_MS;
      setStale(prev => (prev === isStale ? prev : isStale)); // re-render only on transition
    }, 100);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [device, latest]);

  return { latest, stale };
}
```

**Display rules**

- **Stale or invalid data is never shown as live.** A gauge whose field is invalid, or whose stream is older than 500 ms, greys out, shows "--" and shows the data age. A frozen needle that looks live is the most dangerous failure this product can have.
- **Glanceable.** Primary numerals sized for reading at arm's length; colour carries meaning only alongside a shape or label; units switch metric/imperial in the app only (the wire stays SI).
- **Driver distraction.** Settings, pairing and calibration screens are disabled above 8 km/h GNSS speed. Tilt alerts use per-vehicle thresholds the user sets, and the copy calls them advisory.
- **Lighting.** Night mode (dim, red-shifted) and a high-contrast daylight mode.

**Android platform requirements**

- Runtime permissions: `BLUETOOTH_SCAN` (declared `neverForLocation`), `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION` for GNSS (QNH, declination, speed lockout).
- Keep the screen on, lock landscape, use immersive mode while the dashboard is in front.
- Bond once during pairing; reconnect automatically to the bonded hub (R-13).
- To keep logging with the screen off, run a foreground service with type `connectedDevice`, and guide users to exempt the app from Samsung's battery "sleeping apps" list.
- A phone on a sunny dash overheats. Watch Android's thermal status: at severe, drop to 30 FPS and lower brightness; at critical, show a warning. Recommend a vent mount out of direct sun. Magnetic mounts are acceptable because Rev B never uses the phone's compass.

## 9. Verification and validation

Every requirement in §1 maps to a test below, run at EVT (first boards), DVT (production-intent design) and PVT (production process). The cheapest high-value test is a shared set of golden frame vectors that both firmware and app CI must decode identically.

| Test | Covers | Method | Pass criteria | Phase |
| --- | --- | --- | --- | --- |
| Supply sweep and crank | R-01 | Programmable supply, 6–16 V sweep, cold-crank profile | No reset above 6 V; clean reset and recovery below | EVT |
| Transients | R-02 | Transient generator: load dump, reverse battery, jump start | No damage; resumes normal operation after each pulse | EVT, DVT |
| Sleep current | R-03 | Battery-feed current after ignition off and grace period | ≤ 0.5 mA averaged over 1 h | EVT, PVT |
| Thermal | R-04, R-05 | Chamber soak at limits with power cycling; in-vehicle parked sun soak with logger | Full function at limits; no resets | DVT |
| Vibration | R-06 | Shaker, ISO 16750-3 profiles; attitude logged during test | No mechanical failure; attitude noise within R-07 during excitation | DVT |
| Attitude accuracy | R-07 | Tilt table at 0°, ±10°, ±20°, ±30°, ±45°; drive test against a reference GNSS/INS | ±0.5° static; ±2° dynamic | EVT, DVT |
| Heading accuracy | R-08 | Straight segments above 20 km/h in 8 directions vs GNSS course; repeat with lights, fans and winch power on | ±3° after calibration | DVT |
| Altitude | R-09 | 1 h parked log vs nearby weather station; climb to a surveyed benchmark | ≤ 3 m drift; benchmark error ≤ 5 m after QNH anchor | DVT |
| Temperature | R-10 | Stirred bath with reference thermometer | ±1 °C coolant, ±0.5 °C ambient | EVT |
| Latency | R-11 | 240 fps camera filming a tilt step and the screen together | ≤ 100 ms p95 over 50 steps | DVT |
| Rendering | R-12 | GPU profiler, 30 min on reference and mid-range phones | < 1% dropped frames | DVT |
| Link | R-13, R-14 | 100 hub power cycles; 8 h soak; connection from an unbonded phone; fuzzing of the control characteristic | Reconnect ≤ 5 s; stale flag ≤ 500 ms; unbonded rejected; no crash | EVT, DVT |
| Emissions | R-15 | Pre-scan at EVT, accredited CISPR 25 lab at DVT | Agreed class met | EVT, DVT |
| OTA | R-16 | Power loss at random points during 50 updates | Always boots a valid image; rollback works | DVT |
| Field trial | All | 3 vehicles, hot and cold climates, ≥ 500 km of trail | No unresolved P1 issues | PVT |

**Golden frame vector.** Firmware unit tests must produce, and app tests must decode, this frame: version 2, seq 42, pitch 12.34°, roll −5.00°, magnetic heading 359.99°, altitude 1234.56 m, coolant 92.50 °C, ambient −3.25 °C, battery 13.800 V, status bit 5 (QNH not set).

```text
02 2A D2 04 0C FE 9F 8C 40 E2 01 00 22 24 BB FE E8 35 20 00
```

The vector includes a heading that Rev A's int16 field could not represent (35999) and two negative values, so it catches the overflow and sign-handling bugs directly. Add a vector with every field at its invalid sentinel, and one with an unknown version byte that the app must ignore.

**Host-side unit tests.** The filter classes in §6 compile on the host. Test that the EMA's step response reaches 63% at τ for several sample intervals, that it seeds from the first sample, that `Median5` removes a single spike, and that `HeadingFilter` crosses 359°→1° without passing through 180°.

## 10. Risks, open questions and revision history

The largest technical risk is heading accuracy from a magnetometer inside a steel cab; the largest user-safety risk is a poor power tap during installation. Both have a defined fallback.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cab steel and wiring currents keep the on-hub magnetometer outside ±3° | R-08 missed | Move the magnetometer to a CAN "mag puck" mounted high and away from current-carrying wires; decide at EVT drive test |
| User taps power from the wrong circuit, including airbag (SRS) wiring, which is usually yellow-sheathed | Vehicle damage or disabled airbag | Install guide mandates an add-a-fuse tap on an accessory fuse and forbids SRS circuits; supply the tap and fuse in the box |
| Accelerometer gating holds attitude gyro-only too long on sustained climbs or long turns | Slow drift in pitch and roll | Bound gyro-only time, then blend accelerometer at reduced gain; tune from drive logs |
| Phone thermal shutdown on a sunny dash | Display lost mid-trail | Thermal-status throttling (§8), mount guidance |
| Android BLE behaviour varies by manufacturer and OS update | Reconnect and latency regressions | Two-phone test matrix; R-13 and R-11 in release gating |
| Regional LoRa rules differ | Non-compliant shipments | Region-locked LoRa builds (US 500 kHz, EU 5 s duty-limited) |
| Counterfeit sensors and modules | Field failures at temperature extremes | Authorised distribution only; incoming inspection on first lots |

**Open questions**

- [ ] Add an OBD-II listen-only CAN input for coolant temperature? Most vehicles built since 2008 publish it, which would remove the hose sensor for those users. Needs a second, isolated transceiver locked in listen-only mode so the product can never transmit on the vehicle bus.
- [ ] Final IMU: ICM-42688-P with in-house fusion, BMI270, or BNO085 with on-chip fusion (faster to integrate, less control over calibration).
- [ ] Does the hub need its own GNSS for users who stow the phone? Today QNH, declination and the speed lockout all depend on phone GNSS.
- [ ] CISPR 25 class target (R-15).
- [ ] iOS support: a product decision; nothing in Rev B's wire protocol prevents it.
- [ ] Track and telemetry logging with GPX export.
- [ ] 24 V vehicle variant (front-end changes only, §1).

**Revision history**

| Rev | Date | Summary |
| --- | --- | --- |
| B | 2026-10-20 | Principal review: protected 60 V power front end; CAN replaces I2C for remote nodes; LoRa demoted to optional with regulatory and security rules; IMU and magnetometer added; filters specified by time constant with attitude fusion; 20-byte v2 frame fixing heading overflow; BLE bonding; corrected firmware and app code; requirements and V&V plan added |
| A | Undated | Initial concept |

**Sources**

- [ESP32-S3-WROOM-1 / WROOM-1U datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) (Espressif): module temperature grades by variant
- [LMR36015-Q1 product page](https://www.ti.com/product/LMR36015-Q1) (Texas Instruments): 4.2–60 V input, 1.5 A, AEC-Q100; LMR38020-Q1 alternative
- [MP2315 datasheet](https://docs.rs-online.com/28eb/A700000013717006.pdf) (Monolithic Power Systems): 4.5–24 V operating input, 28 V absolute maximum
- Other part ratings, regulatory limits and standards references are from engineering knowledge and must be confirmed against current datasheets and the standards documents before DVT.
