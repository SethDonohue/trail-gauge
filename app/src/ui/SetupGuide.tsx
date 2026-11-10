import React, { useState } from 'react';
import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engine } from '../engine/engine';
import { requestBluetoothPermission } from '../engine/hubSource';
import { statusStore } from '../engine/live';
import { settingsStore, updateSettings, type Settings } from '../engine/settings';
import { C } from '../gauges/kit';
import { GAUGE_LABEL, GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';
import { Btn, Para, Row, Segmented } from './controls';

function PermissionChip({ granted, yes, no }: { granted: boolean | null; yes: string; no: string }) {
  const ok = granted === true;
  return (
    <Text style={[styles.chip, { color: ok ? C.accent : granted === false ? C.warn : C.quiet }]}>
      {ok ? yes : granted === false ? no : 'Not asked yet.'}
    </Text>
  );
}

const openAppInfo = (setNote: (s: string) => void) =>
  Linking.openSettings().catch(() => setNote('Could not open app info.'));

export function SetupGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const s = settingsStore.use();
  const loc = statusStore.useSelect(st => st.locationGranted);
  const bt = statusStore.useSelect(st => st.bluetoothGranted);

  const finish = () => {
    updateSettings({ setupDone: true });
    setStep(0);
    setNote(null);
    onClose();
  };
  const setSlot = (i: number, g: GaugeId) => {
    const next = [...s.groupGauges] as Settings['groupGauges'];
    next[i] = g;
    updateSettings({ groupGauges: next });
  };
  const gaugeOptions = GAUGE_REGISTRY.map(g => ({ value: g, label: GAUGE_LABEL[g] }));

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Allow location',
      body: (
        <>
          <Para>Location gives speed, true north and GPS elevation. Choose “While using the app” and keep “Use precise location” on. TrailGauge does not use location in the background.</Para>
          <PermissionChip granted={loc} yes="Location is allowed." no="Location not allowed. You can change this in app info." />
          <View style={styles.buttons}>
            <Btn label="Allow location" onPress={async () => setNote((await engine.requestLocation()) ? 'Location allowed.' : 'Not allowed. You can change this in app info.')} />
            {loc === false ? <Btn label="Open app info" quiet onPress={() => openAppInfo(setNote)} /> : null}
          </View>
        </>
      ),
    },
    ...(Platform.OS === 'android' ? [{
      title: 'Allow nearby devices',
      body: (
        <>
          <Para>The TrailGauge hub connects over Bluetooth. Allow “Nearby devices” when asked. You can skip this until you have a hub.</Para>
          <PermissionChip granted={bt} yes="Bluetooth allowed." no="Not allowed. You can change this in app info." />
          <View style={styles.buttons}>
            <Btn label="Allow Bluetooth" onPress={async () => setNote((await requestBluetoothPermission()) ? 'Bluetooth allowed.' : 'Not allowed. You can change this in app info.')} />
            {bt === false ? <Btn label="Open app info" quiet onPress={() => openAppInfo(setNote)} /> : null}
          </View>
        </>
      ),
    }] : []),
    ...(Platform.OS === 'android' ? [{
      title: 'Battery settings',
      body: (
        <>
          <Para>On Samsung phones: open App info › Battery and choose “Unrestricted”, and turn off Power saving while driving. Otherwise Android may slow the sensors.</Para>
          <Para>Alert sounds use media volume, so keep it up.</Para>
          <View style={styles.buttons}><Btn label="Open app info" quiet onPress={() => openAppInfo(setNote)} /></View>
        </>
      ),
    }] : []),
    {
      title: 'Mount the phone',
      body: (
        <>
          <Para>Phone sensors measure the phone, not the vehicle, so the mount must be rigid. Avoid magnetic mounts and metal nearby: they throw off the compass.</Para>
          <Para>Keep the phone on a charger, because the screen stays on while TrailGauge is open.</Para>
        </>
      ),
    },
    {
      title: 'Choose your gauges',
      body: (
        <>
          <Para>The dashboard opens on these three gauges. Swipe sideways for the others, three at a time.</Para>
          {[0, 1, 2].map(i => (
            <Row key={i} label={`First page gauge ${i + 1}`}>
              <Segmented label={`First page gauge ${i + 1}`} value={s.groupGauges[i]} onChange={g => setSlot(i, g)} options={gaugeOptions} />
            </Row>
          ))}
        </>
      ),
    },
    {
      title: 'Zero and calibrate',
      body: (
        <>
          <Para>Park on level ground and hold ZERO (top right) for a second. Then enter a known elevation in Settings › Calibration.</Para>
          <View style={styles.buttons}>
            <Btn label="Hold to zero" delayLongPress={800} onLongPress={async () => setNote(await engine.zeroLevel())}
              a11yHint="Hold for a second to zero." />
          </View>
          <Para>You can reopen this guide from the dashboard menu or from Settings.</Para>
        </>
      ),
    },
  ];
  const i = Math.min(step, steps.length - 1);
  const last = i === steps.length - 1;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={finish}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <View style={[styles.screen, {
        paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20),
        paddingBottom: Math.max(insets.bottom, 16),
      }]}>
        <Text style={styles.kicker}>{`SETUP ${i + 1} OF ${steps.length}`}</Text>
        <Text style={styles.title} accessibilityRole="header">{steps[i].title}</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ maxWidth: 720, paddingBottom: 16 }}>
          {steps[i].body}
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </ScrollView>
        <View style={styles.nav}>
          <Btn label="Skip setup" quiet onPress={finish} />
          <View style={{ flex: 1 }} />
          {i > 0 ? <Btn label="Back" quiet onPress={() => { setNote(null); setStep(i - 1); }} /> : null}
          <Btn label={last ? 'Done' : 'Next'} onPress={() => { setNote(null); if (last) finish(); else setStep(i + 1); }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 20 },
  kicker: { color: C.quiet, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: C.ink, fontSize: 26, fontWeight: '700', marginTop: 6, marginBottom: 14 },
  chip: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  note: { color: C.accent, fontSize: 15, marginTop: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
});
