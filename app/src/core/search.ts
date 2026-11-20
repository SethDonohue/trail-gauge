// Settings search: a row matches when every word typed appears in its name, description or section,
// or a word the user might use instead does (mph finds the speed unit, brightness finds dimming).

// Typed word -> words that appear in the settings text.
const ALSO: Record<string, string[]> = {
  mph: ['speed'], kmh: ['speed'], 'km/h': ['speed'], kph: ['speed'], speedometer: ['speed'],
  metric: ['units'], imperial: ['units'], fahrenheit: ['units'], celsius: ['units'],
  feet: ['units', 'altitude'], meters: ['units'], metres: ['units'],
  brightness: ['dimming', 'night'], dark: ['night'], dim: ['dimming'],
  magnet: ['compass', 'magnetic'], heading: ['compass'], north: ['compass'], gyro: ['compass'],
  gyroscope: ['compass'], direction: ['compass'],
  calibrate: ['calibration', 'zero'], level: ['zero', 'tilt'], inclinometer: ['tilt'],
  incline: ['tilt'], angle: ['tilt', 'roll', 'pitch'], slope: ['tilt', 'roll', 'pitch'],
  beep: ['alert'], sound: ['alert'], alarm: ['alert', 'warning'], mute: ['muted', 'alert'],
  volume: ['alert'], warn: ['warning'],
  elevation: ['altitude'], barometer: ['altitude', 'pressure'], qnh: ['pressure'], height: ['altitude'],
  temp: ['temperature', 'coolant', 'cabin', 'outside'], engine: ['coolant'],
  bluetooth: ['hub'], obd: ['vehicle data bus'], can: ['vehicle data bus'],
  color: ['colour'], theme: ['colour'], rotate: ['orientation'], landscape: ['orientation'],
  portrait: ['orientation'], awake: ['keep screen on'], sleep: ['keep screen on'],
  voltage: ['battery'], fog: ['humidity'], humidity: ['fog'], gps: ['location'],
  help: ['guide', 'tips'], tutorial: ['guide'],
};

export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/\s+/g, ' ')
    .trim();
}

function wordMatches(hay: string, w: string): boolean {
  if (hay.includes(w)) return true;
  if (w.length > 3 && w.endsWith('s') && hay.includes(w.slice(0, -1))) return true; // alerts -> alert
  return (ALSO[w] ?? []).some(x => hay.includes(x));
}

export function matchesSearch(query: string, texts: (string | null | undefined)[]): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalizeSearch(texts.filter(Boolean).join(' '));
  return words.every(w => wordMatches(hay, w));
}
