import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { altUnit } from '../core/format';
import { engine } from '../engine/engine';
import { statusStore } from '../engine/live';
import { settingsStore, updateSettings, type Settings } from '../engine/settings';
import { C } from '../gauges/kit';
import { GAUGE_LABEL, GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';

function Segmented<T extends string>(props: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {props.options.map(o => {
        const on = o.value === props.value;
        return (
          <Pressable key={o.value} onPress={() => props.onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]} accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Btn({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, quiet && styles.btnQuiet, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.btnText, quiet && { color: C.quiet }]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ value, unit, step, min, max, onChange }: {
  value: number; unit: string; step: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Btn label="−" quiet onPress={() => onChange(Math.max(min, value - step))} />
      <Text style={styles.stepValue}>{`${value}${unit}`}</Text>
      <Btn label="+" quiet onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

const Section = ({ title }: { title: string }) => <Text style={styles.section}>{title}</Text>;

const gaugeOptions = GAUGE_REGISTRY.map(g => ({ value: g, label: GAUGE_LABEL[g] }));

export function SettingsScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = settingsStore.use();
  const st = statusStore.use();
  const insets = useSafeAreaInsets();
  const [elevation, setElevation] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const imperial = s.units === 'imperial';
  const toMeters = (v: number) => (imperial ? v / 3.28084 : v);
  const fromMeters = (m: number) => Math.round(imperial ? m * 3.28084 : m);
  const tempShown = (c: number) => (imperial ? Math.round(c * 1.8 + 32) : c);

  const setSlot = (i: number, g: GaugeId) => {
    const next = [...s.groupGauges] as Settings['groupGauges'];
    next[i] = g;
    updateSettings({ groupGauges: next });
  };

  const usingHub = s.motionSource === 'hub' || s.engineSource === 'hub';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
      <View style={[styles.screen, { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          {note ? <Text style={styles.note} numberOfLines={1}>{note}</Text> : <View style={{ flex: 1 }} />}
          <Btn label="Done" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <Section title="DATA SOURCES" />
          <Row label="Tilt, compass, altitude" hint="Phone sensors need a rigid, non-magnetic mount">
            <Segmented value={s.motionSource} onChange={v => updateSettings({ motionSource: v })}
              options={[{ value: 'phone', label: 'Phone' }, { value: 'hub', label: 'Hub' }, { value: 'demo', label: 'Demo' }]} />
          </Row>
          {s.motionSource === 'phone' ? (
            <Row label="Altitude source"
              hint={st.baroAvailable === false
                ? 'This device has no barometer, so GPS height is used.'
                : 'Auto uses the barometer, or GPS if there is none. Pick GPS if it reads better for you.'}>
              <Segmented value={s.altitudeSource} onChange={v => updateSettings({ altitudeSource: v })}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'baro', label: 'Barometer' }, { value: 'gps', label: 'GPS' }]} />
            </Row>
          ) : null}
          <Row label="Temperatures, battery">
            <Segmented value={s.engineSource} onChange={v => updateSettings({ engineSource: v })}
              options={[{ value: 'hub', label: 'Hub' }, { value: 'demo', label: 'Demo' }, { value: 'off', label: 'Off' }]} />
          </Row>

          <Section title="CALIBRATION" />
          <Row label="Zero level"
            hint={s.motionSource === 'phone'
              ? (s.mount ? 'Zeroed. Re-do if the mount moves.' : 'Not zeroed: park on level ground, then tap.')
              : 'Park on level ground, then tap.'}>
            <Btn label="Zero now" onPress={async () => setNote(await engine.zeroLevel())} />
            {s.mount ? <Btn label="Clear" quiet onPress={() => { engine.clearZero(); setNote('Zero cleared.'); }} /> : null}
          </Row>
          <Row label="Set current elevation" hint="From a map, trail sign or benchmark">
            <TextInput
              style={styles.input} value={elevation} onChangeText={setElevation}
              keyboardType="numbers-and-punctuation" placeholder={altUnit(s.units)} placeholderTextColor={C.quiet}
            />
            <Btn label="Set" onPress={async () => {
              const v = parseFloat(elevation.replace(',', ''));
              if (!Number.isFinite(v)) { setNote('Enter an elevation first.'); return; }
              setNote(await engine.setElevation(toMeters(v)));
            }} />
          </Row>
          <Row label="Use GPS elevation"
            hint={st.gpsAltitudeM !== null
              ? `GPS reads ${fromMeters(st.gpsAltitudeM)} ${altUnit(s.units)}` +
                (st.gpsVerticalAccM ? ` (±${fromMeters(st.gpsVerticalAccM)})` : '') +
                '. GPS height can be off by 100 ft; a known elevation is better.'
              : 'Waiting for GPS.'}>
            <Btn label="Use GPS" quiet onPress={async () => {
              const g = engine.gpsElevation();
              setNote(g === null ? 'No GPS fix yet.' : await engine.setElevation(g));
            }} />
          </Row>
          <Row label="Magnetic declination"
            hint={s.declinationDeg !== null
              ? `${s.declinationDeg.toFixed(1)}° — compass shows true north (T)`
              : 'Learned automatically once GPS has a fix. Until then the compass shows magnetic north (M).'}>
            <Btn label="Re-learn" quiet onPress={() => { engine.resetDeclination(); setNote('Re-learning declination.'); }} />
          </Row>

          <Section title="DISPLAY" />
          <Row label="Units">
            <Segmented value={s.units} onChange={v => updateSettings({ units: v })}
              options={[{ value: 'imperial', label: 'ft, °F' }, { value: 'metric', label: 'm, °C' }]} />
          </Row>
          <Row label="Screen rotation"
            hint="Locked stops trail bumps from rotating the screen. Split-screen always follows the window.">
            <Segmented value={s.orientation} onChange={v => updateSettings({ orientation: v })}
              options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }, { value: 'auto', label: 'Auto' }]} />
          </Row>
          <Row label="Group view shows" hint="All six suits a tablet">
            <Segmented value={s.groupShowsAll ? 'all' : 'three'} onChange={v => updateSettings({ groupShowsAll: v === 'all' })}
              options={[{ value: 'three', label: '3 chosen' }, { value: 'all', label: 'All 6' }]} />
          </Row>
          {s.groupShowsAll ? null : [0, 1, 2].map(i => (
            <Row key={i} label={`Group gauge ${i + 1}`}>
              <Segmented value={s.groupGauges[i]} onChange={g => setSlot(i, g)} options={gaugeOptions} />
            </Row>
          ))}
          <Row label="Roll warning" hint="Amber at this angle, red 10° beyond. Advisory only.">
            <Stepper value={s.rollWarnDeg} unit="°" step={1} min={5} max={45}
              onChange={v => updateSettings({ rollWarnDeg: v })} />
          </Row>
          <Row label="Pitch warning">
            <Stepper value={s.pitchWarnDeg} unit="°" step={1} min={5} max={45}
              onChange={v => updateSettings({ pitchWarnDeg: v })} />
          </Row>
          <Row label="Coolant warning" hint="Amber at this temperature, red 7 °C (13 °F) above">
            <Stepper value={tempShown(s.coolantWarnC)} unit={imperial ? '°F' : '°C'} step={imperial ? 2 : 1}
              min={tempShown(90)} max={tempShown(125)}
              onChange={v => updateSettings({ coolantWarnC: Math.round(imperial ? (v - 32) / 1.8 : v) })} />
          </Row>

          {usingHub ? (
            <>
              <Section title="HUB" />
              <Row label="Connection" hint={st.hubName ?? undefined}>
                <Text style={styles.value}>{st.hub}</Text>
              </Row>
              <Row label="Paired hub" hint={s.hubDeviceId ?? 'None yet: connects to the first hub found'}>
                {s.hubDeviceId ? <Btn label="Forget" quiet onPress={() => updateSettings({ hubDeviceId: null })} /> : null}
              </Row>
            </>
          ) : null}

          <Section title="DIAGNOSTICS" />
          <Row label="Phone gravity (m/s²)" hint="Tip: the axis reading about +9.8 points up">
            <Text style={styles.value}>
              {st.gravity ? st.gravity.map(v => v.toFixed(1)).join('  ') : '--'}
            </Text>
          </Row>
          <Row label="Magnetic field" hint="Earth's field is 25–65 µT; outside that, something nearby is interfering">
            <Text style={[styles.value, st.magDisturbed && { color: C.warn }]}>
              {st.magFieldUt !== null ? `${st.magFieldUt} µT` : '--'}
            </Text>
          </Row>
          <Row label="Air pressure">
            <Text style={styles.value}>{st.pressureHpa !== null ? `${st.pressureHpa.toFixed(1)} hPa` : 'No barometer'}</Text>
          </Row>
          <Row label="Location permission">
            <Text style={styles.value}>{st.locationGranted === null ? '…' : st.locationGranted ? 'Granted' : 'Denied'}</Text>
          </Row>
          <Row label="Tilt reads backwards?" hint="Flip only if nose-up shows as nose-down on this phone">
            <Segmented value={s.gravitySign === 1 ? 'normal' : 'flipped'}
              onChange={v => updateSettings({ gravitySign: v === 'normal' ? 1 : -1, mount: null })}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'flipped', label: 'Flipped' }]} />
          </Row>
          {st.message ? <Text style={styles.hint}>{st.message}</Text> : null}
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
  section: { color: C.quiet, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginTop: 20, marginBottom: 4 },
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge,
    columnGap: 16, rowGap: 8,
  },
  rowLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 220 },
  rowControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '100%' },
  label: { color: C.ink, fontSize: 16 },
  hint: { color: C.quiet, fontSize: 13, marginTop: 2 },
  value: { color: C.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 10, borderWidth: 1, borderColor: C.control, overflow: 'hidden', flexShrink: 1 },
  segItem: { paddingHorizontal: 12, paddingVertical: 8 },
  segOn: { backgroundColor: C.accent },
  segText: { color: C.quiet, fontSize: 14 },
  segTextOn: { color: C.bg, fontWeight: '700' },
  btn: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  btnQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.control },
  btnText: { color: C.bg, fontSize: 15, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepValue: { color: C.ink, fontSize: 16, minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: {
    color: C.ink, fontSize: 16, borderWidth: 1, borderColor: C.control, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, minWidth: 110,
  },
});
