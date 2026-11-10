// Guides & tips content. Always available from the dashboard menu and from Settings.

export interface Tip {
  id: string;
  title: string;
  summary: string;
  paragraphs: string[];
}

export const TIPS: readonly Tip[] = [
  {
    id: 'outside',
    title: 'Placing the outside sensor',
    summary: 'In shade and moving air, away from engine heat',
    paragraphs: [
      'Best spot: behind the front bumper or lower grille, ahead of the radiator and A/C condenser, facing down or rearward in a shaded pocket.',
      'Also good: under a side-mirror housing, which is shaded and far from engine heat.',
      'Avoid exhaust, turbo and intercooler pipes, the air behind the radiator or condenser, headlights and light bars, dark panels in sun, and the spray behind tyres.',
      'Mount it 2 to 3 cm off any panel so it reads the air, not the metal. A small vented shield keeps sun and pavement heat off it.',
      'Off-road: keep it above your usual water-crossing depth, use a sealed (IP67) sensor and connector, and leave a drip loop in the cable.',
      'With a second outside sensor (for example under a mirror), TrailGauge shows the lower of the two.',
      'Wind chill does not affect a dry sensor. Moving air actually helps it read the true air temperature.',
    ],
  },
  {
    id: 'traffic',
    title: 'Why outside temperature reads high in traffic',
    summary: 'Engine and pavement heat at low speed',
    paragraphs: [
      'When the vehicle is slow or stopped, engine-bay heat drifts forward over a front sensor, and hot pavement radiates up at it. Factory car thermometers read high in traffic for the same reason.',
      'TrailGauge corrects for this like car makers do: below about 30 km/h (19 mph) the reading can fall freely but rises only slowly, and after start-up it keeps the last good reading until you have driven at speed for about a minute. This needs GPS speed; without location access the reading is shown as measured.',
      'You can turn the correction off in Settings > Advanced.',
    ],
  },
  {
    id: 'cabin',
    title: 'Placing the cabin sensor',
    summary: 'Low, shaded, in moving cabin air',
    paragraphs: [
      'Best spot: under the dash near the lower steering column cover, roughly chest height, shaded, where cabin air moves.',
      'Also fine: the side of the centre console, low and out of the sun.',
      'Avoid the dash top and windscreen area, direct sun through any window, HVAC vents and heater outlets, the footwell by the firewall, the headliner, and the inside of the hub box.',
      'Cabin air can differ by 5 to 10 °C from floor to roof in sun, so pick a spot near where people sit.',
      'This needs a hub with a cabin temperature and humidity sensor (SHT4x class). The Humidity gauge shows the cabin humidity and dew point.',
    ],
  },
  {
    id: 'fog',
    title: 'Window fog risk',
    summary: 'Needs the cabin humidity sensor',
    paragraphs: [
      'Windows fog on the inside when the glass is colder than the cabin air’s dew point. TrailGauge estimates the glass temperature from the outside and cabin temperatures and warns when it gets within 3 °C (5 °F) of the dew point.',
      'When it warns: turn on the A/C or defrost (A/C dries the air), switch from recirculation to fresh air, or open a window slightly.',
    ],
  },
  {
    id: 'mount',
    title: 'Mounting the phone',
    summary: 'Rigid, non-magnetic, and zeroed on level ground',
    paragraphs: [
      'Phone sensors measure the phone, not the vehicle, so the mount must not wobble. A mount that flexes shows bumps as tilt.',
      'Avoid magnetic mounts and metal plates: they pull the compass off by tens of degrees.',
      'After mounting, park on level ground and hold ZERO for a second. Zero again whenever the mount moves.',
      'Keep the phone on a charger and out of direct sun: a hot phone slows its sensors and may dim the screen.',
    ],
  },
  {
    id: 'compass',
    title: 'Compass interference',
    summary: 'Metal, magnets and electronics near the phone',
    paragraphs: [
      'The compass reads Earth’s weak magnetic field. Magnetic mounts, speakers, steel brackets, winch cables and some chargers can swamp it.',
      'If the compass shows MAGNETIC INTERFERENCE, move the phone away from the source or change the mount.',
      'For interference that moves with the phone (a mount with metal parts), use Settings > Advanced > Compass calibration: drive a slow full circle in an open area, then tap Finish.',
      'The compass shows true north (T) once GPS has a fix, otherwise magnetic north (M).',
    ],
  },
  {
    id: 'altitude',
    title: 'Altitude calibration',
    summary: 'Weather moves the barometer: set a known elevation',
    paragraphs: [
      'Barometric altitude follows air pressure, which changes with the weather by the equivalent of tens of metres (hundreds of feet) in a day.',
      'Whenever you pass a trail sign, benchmark or map spot height, enter it in Settings > Calibration > Set current elevation.',
      'If you have a local altimeter setting (QNH) from an airport or weather report, enter it in Settings > Advanced.',
      'GPS elevation is a fallback: it can be off by 30 m (100 ft) or more.',
    ],
  },
  {
    id: 'nobus',
    title: 'Vehicles without OBD-II or CAN',
    summary: 'TrailGauge works without a vehicle data port',
    paragraphs: [
      'Older vehicles (in the US, roughly before 1996) have no OBD-II port, and many before about 2008 have no CAN bus. TrailGauge does not need either.',
      'Coolant temperature comes from a dedicated sensor (a sender in a spare port or an inline hose adapter). Battery voltage is measured at the hub. Speed comes from GPS.',
      'Power the hub from an add-a-fuse in the fuse box, or a fused lead to an accessory or ignition feed. Older fuse blocks may need a fused pigtail.',
      'If your hub firmware does not report the missing bus itself, set Settings > Data sources > Vehicle data bus to None, so a CAN error is not shown as a fault.',
    ],
  },
  {
    id: 'alerts',
    title: 'Alerts and muting',
    summary: 'Sounds, vibration and the mute buttons',
    paragraphs: [
      'Alerts beep and vibrate when a reading first turns amber or red; red alarms repeat every 30 seconds. Gauges always change colour, even when muted.',
      'The speaker button on a gauge mutes that gauge’s alerts. MUTE at the top of the dashboard silences everything. Demo data never beeps.',
      'Alert sounds use media volume, so keep it up.',
    ],
  },
  {
    id: 'orientation',
    title: 'Screen orientation',
    summary: 'Landscape, portrait, or follow the phone',
    paragraphs: [
      'TrailGauge works in landscape and portrait. In Settings > Display you can follow the phone\'s auto-rotate, or lock the app to one orientation (useful if auto-rotate is off).',
      'In split screen beside a map app, the gauges fit whatever window they have.',
    ],
  },
];
