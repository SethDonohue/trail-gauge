# TrailGauge hub: parts list (prototype, with cabin and outside temperature)

Everything needed to build one prototype hub from off-the-shelf boards, with the cabin temperature and humidity sensor and one outside temperature probe. Design rules are in [spec Rev B.1](../spec/trailgauge-spec-rev-b.md), §4 (sensors and the outside-probe 1-Wire bus) and §5 (power).

Prices are in USD before tax and shipping. "Checked" prices came from the seller's page on Nov 20, 2026; the rest are estimates. The live, editable copy of this list is the TrailGauge parts Sheet in Claude.

| | Total |
| --- | --- |
| Required parts | $282.44 |
| Optional extras | $29.95 |
| Tools, if you need them | $99.00 |

## How it goes together

- **Off-the-shelf boards.** An ESP32-S3 dev board and plug-in sensor boards (STEMMA QT / Qwiic cables) on one solderable perma-proto board. No custom PCB yet.
- **Soldered by default.** Everything that never needs to come apart is soldered and sealed with heat-shrink: splices, the fuse-tap leads, the ESP32 to the perma-proto, and the outside probe to its extension cable.
- **Two connectors, both at the hub and inside the cabin.** Pluggable screw-terminal blocks for 12 V power (2-pin) and the outside-probe cable (3-pin), so the hub unplugs and lifts out. Screw terminals take bare wire, so the cable goes through the firewall or body grommet as bare wire and is terminated on the cabin side. Nothing outside needs a waterproof connector.
- **Sensor plugs inside the box** get a dab of hot glue so vibration can't work them loose.

## Hub

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| ESP32-S3 dev board (8 MB flash, no PSRAM) | 1 | $15.00 | $15.00 | Espressif ESP32-S3-DEVKITC-1-N8 (DigiKey 1965-ESP32-S3-DEVKITC-1-N8-ND) | DigiKey | Checked | Order exactly -N8. Skip the N8R2 and N8R8 versions: their extra memory is rated to only 65 °C, too low for a parked van. |
| Tilt + compass sensor board (ISM330DHCX IMU + MMC5983MA magnetometer) | 1 | $45.74 | $45.74 | SparkFun SEN-19895 | SparkFun | Checked | Both motion sensors on one plug-in board. Industrial-grade IMU; a prototype answer to the spec's open IMU question. |
| Barometer (BMP390) | 1 | $10.95 | $10.95 | Adafruit 4816 | Adafruit | Checked | Altitude. Inside the hub box, near the breather vent. |
| Cabin temp + humidity sensor (SHT45 with PTFE filter) | 1 | $13.50 | $13.50 | Adafruit 6174 | Adafruit | Checked | Mount outside the hub box on the 400 mm cable so the electronics' heat doesn't skew it. The filter keeps dust out. |
| STEMMA QT / Qwiic cable, 400 mm | 1 | $1.50 | $1.50 | Adafruit 5385 | Adafruit | Checked | Cabin sensor lead. The plug passes through a PG7 gland; or cut it and solder the 4 wires to the board. |
| STEMMA QT / Qwiic cable, 100 mm | 2 | $0.95 | $1.90 | Adafruit or SparkFun, 100 mm | Adafruit | Estimate | Chains the sensor boards inside the box. Hot-glue each plug. |
| STEMMA QT to male-header cable, 150 mm | 1 | $0.95 | $0.95 | Adafruit, "STEMMA QT to male headers" | Adafruit | Estimate | Connects the sensor chain to the ESP32. Or solder 4 wires from the first sensor board to the perma-proto. |

