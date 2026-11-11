import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALERT_IDS, ALERT_LABEL, COOLANT_ALARM_MARGIN_C } from '../core/alerts';
import { GAUGE_PRESETS, isReservedHue, wheelColorAt } from '../core/colors';
import { hubFaults, vehicleBusLabel } from '../core/faults';
import { altUnit, fmtSpeed, speedUnitFor, speedUnitLabel } from '../core/format';
import { northRefSummary } from '../core/heading';
import { alertMonitor } from '../engine/alertMonitor';
import { engine } from '../engine/engine';
import { requestBluetoothPermission } from '../engine/hubSource';
import { statusStore } from '../engine/live';
import {
  LOCKOUT_KMH, SENSOR_RATES_HZ, settingsStore, TILT_UPDATE_OPTIONS_MS, updateSettings, type Settings,
} from '../engine/settings';
import { C } from '../gauges/kit';
import { GAUGE_LABEL, GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';
import { Btn, Row, Section, Segmented, Stepper, styles as ui, Toggle, TOUCH_TARGET_DP } from './controls';

const HPA_PER_INHG = 33.8639;
const gaugeOptions = GAUGE_REGISTRY.map(g => ({ value: g, label: GAUGE_LABEL[g] }));

function GaugeColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const swatch = (hex: string, label: string) => {
    const on = hex.toLowerCase() === value.toLowerCase();
    return (
      <Pressable key={label} onPress={() => onChange(hex)} accessibilityRole="radio" accessibilityLabel={label}
        accessibilityState={{ selected: on }} hitSlop={4}
        style={[styles.swatch, { backgroundColor: hex }, on && styles.swatchOn]} />
    );
  };
  const wheel = Array.from({ length: 12 }, (_, i) => i * 30).filter(h => !isReservedHue(h));
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.swatches}>{GAUGE_PRESETS.map(p => swatch(p.hex, p.name))}</View>
      <Text style={ui.hint}>Custom gauge colour</Text>
      <View style={styles.swatches}>{wheel.map(h => swatch(wheelColorAt(h), `Custom colour, hue ${h}°`))}</View>
    </View>
  );
}

