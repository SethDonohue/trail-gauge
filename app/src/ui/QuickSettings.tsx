import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LOCKOUT_KMH, settingsStore, updateSettings } from '../engine/settings';
import { C } from '../gauges/kit';
import { Btn, Row, Segmented, Stepper, Toggle } from './controls';

export function QuickSettings({ visible, onClose, onOpenSettings, onOpenTips }: {
  visible: boolean; onClose: () => void; onOpenSettings: () => void; onOpenTips: () => void;
}) {
  const s = settingsStore.use();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close quick settings" />
      <View style={[styles.sheet, { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Quick settings</Text>
          <Btn label="Done" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <Row label="Mute all alerts" hint="Gauges still change colour">
            <Toggle value={s.muted} onChange={v => updateSettings({ muted: v })} label="Mute all alerts" />
          </Row>
          <Row label="Lock view"
            hint={`Double-tap and swipes do nothing. The view also locks by itself above ${LOCKOUT_KMH} km/h (5 mph) when that is on in Settings.`}>
            <Toggle value={s.viewLocked} onChange={v => updateSettings({ viewLocked: v })} label="Lock view" />
          </Row>
          <Row label="Night mode">
            <Segmented label="Night mode" value={s.nightMode} onChange={v => updateSettings({ nightMode: v })}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </Row>
          <Row label="Night dimming" hint="How much darker at night">
            <Stepper label="Night dimming" value={s.nightDimPct} unit="%" step={10} min={0} max={80}
              onChange={v => updateSettings({ nightDimPct: v })} />
          </Row>
          <Row label="Units">
            <Segmented label="Units" value={s.units} onChange={v => updateSettings({ units: v })}
              options={[{ value: 'imperial', label: 'ft, °F' }, { value: 'metric', label: 'm, °C' }]} />
          </Row>
          <Row label="Screen orientation">
            <Segmented label="Screen orientation" value={s.orientation} onChange={v => updateSettings({ orientation: v })}
              options={[{ value: 'auto', label: 'Auto' }, { value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} />
          </Row>
          <Row label="Keep screen on" hint="While TrailGauge is open. Uses more battery: keep the phone charging.">
            <Toggle value={s.keepScreenOn} onChange={v => updateSettings({ keepScreenOn: v })} label="Keep screen on" />
          </Row>
          <View style={styles.buttons}>
            <Btn label="All settings" quiet onPress={() => { onClose(); onOpenSettings(); }} />
            <Btn label="Guides & tips" quiet onPress={() => { onClose(); onOpenTips(); }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1,
    borderColor: C.control, maxHeight: '85%', paddingTop: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  title: { color: C.ink, fontSize: 20, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
});
