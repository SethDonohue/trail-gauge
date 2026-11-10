import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { AlertId } from '../core/alerts';
import { bestGrid, chunk } from '../core/layout';
import { gaugePages, pageAfterSwipe } from '../core/pages';
import { engine } from '../engine/engine';
import { statusStore } from '../engine/live';
import { LOCKOUT_MPS, settingsStore, updateSettings } from '../engine/settings';
import { GaugeView } from '../gauges/GaugeView';
import { C } from '../gauges/kit';
import { GAUGE_ALERTS, GAUGE_LABEL, GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';
import { TOUCH_TARGET_DP } from './controls';

type ViewState = { mode: 'GROUP' } | { mode: 'SINGLE'; index: number };

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_DP = 40;
const wrap = (i: number, n: number) => ((i % n) + n) % n;
const GAP = 12;
const ZERO_HOLD_MS = 800; // press and hold, so a bump on the trail can't re-zero by accident
const MUTE_BUTTON_SIZE_DP = 40;
const MUTE_BUTTON_INSET_DP = 4;

export interface DashboardActions {
  onOpenSettings: () => void;
  onOpenQuick: () => void;
  onOpenTips: () => void;
  onOpenGuide: () => void;
}

const makeDoubleTap = (onDoubleTap: () => void) =>
  Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .maxDistance(TAP_SLOP_DP)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) onDoubleTap();
    });

const makeSwipes = (onStep: (d: number) => void) => [
  Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd((_e, ok) => { if (ok) onStep(+1); }),
  Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd((_e, ok) => { if (ok) onStep(-1); }),
];

// True when bumps must not switch views: locked by hand, or moving with the lock enabled.
function useViewLocked(): boolean {
  const manual = settingsStore.useSelect(s => s.viewLocked);
  const whileMoving = settingsStore.useSelect(s => s.lockViewWhileMoving);
  const moving = statusStore.useSelect(s => (s.speedMps ?? 0) > LOCKOUT_MPS);
  return manual || (whileMoving && moving);
}

function SpeakerIcon({ muted, size, color }: { muted: boolean; size: number; color: string }) {
  const path = useMemo(() => {
    const k = size / 24;
    const p = Skia.PathBuilder.Make();
    p.moveTo(3 * k, 9 * k); p.lineTo(7 * k, 9 * k); p.lineTo(12 * k, 4.5 * k);
    p.lineTo(12 * k, 19.5 * k); p.lineTo(7 * k, 15 * k); p.lineTo(3 * k, 15 * k); p.close();
    return p.build();
  }, [size]);
  const extra = useMemo(() => {
    const k = size / 24;
    const p = Skia.PathBuilder.Make();
    if (muted) {
      p.moveTo(15 * k, 9 * k); p.lineTo(21 * k, 15 * k);
      p.moveTo(21 * k, 9 * k); p.lineTo(15 * k, 15 * k);
    } else {
      p.addArc(Skia.XYWHRect(9 * k, 7 * k, 7 * k, 10 * k), -60, 120);
      p.addArc(Skia.XYWHRect(8 * k, 4 * k, 12 * k, 16 * k), -60, 120);
    }
    return p.build();
  }, [size, muted]);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Path path={path} color={color} />
      <Path path={extra} color={color} style="stroke" strokeWidth={size / 12} strokeCap="round" />
    </Canvas>
  );
}

// The speaker button in a gauge's corner: mutes that gauge's alerts.
function GaugeMuteButton({ id }: { id: GaugeId }) {
  const alerts = GAUGE_ALERTS[id];
  const mutedAlerts = settingsStore.useSelect(s => s.mutedAlerts);
  const allMuted = settingsStore.useSelect(s => s.muted);
  if (alerts.length === 0) return null;
  const muted = alerts.every(a => mutedAlerts.includes(a));
  const toggle = () => {
    const rest = mutedAlerts.filter(a => !alerts.includes(a));
    updateSettings({ mutedAlerts: muted ? rest : [...rest, ...alerts] as AlertId[] });
  };
  const shownMuted = muted || allMuted;
  return (
    <Pressable onPress={toggle} hitSlop={8}
      style={styles.muteBtn}
      accessibilityRole="button"
      accessibilityLabel={`${GAUGE_LABEL[id]} alert sound`}
      accessibilityState={{ checked: !muted }}
      accessibilityHint={muted ? 'Alerts muted. Tap to unmute.' : 'Alert sounds on. Tap to mute.'}>
      <SpeakerIcon muted={shownMuted} size={22} color={shownMuted ? C.warn : C.quiet} />
    </Pressable>
  );
}

function Tile({ id, onOpen, locked }: { id: GaugeId; onOpen: (id: GaugeId) => void; locked: boolean }) {
  const gesture = useMemo(() => makeDoubleTap(() => { if (!locked) onOpen(id); }), [id, onOpen, locked]);
  return (
    <View style={styles.tile}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }} collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={`${GAUGE_LABEL[id]} gauge. Double-tap to enlarge.`}>
          <GaugeView id={id} compact />
        </View>
      </GestureDetector>
      <GaugeMuteButton id={id} />
    </View>
  );
}