export function SettingsScreen({ visible, onClose, onOpenGuide, onOpenTips }: {
  visible: boolean; onClose: () => void; onOpenGuide: () => void; onOpenTips: () => void;
}) {
  const s = settingsStore.use();
  const st = statusStore.use();
  const insets = useSafeAreaInsets();
  const [elevation, setElevation] = useState('');
  const [qnhText, setQnhText] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const imperial = s.units === 'imperial';
  const toMeters = (v: number) => (imperial ? v / 3.28084 : v);
  const fromMeters = (m: number) => Math.round(imperial ? m * 3.28084 : m);
  const tempShown = (c: number) => (imperial ? Math.round(c * 1.8 + 32) : Math.round(c));
  const tempFromShown = (v: number) => (imperial ? (v - 32) / 1.8 : v);
  const tUnit = imperial ? '°F' : '°C';

  const setSlot = (i: number, g: GaugeId) => {
    const next = [...s.groupGauges] as Settings['groupGauges'];
    next[i] = g;
    updateSettings({ groupGauges: next });
  };
  const usingHub = s.motionSource === 'hub' || s.engineSource === 'hub';
  const faults = hubFaults(st.hubStatusBits, st.hubStatus2Bits, st.hubFrameVersion, s.vehicleBus);
  const heading = {
    northRef: s.northRef, declinationMode: s.declinationMode, learnedDeclinationDeg: s.declinationDeg,
    manualDeclinationDeg: s.manualDeclinationDeg, headingOffsetDeg: s.headingOffsetDeg,
  };
  const say = async (p: Promise<string> | string) => setNote(await p);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
      <View style={[styles.screen, { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Settings</Text>
          {note ? <Text style={styles.note} numberOfLines={2} accessibilityLiveRegion="polite">{note}</Text> : <View style={{ flex: 1 }} />}
          <Btn label="Done" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Section title="DATA SOURCES" />
          <Row label="Tilt, compass, altitude" hint="Phone sensors need a rigid, non-magnetic mount">
            <Segmented label="Tilt, compass, altitude source" value={s.motionSource} onChange={v => updateSettings({ motionSource: v })}
              options={[{ value: 'phone', label: 'Phone' }, { value: 'hub', label: 'Hub' }, { value: 'demo', label: 'Demo' }]} />
          </Row>
          {s.motionSource === 'phone' ? (
            <Row label="Altitude source"
              hint={st.baroAvailable === false
                ? 'This phone has no barometer, so GPS height is used.'
                : 'Auto uses the barometer, or GPS if there is none.'}>
              <Segmented label="Altitude source" value={s.altitudeSource} onChange={v => updateSettings({ altitudeSource: v })}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'baro', label: 'Barometer' }, { value: 'gps', label: 'GPS' }]} />
            </Row>
          ) : null}
          <Row label="Temperatures, battery">
            <Segmented label="Temperatures and battery source" value={s.engineSource} onChange={v => updateSettings({ engineSource: v })}
              options={[{ value: 'hub', label: 'Hub' }, { value: 'demo', label: 'Demo' }, { value: 'off', label: 'Off' }]} />
          </Row>
          <Row label="Vehicle data bus"
            hint="TrailGauge works with or without a CAN/OBD-II port. Newer hub firmware says when it has no vehicle bus. If yours does not and your vehicle has no OBD-II port, choose None so a CAN error is not shown as a fault.">
            <Segmented label="Vehicle data bus" value={s.vehicleBus} onChange={v => updateSettings({ vehicleBus: v })}
              options={[{ value: 'auto', label: 'CAN / OBD-II' }, { value: 'none', label: 'None' }]} />
          </Row>

          <Section title="CALIBRATION" />
          <Row label="Zero level"
            hint="Tells TrailGauge which way is level and which way the vehicle faces. Park on flat ground with the phone in its mount, then zero. You can also hold ZERO at the top right of the dashboard.">
            <Btn label="Zero now" onPress={() => say(engine.zeroLevel())} />
            {s.mount ? <Btn label="Clear" quiet onPress={() => { engine.clearZero(); setNote('Zero cleared.'); }} /> : null}
          </Row>
          <Row label="Set current elevation" hint="From a map, trail sign or benchmark">
            <TextInput style={ui.input} value={elevation} onChangeText={setElevation} accessibilityLabel="Current elevation"
              keyboardType="numbers-and-punctuation" placeholder={altUnit(s.units)} placeholderTextColor={C.quiet} />
            <Btn label="Set" onPress={() => {
              const v = parseFloat(elevation.replace(',', ''));
              if (!Number.isFinite(v)) { setNote('Enter an elevation first.'); return; }
              say(engine.setElevation(toMeters(v)));
            }} />
          </Row>
          <Row label="Use GPS elevation"
            hint={st.gpsAltitudeM !== null
              ? `GPS reads ${fromMeters(st.gpsAltitudeM)} ${altUnit(s.units)}` +
                (st.gpsVerticalAccM ? ` (±${fromMeters(st.gpsVerticalAccM)})` : '') +
                '. GPS elevation is a fallback: it can be off by 30 m (100 ft) or more.'
              : 'Waiting for GPS.'}>
            <Btn label="Use GPS" quiet onPress={() => {
              const g = engine.gpsElevation();
              say(g === null ? 'No GPS fix yet.' : engine.setElevation(g));
            }} />
          </Row>

          <Section title="DISPLAY" />
          <Row label="Units">
            <Segmented label="Units" value={s.units} onChange={v => updateSettings({ units: v, speedUnit: speedUnitFor(v) })}
              options={[{ value: 'imperial', label: 'ft, °F' }, { value: 'metric', label: 'm, °C' }]} />
          </Row>
          <Row label="Speed unit" hint="Also switches with one tap on the Speed gauge.">
            <Segmented label="Speed unit" value={s.speedUnit} onChange={v => updateSettings({ speedUnit: v })}
              options={[{ value: 'mph', label: 'mph' }, { value: 'kmh', label: 'km/h' }]} />
          </Row>
          <Row label="Screen orientation"
            hint="Auto follows the phone's auto-rotate setting. Lock it here if auto-rotate is off on the phone, or so a bump never flips the screen.">
            <Segmented label="Screen orientation" value={s.orientation} onChange={v => updateSettings({ orientation: v })}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} />
          </Row>
          <Row label="Dashboard shows" hint="All on one screen suits a tablet">
            <Segmented label="Dashboard shows" value={s.groupShowsAll ? 'all' : 'pages'} onChange={v => updateSettings({ groupShowsAll: v === 'all' })}
              options={[{ value: 'pages', label: '3 per page' }, { value: 'all', label: 'All at once' }]} />
          </Row>
          {s.groupShowsAll ? null : [0, 1, 2].map(i => (
            <Row key={i} label={`First page gauge ${i + 1}`}
              hint={i === 0 ? 'The dashboard opens on these three gauges. Swipe sideways for the others, three at a time.' : undefined}>
              <Segmented label={`First page gauge ${i + 1}`} value={s.groupGauges[i]} onChange={g => setSlot(i, g)} options={gaugeOptions} />
            </Row>
          ))}
          <Row label="Gauge colour">
            <GaugeColorPicker value={s.gaugeColor} onChange={hex => updateSettings({ gaugeColor: hex })} />
          </Row>
          <Row label="Keep screen on" hint="While TrailGauge is open. Uses more battery: keep the phone charging.">
            <Toggle label="Keep screen on" value={s.keepScreenOn} onChange={v => updateSettings({ keepScreenOn: v })} />
          </Row>
          <Row label="Lock view while moving"
            hint={`Above ${LOCKOUT_KMH} km/h (5 mph), double-tap and swipes do nothing. Stops bumps from switching gauge views while driving. Settings and quick settings always stay available. You can also lock the view by hand from quick settings.`}>
            <Toggle label="Lock view while moving" value={s.lockViewWhileMoving} onChange={v => updateSettings({ lockViewWhileMoving: v })} />
          </Row>
          <Row label="Night mode" hint={st.hasLightSensor ? 'Auto uses the light sensor.' : 'Auto uses sunset at your GPS position, or the clock.'}>
            <Segmented label="Night mode" value={s.nightMode} onChange={v => updateSettings({ nightMode: v })}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </Row>
          <Row label="Night dimming" hint={`How much darker at night. Dims the screen brightness, so text keeps its contrast. ${st.night ? 'Night now.' : 'Day now.'}`}>
            <Stepper label="Night dimming" value={s.nightDimPct} unit="%" step={10} min={0} max={80}
              onChange={v => updateSettings({ nightDimPct: v })} />
          </Row>

          <Section title="ALERTS" />
          <Row label="Alert sound" hint="Uses media volume">
            <Toggle label="Alert sound" value={s.alertSound} onChange={v => updateSettings({ alertSound: v })} />
          </Row>
          <Row label="Alert vibration">
            <Toggle label="Alert vibration" value={s.alertVibrate} onChange={v => updateSettings({ alertVibrate: v })} />
          </Row>
          <Row label="Test alert"
            hint={s.muted ? 'All alerts are muted (MUTE on the dashboard)' :
              'Alerts beep and vibrate when a reading first turns amber or red; red alarms repeat every 30 seconds. Gauges always change colour, even when muted.'}
            warn={s.muted}>
            <Btn label="Amber" quiet onPress={() => alertMonitor.play('warn')} />
            <Btn label="Red" quiet onPress={() => alertMonitor.play('alarm')} />
          </Row>
          {s.mutedAlerts.length > 0 ? (
            <Row label="Muted on the gauges" hint={s.mutedAlerts.map(a => ALERT_LABEL[a]).join(', ')}>
              <Btn label="Unmute all" quiet onPress={() => updateSettings({ mutedAlerts: [], muted: false })} />
            </Row>
          ) : null}
          <Row label="Roll warning" hint="Amber at this angle, red 10° beyond. Advisory only.">
            <Stepper label="Roll warning" value={s.rollWarnDeg} unit="°" step={1} min={5} max={45} onChange={v => updateSettings({ rollWarnDeg: v })} />
          </Row>
          <Row label="Pitch warning" hint="Amber at this angle, red 10° beyond. Advisory only.">
            <Stepper label="Pitch warning" value={s.pitchWarnDeg} unit="°" step={1} min={5} max={45} onChange={v => updateSettings({ pitchWarnDeg: v })} />
          </Row>
          <Row label="Coolant warning" hint={`Amber at this temperature, red ${imperial ? '13 °F' : `${COOLANT_ALARM_MARGIN_C} °C`} above`}>
            <Stepper label="Coolant warning" value={tempShown(s.coolantWarnC)} unit={tUnit} step={imperial ? 2 : 1}
              min={tempShown(90)} max={tempShown(125)} onChange={v => updateSettings({ coolantWarnC: tempFromShown(v) })} />
          </Row>
          <Row label="Battery low" hint="Amber below this voltage, red 0.5 V below">
            <Stepper label="Battery low" value={s.batteryLowV} unit=" V" step={0.1} min={11} max={12.8}
              format={v => v.toFixed(1)} onChange={v => updateSettings({ batteryLowV: v })} />
          </Row>
          <Row label="Ice risk" hint="Outside temperature at or below this">
            <Stepper label="Ice risk" value={tempShown(s.iceRiskC)} unit={tUnit} step={1}
              min={tempShown(-2)} max={tempShown(5)} onChange={v => updateSettings({ iceRiskC: tempFromShown(v) })} />
          </Row>
          <Row label="Cabin temperature" hint="Above this. Needs a cabin sensor.">
            <Stepper label="Cabin temperature warning" value={tempShown(s.cabinWarnC)} unit={tUnit} step={1}
              min={tempShown(25)} max={tempShown(45)} onChange={v => updateSettings({ cabinWarnC: tempFromShown(v) })} />
          </Row>
          <Row label="Window fog warnings" hint="Windows likely to fog inside. Needs the cabin humidity sensor.">
            <Toggle label="Window fog warnings" value={s.fogWarnings} onChange={v => updateSettings({ fogWarnings: v })} />
          </Row>

          {usingHub ? (
            <>
              <Section title="HUB" />
              <Row label="Hub status" hint={st.hubName ?? undefined}>
                <Text style={ui.value}>{st.hub}</Text>
              </Row>
              {faults.length > 0 ? <Row label="Faults" hint={faults.join(', ')} warn /> : null}
              <Row label="Vehicle data bus" hint={vehicleBusLabel(st.hubStatus2Bits, st.hubFrameVersion, s.vehicleBus)} />
              <Row label="Paired hub" hint={s.hubDeviceId ?? 'None yet: connects to the first hub found'}>
                {s.hubDeviceId ? <Btn label="Forget" quiet onPress={() => updateSettings({ hubDeviceId: null })} /> : null}
              </Row>
            </>
          ) : null}

          <Section title="PERMISSIONS" />
          <Row label="Location" hint={st.locationGranted ? 'Location is allowed.' : 'Location is not allowed yet.'} warn={st.locationGranted === false}>
            {st.locationGranted ? null : <Btn label="Allow location" quiet onPress={async () => setNote((await engine.requestLocation()) ? 'Location allowed.' : 'Not allowed. You can change this in app info.')} />}
          </Row>
          {Platform.OS === 'android' ? (
            <Row label="Nearby devices (Bluetooth)" hint={st.bluetoothGranted ? 'Bluetooth allowed.' : 'Needed for the hub.'}>
              {st.bluetoothGranted ? null : <Btn label="Allow nearby devices" quiet onPress={async () => setNote((await requestBluetoothPermission()) ? 'Bluetooth allowed.' : 'Not allowed. You can change this in app info.')} />}
            </Row>
          ) : null}
          <Row label="App info" hint="Permissions, battery and notifications for TrailGauge">
            <Btn label="Open app info" quiet onPress={() => Linking.openSettings().catch(() => setNote('Could not open app info.'))} />
          </Row>

          <Section title="HELP" />
          <Row label="Setup guide" hint="Permissions, battery and calibration, step by step">
            <Btn label="Open the setup guide" quiet onPress={() => { onClose(); onOpenGuide(); }} />
          </Row>
          <Row label="Guides & tips" hint="Sensor placement, mounting, compass, altitude, fog, older vehicles">
            <Btn label="Open" quiet onPress={() => { onClose(); onOpenTips(); }} />
          </Row>

          <Row label="Show advanced settings" hint="Compass and altitude calibration, smoothing, diagnostics">
            <Toggle label="Show advanced settings" value={s.showAdvanced} onChange={v => updateSettings({ showAdvanced: v })} />
          </Row>

          {s.showAdvanced ? (
            <>
              <Section title="COMPASS" />
              <Row label="Compass calibration"
                hint={st.magCalActive
                  ? (st.magCalProgress ?? 'Turn the phone slowly in a figure-8, or drive a slow full circle.')
                  : 'Corrects magnetic interference that moves with the phone, such as a mount with metal parts. In the hand: turn the phone slowly in a figure-8 for 15 seconds. Mounted: drive a slow full circle in an open area. Then tap Finish.' +
                    (s.motionSource === 'phone' ? (s.magCal ? ' Calibrated. Redo after changing the mount.' : ' Not calibrated (Android’s own calibration is used).') : '')}>
                {st.magCalActive ? (
                  <>
                    <Btn label="Finish" onPress={() => say(engine.finishCompassCalibration())} />
                    <Btn label="Cancel" quiet onPress={() => { engine.cancelCompassCalibration(); setNote('Calibration cancelled.'); }} />
                  </>
                ) : (
                  <>
                    <Btn label="Start" onPress={() => say(engine.startCompassCalibration())} />
                    {s.magCal ? <Btn label="Clear" quiet onPress={() => { engine.clearCompassCalibration(); setNote('Compass calibration cleared.'); }} /> : null}
                  </>
                )}
              </Row>
              <Row label="North reference" hint={northRefSummary(heading) + ' True north matches maps and GPS bearings. Magnetic north matches a hand compass.'}>
                <Segmented label="North reference" value={s.northRef} onChange={v => updateSettings({ northRef: v })}
                  options={[{ value: 'true', label: 'True (T)' }, { value: 'magnetic', label: 'Magnetic (M)' }]} />
              </Row>
              {s.northRef === 'true' ? (
                <>
                  <Row label="Declination"
                    hint={s.declinationMode === 'gps'
                      ? (s.declinationDeg !== null ? `Learned: ${s.declinationDeg.toFixed(1)}° from GPS.` : 'Waiting for GPS to learn it')
                      : 'Entered by hand (east positive)'}>
                    <Segmented label="Declination" value={s.declinationMode} onChange={v => updateSettings({ declinationMode: v })}
                      options={[{ value: 'gps', label: 'From GPS' }, { value: 'manual', label: 'Manual' }]} />
                    {s.declinationMode === 'gps'
                      ? <Btn label="Re-learn" quiet onPress={() => { engine.resetDeclination(); setNote('Re-learning declination.'); }} />
                      : null}
                  </Row>
                  {s.declinationMode === 'manual' ? (
                    <Row label="Manual declination" hint="East positive">
                      <Stepper label="Manual declination" value={s.manualDeclinationDeg} unit="°" step={0.5} min={-30} max={30}
                        format={v => v.toFixed(1)} onChange={v => updateSettings({ manualDeclinationDeg: v })} />
                    </Row>
                  ) : null}
                </>
              ) : null}
              <Row label="Heading offset" hint="Trims the compass if the mount is not square to the vehicle. Point the vehicle at a known bearing (a straight road on a map) and adjust until the compass agrees.">
                <Stepper label="Heading offset" value={s.headingOffsetDeg} unit="°" step={1} min={-45} max={45}
                  onChange={v => updateSettings({ headingOffsetDeg: v })} />
              </Row>

              <Section title="ALTITUDE" />
              <Row label="Reference pressure (QNH)"
                hint={`Now ${imperial ? `${(s.qnhHpa / HPA_PER_INHG).toFixed(2)} inHg` : `${s.qnhHpa.toFixed(1)} hPa`}. Setting an elevation calculates this for you. Enter it directly if you have a local altimeter setting. From a weather report or nearby airport.`}>
                <TextInput style={ui.input} value={qnhText} onChangeText={setQnhText} accessibilityLabel="Reference pressure"
                  keyboardType="numbers-and-punctuation" placeholder={imperial ? 'inHg' : 'hPa'} placeholderTextColor={C.quiet} />
                <Btn label="Set" onPress={() => {
                  const v = parseFloat(qnhText.replace(',', '.'));
                  if (!Number.isFinite(v)) { setNote(imperial ? 'Enter inHg, e.g. 29.92.' : 'Enter hPa, e.g. 1013.'); return; }
                  say(engine.setQnh(imperial ? v * HPA_PER_INHG : v));
                }} />
              </Row>
              <Row label="Altitude offset" hint="Added to the reading. Setting an elevation resets it to zero.">
                <Stepper label="Altitude offset" value={fromMeters(s.altitudeOffsetM)} unit={` ${altUnit(s.units)}`}
                  step={imperial ? 10 : 5} min={imperial ? -1600 : -500} max={imperial ? 1600 : 500}
                  onChange={v => updateSettings({ altitudeOffsetM: toMeters(v) })} />
              </Row>

              <Section title="OUTSIDE TEMPERATURE" />
              <Row label="Outside temperature correction"
                hint={`At low speed, engine and pavement heat make a front-mounted sensor read high. With this on, the outside reading can fall freely but rises only slowly below 30 km/h (19 mph), and after start-up it keeps the last good reading until you have driven at speed for about a minute.${st.outsideHolding ? ' Holding now: reading is being kept from rising while slow.' : ''}`}>
                <Toggle label="Outside temperature correction" value={s.outsideTempCorrection} onChange={v => updateSettings({ outsideTempCorrection: v })} />
              </Row>
              {st.outsideDisagree ? (
                <Row label="Outside sensors disagree" warn
                  hint="The two outside sensors differ by more than 5 °C (9 °F). Check placement: one may be near a heat source." />
              ) : null}

              <Section title="TILT AND SENSORS" />
              <Row label="Tilt smoothing" hint="How much pitch and roll are smoothed">
                <Segmented label="Tilt smoothing" value={s.tiltSmoothing} onChange={v => updateSettings({ tiltSmoothing: v })}
                  options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
              </Row>
              <Row label="Tilt update rate" hint="How often pitch and roll numbers refresh">
                <Segmented label="Tilt update rate" value={String(s.tiltUpdateMs)} onChange={v => updateSettings({ tiltUpdateMs: Number(v) })}
                  options={TILT_UPDATE_OPTIONS_MS.map(ms => ({ value: String(ms), label: ms < 1000 ? `${1000 / ms}/s` : '1/s' }))} />
              </Row>
              {s.motionSource === 'phone' ? (
                <Row label="Phone sensor rate" hint="Higher is more responsive but uses more battery">
                  <Segmented label="Phone sensor rate" value={String(s.sensorRateHz)} onChange={v => updateSettings({ sensorRateHz: Number(v) })}
                    options={SENSOR_RATES_HZ.map(hz => ({ value: String(hz), label: `${hz} Hz` }))} />
                </Row>
              ) : null}

              <Section title="DIAGNOSTICS" />
              <Row label="Phone gravity (m/s²)" hint="Tip: the axis reading about +9.8 points up">
                <Text style={ui.value}>{st.gravity ? st.gravity.map(v => v.toFixed(1)).join('  ') : '--'}</Text>
              </Row>
              <Row label="Magnetic field" hint="Earth's field is 25–65 µT; outside that, something nearby is interfering">
                <Text style={[ui.value, st.magDisturbed && { color: C.warn }]}>{st.magFieldUt !== null ? `${st.magFieldUt} µT` : '--'}</Text>
              </Row>
              <Row label="Air pressure">
                <Text style={ui.value}>{st.pressureHpa !== null ? `${st.pressureHpa.toFixed(1)} hPa` : 'No barometer'}</Text>
              </Row>
              <Row label="Speed (GPS)">
                <Text style={ui.value}>{st.speedMps !== null ? `${fmtSpeed(st.speedMps, s.speedUnit)} ${speedUnitLabel(s.speedUnit)}` : '--'}</Text>
              </Row>
              {usingHub ? (
                <Row label="Telemetry frame">
                  <Text style={ui.value}>{st.hubFrameVersion !== null ? `V${st.hubFrameVersion}` : '--'}</Text>
                </Row>
              ) : null}
              <Row label="Alert levels" hint={ALERT_IDS.map(a => `${ALERT_LABEL[a]}: ${st.alertLevels[a] === null || st.alertLevels[a] === undefined ? '--' : ['ok', 'amber', 'red'][st.alertLevels[a]!]}`).join(' · ')} />
              <Row label="Tilt reads backwards?" hint="Flip only if nose-up shows as nose-down on this phone. Clears the zero.">
                <Segmented label="Tilt sign" value={s.gravitySign === 1 ? 'normal' : 'flipped'}
                  onChange={v => updateSettings({ gravitySign: v === 'normal' ? 1 : -1, mount: null })}
                  options={[{ value: 'normal', label: 'Normal' }, { value: 'flipped', label: 'Flipped' }]} />
              </Row>
              {st.message ? <Text style={ui.hint}>{st.message}</Text> : null}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 8, paddingTop: 8 },
  title: { color: C.ink, fontSize: 22, fontWeight: '700' },
  note: { flex: 1, color: C.accent, fontSize: 14 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: TOUCH_TARGET_DP, height: TOUCH_TARGET_DP, borderRadius: TOUCH_TARGET_DP / 2, borderWidth: 2, borderColor: C.bg },
  swatchOn: { borderColor: C.ink, borderWidth: 3 },
});