## Hub power

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| 3.3 V step-down regulator, 4.5–50 V input | 1 | $21.95 | $21.95 | Pololu D36V28F3 (#3781) | Pololu | Checked | Reverse-polarity protection to 40 V built in. Stand-in for the spec's LMR36015-Q1 power stage. |
| TVS diode, 24 V standoff, about 39 V clamp | 1 | $1.50 | $1.50 | 5KP24A (through-hole version of the spec's SM8S24A) | DigiKey / Mouser | Estimate | Across the 12 V input after the fuse. Clamps spikes below the regulator's 50 V limit. |
| 47 µF 50 V electrolytic capacitor, 105 °C | 2 | $0.50 | $1.00 | Any brand | DigiKey / Mouser | Estimate | Smooths the 12 V input. |
| 100 nF 50 V ceramic capacitor | 10 | $0.15 | $1.50 | Any brand | DigiKey / Mouser | Estimate | Input filter, sensor power, and one at each outside probe. |
| Metal-film resistor assortment, 1% | 1 | $12.00 | $12.00 | Must include 100k, 22k, 4.7k, 2.2k and 100 Ω | Amazon / DigiKey | Estimate | Battery and ignition dividers (100k + 22k), outside-probe pull-up (4.7k, 2.2k spare), 100 Ω series resistor. |
| 3.3 V Zener diode | 2 | $0.25 | $0.50 | 1N5226B | DigiKey / Mouser | Estimate | Protects the ignition-sense input. |
| Sealed momentary pushbutton, panel mount | 1 | $4.00 | $4.00 | 12 mm, IP67 | Amazon / DigiKey | Estimate | Pairing button: the spec only allows pairing a phone after a press. |

## Van wiring

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| Add-a-fuse tap with 2 A fuse | 2 | $8.00 | $16.00 | Match the van's fuse type: ATO, mini or low-profile mini | Auto parts store | Estimate | One on a constant circuit (power), one on an ignition-switched circuit (ignition sense). Never airbag (SRS) circuits. Solder the tap's lead instead of crimping. |
| 18 AWG automotive wire, red and black, 25 ft each | 1 | $15.00 | $15.00 | TXL or GXL | Auto parts store | Estimate | Power and ignition-sense runs. |
| Ring terminals, 18 AWG, #10 stud | 1 | $4.00 | $4.00 | Pack of 10 | Auto parts store | Estimate | Chassis ground. Splices are soldered, so no butt-connector kit. |
| Split loom and zip ties | 1 | $10.00 | $10.00 | Any brand | Auto parts store | Estimate | Protects runs from chafing. |

## Enclosure and build

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| Solderable breadboard (perma-proto) | 1 | $4.50 | $4.50 | Adafruit Perma-Proto Half-sized | Adafruit | Estimate | Permanent breadboard: nothing shakes loose. |
| Silicone hookup wire, 22 AWG, assorted colors | 1 | $10.00 | $10.00 | Stranded, 6 colors | Amazon / Adafruit | Estimate | Board wiring. Solder the ESP32 straight to the perma-proto (no sockets). |
| Enclosure, IP65, about 150 × 100 × 60 mm | 1 | $15.00 | $15.00 | ABS or polycarbonate | Amazon | Estimate | Room for CAN parts later. |
| Breather vent, IP67, M12 | 1 | $4.00 | $4.00 | Any brand | Amazon | Estimate | Lets the barometer feel cabin pressure while keeping water and dust out. |
| Cable glands, PG7 | 1 | $6.00 | $6.00 | Pack of 10 | Amazon | Estimate | Power, outside probe and cabin sensor leads. |
| Rubber anti-vibration mounts, M3 | 1 | $8.00 | $8.00 | Grommets or standoffs | Amazon | Estimate | Isolated mount, as the spec requires for the IMU. |
| USB-C data cable | 1 | $8.00 | $8.00 | Data, not charge-only | Any | Estimate | For loading firmware. |

## Outside temperature

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| Waterproof DS18B20 probe | 1 | $9.95 | $9.95 | Adafruit 381 | Adafruit | Checked | 36 in lead. Adafruit tests that these are genuine Maxim parts; fakes fail in heat and cold. |
| Outdoor-rated 2-pair cable, 25 ft | 1 | $15.00 | $15.00 | 22 AWG shielded 2-pair, or outdoor Cat5e | Amazon | Estimate | Solder the probe to it and seal with adhesive heat-shrink. Push the bare end through the grommet, then land it in the terminal block. Twist data with ground. |
| Pluggable screw-terminal blocks, 5.08 mm, 2- and 3-pin pairs | 1 | $9.00 | $9.00 | Kit of plug + socket pairs | Amazon | Estimate | The hub's only connectors: 12 V power and the outside-probe cable. Inside the cabin, so no waterproofing needed. |
| Adhesive-lined heat-shrink assortment | 1 | $10.00 | $10.00 | Any brand | Amazon | Estimate | Seals splices and the probe end. |
| Stainless cable clamps (P-clips) | 1 | $6.00 | $6.00 | Assorted sizes | Amazon / hardware store | Estimate | Holds the probe in a shaded spot with a drip loop. |

## Optional

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| Second waterproof DS18B20 probe | 1 | $9.95 | $9.95 | Adafruit 381 | Adafruit | Checked | For example under a mirror. Solder it into the same 3 wires as probe 1; no connector needed. The app shows the lower reading. |
| Acrylic conformal coating | 1 | $15.00 | $15.00 | Any acrylic coating for circuit boards | Amazon / DigiKey | Estimate | The spec calls for coated boards; protects against condensation. |
| CAN transceiver breakout | 1 | $5.00 | $5.00 | TJA1051 or TCAN1042 class | Adafruit / DigiKey | Estimate | Only once engine-bay sensor nodes are added. |

## Tools, if you need them

| Item | Qty | Unit | Total | Part / SKU | Buy from | Price | Notes |
| --- | --: | --: | --: | --- | --- | --- | --- |
| Temperature-controlled soldering iron | 1 | $30.00 | $30.00 | For example Pinecil | Amazon | Estimate | |
| Solder and flux | 1 | $12.00 | $12.00 | 63/37 rosin-core | Amazon | Estimate | |
| Multimeter | 1 | $25.00 | $25.00 | Any auto-ranging | Amazon | Estimate | Check the fuse-tap circuits before connecting the hub. |
| Wire stripper | 1 | $12.00 | $12.00 | For 18–26 AWG | Amazon | Estimate | No crimper needed: splices are soldered. |
| Heat gun | 1 | $20.00 | $20.00 | Any brand | Amazon | Estimate | |