function SourceBadge({ locked }: { locked: boolean }) {
  const motion = settingsStore.useSelect(s => s.motionSource);
  const eng = settingsStore.useSelect(s => s.engineSource);
  const muted = settingsStore.useSelect(s => s.muted);
  const hub = statusStore.useSelect(s => s.hub);
  const altSrc = statusStore.useSelect(s => s.altitudeSource);
  const night = statusStore.useSelect(s => s.night);
  const parts: string[] = [];
  if (motion === 'demo' && eng === 'demo') parts.push('DEMO');
  else {
    if (motion === 'phone') parts.push(altSrc === 'gps' ? 'PHONE SENSORS (GPS ALT)' : 'PHONE SENSORS');
    if (eng === 'demo') parts.push('DEMO TEMPS');
    if (motion === 'hub' || eng === 'hub') parts.push(`HUB: ${hub.toUpperCase()}`);
  }
  if (night) parts.push('NIGHT MODE');
  if (locked) parts.push('VIEW LOCKED');
  if (muted) parts.push('MUTED');
  return <Text style={styles.badge} numberOfLines={1}>{parts.join(' · ')}</Text>;
}

// Quick zero beside the menu: hold to make the current attitude read 0/0. Hidden in demo mode.
function ZeroButton() {
  const motion = settingsStore.useSelect(s => s.motionSource);
  const [state, setState] = useState<'idle' | 'holding' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (motion === 'demo') return null;

  const finish = async () => {
    const msg = await engine.zeroLevel();
    setState(/zeroed/i.test(msg) ? 'done' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  const label = { idle: 'ZERO', holding: 'HOLD…', done: 'ZEROED', failed: 'NO DATA' }[state];
  return (
    <Pressable
      onPressIn={() => setState(st => (st === 'idle' ? 'holding' : st))}
      onPressOut={() => setState(st => (st === 'holding' ? 'idle' : st))}
      onLongPress={finish}
      delayLongPress={ZERO_HOLD_MS}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel="Zero level. Press and hold."
      accessibilityHint="Hold for a second to zero."
    >
      <Text style={[styles.actionText, state === 'done' && { color: C.accent }, state === 'failed' && { color: C.warn }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MuteAllButton() {
  const muted = settingsStore.useSelect(s => s.muted);
  return (
    <Pressable onPress={() => updateSettings({ muted: !muted })} style={styles.action}
      accessibilityRole="switch" accessibilityState={{ checked: muted }}
      accessibilityLabel={muted ? 'Alerts muted. Tap to unmute.' : 'Alert sounds on. Tap to mute all alerts.'}>
      <Text style={[styles.actionText, muted && { color: C.warn }]}>{muted ? 'MUTED' : 'MUTE'}</Text>
    </Pressable>
  );
}

function MoreMenu({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: DashboardActions }) {
  const insets = useSafeAreaInsets();
  const item = (label: string, hint: string, fn: () => void) => (
    <Pressable key={label} onPress={() => { onClose(); fn(); }} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
      accessibilityRole="menuitem" accessibilityLabel={label} accessibilityHint={hint}>
      <Text style={styles.menuText}>{label}</Text>
      <Text style={styles.menuHint}>{hint}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu">
        <View style={[styles.menu, { marginRight: Math.max(insets.right, 12) }]} onStartShouldSetResponder={() => true}>
          {item('Quick settings', 'Mute, lock view, night mode, units', actions.onOpenQuick)}
          {item('All settings', 'Sources, alerts, calibration, display', actions.onOpenSettings)}
          {item('Guides & tips', 'Sensor placement, mounting, compass, altitude, fog, older vehicles', actions.onOpenTips)}
          {item('Setup guide', 'Permissions, battery and calibration, step by step', actions.onOpenGuide)}
        </View>
      </Pressable>
    </Modal>
  );
}

export function Dashboard(actions: DashboardActions) {
  const [view, setView] = useState<ViewState>({ mode: 'GROUP' });
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(false);
  const chosen = settingsStore.useSelect(s => s.groupGauges);
  const showAll = settingsStore.useSelect(s => s.groupShowsAll);
  const locked = useViewLocked();
  const pages = useMemo(() => gaugePages(chosen, GAUGE_REGISTRY), [chosen]);
  const pageIdx = Math.min(page, pages.length - 1);
  const groupGauges: readonly GaugeId[] = showAll ? GAUGE_REGISTRY : pages[pageIdx];
  const [area, setArea] = useState({ w: 0, h: 0 });
  const onGroupLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - area.w) > 1 || Math.abs(height - area.h) > 1) setArea({ w: width, h: height });
  };
  const insets = useSafeAreaInsets();
  const n = GAUGE_REGISTRY.length;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const open = useCallback(
    (id: GaugeId) => setView({ mode: 'SINGLE', index: GAUGE_REGISTRY.indexOf(id) }),
    [],
  );
  const close = useCallback(() => { if (!lockedRef.current) setView({ mode: 'GROUP' }); }, []);
  const step = useCallback(
    (delta: number) => {
      if (lockedRef.current) return;
      setView(v => (v.mode === 'SINGLE' ? { mode: 'SINGLE', index: wrap(v.index + delta, n) } : v));
    },
    [n],
  );
  const stepPage = useCallback(
    (delta: number) => { if (!lockedRef.current) setPage(p => pageAfterSwipe(p, delta, pages.length)); },
    [pages.length],
  );

  // A fling moves too far to count as a tap, so the two can never both fire.
  const singleGesture = useMemo(() => Gesture.Race(makeDoubleTap(close), ...makeSwipes(step)), [close, step]);
  const groupGesture = useMemo(() => Gesture.Race(...makeSwipes(stepPage)), [stepPage]);

  const pad = {
    paddingLeft: Math.max(insets.left, 12),
    paddingRight: Math.max(insets.right, 12),
  };
  const paged = !showAll && pages.length > 1;

  const content =
    view.mode === 'GROUP' ? (
      <GestureDetector gesture={groupGesture}>
        <View style={[styles.group, pad, paged && { paddingBottom: 22 }]} collapsable={false}
          accessibilityLabel={paged ? `Gauge page ${pageIdx + 1} of ${pages.length}. Swipe for more.` : undefined}>
          <View style={styles.grid} onLayout={onGroupLayout}>
            {area.w > 0
              ? chunk(groupGauges, bestGrid(groupGauges.length, area.w, area.h, GAP).cols).map((row, r) => (
                  <View key={r} style={styles.gridRow}>
                    {row.map((id, i) => <Tile key={`${id}-${r}-${i}`} id={id} onOpen={open} locked={locked} />)}
                  </View>
                ))
              : null}
          </View>
          {paged ? (
            <View style={styles.dots} pointerEvents="none">
              {pages.map((_, i) => <View key={i} style={[styles.dot, i === pageIdx && styles.dotOn]} />)}
            </View>
          ) : null}
        </View>
      </GestureDetector>
    ) : (
      <GestureDetector gesture={singleGesture}>
        <View style={[styles.single, pad]} collapsable={false}
          accessibilityLabel={`${GAUGE_LABEL[GAUGE_REGISTRY[view.index]]} gauge`}>
          <View style={{ flex: 1 }}>
            <GaugeView id={GAUGE_REGISTRY[view.index]} compact={false} />
            <GaugeMuteButton id={GAUGE_REGISTRY[view.index]} />
          </View>
          <View style={styles.dots} pointerEvents="none">
            {GAUGE_REGISTRY.map((g, i) => (
              <View key={g} style={[styles.dot, i === view.index && styles.dotOn]} />
            ))}
          </View>
        </View>
      </GestureDetector>
    );

  return (
    <View style={styles.container}>
      {content}
      <View style={[styles.topBar, pad]} pointerEvents="box-none">
        <View style={styles.badgeWrap}>
          <SourceBadge locked={locked} />
        </View>
        <MuteAllButton />
        <ZeroButton />
        <Pressable onPress={() => setMenu(true)} style={styles.action}
          accessibilityRole="button" accessibilityLabel="More: settings, guides and tips">
          <Text style={[styles.actionText, styles.more]}>•••</Text>
        </Pressable>
      </View>
      <MoreMenu visible={menu} onClose={() => setMenu(false)} actions={actions} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  group: { flex: 1, paddingTop: 44, paddingBottom: 12 },
  grid: { flex: 1, gap: GAP },
  gridRow: { flex: 1, flexDirection: 'row', gap: GAP },
  tile: {
    flex: 1, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.edge, borderRadius: 16, overflow: 'hidden',
  },
  single: { flex: 1, paddingTop: 44, paddingBottom: 20 },
  dots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.control },
  dotOn: { backgroundColor: C.accent },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 44,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  badgeWrap: { flex: 1, flexShrink: 1, paddingRight: 8 },
  badge: { color: C.quiet, fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  action: { minWidth: TOUCH_TARGET_DP, height: TOUCH_TARGET_DP, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: C.quiet, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  more: { fontSize: 14, letterSpacing: 2 },
  muteBtn: {
    position: 'absolute', top: MUTE_BUTTON_INSET_DP, right: MUTE_BUTTON_INSET_DP,
    width: MUTE_BUTTON_SIZE_DP, height: MUTE_BUTTON_SIZE_DP, alignItems: 'center', justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'flex-end' },
  menu: {
    marginTop: 44, backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.control,
    paddingVertical: 6, width: 320, maxWidth: '92%',
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 10, minHeight: TOUCH_TARGET_DP },
  menuText: { color: C.ink, fontSize: 16, fontWeight: '600' },
  menuHint: { color: C.quiet, fontSize: 13, marginTop: 2 },
});
