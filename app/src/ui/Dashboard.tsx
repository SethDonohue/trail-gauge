import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bestGrid, chunk } from '../core/layout';
import { GaugeView } from '../gauges/GaugeView';
import { C } from '../gauges/kit';
import { GAUGE_LABEL, GAUGE_REGISTRY, type GaugeId } from '../gauges/registry';
import { statusStore } from '../engine/live';
import { settingsStore } from '../engine/settings';

type ViewState = { mode: 'GROUP' } | { mode: 'SINGLE'; index: number };

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_DP = 40;
const LOCKOUT_MPS = 8 / 3.6; // settings are locked above 8 km/h
const wrap = (i: number, n: number) => ((i % n) + n) % n;
const GAP = 12;

const makeDoubleTap = (onDoubleTap: () => void) =>
  Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .maxDistance(TAP_SLOP_DP)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) onDoubleTap();
    });

function Tile({ id, onOpen }: { id: GaugeId; onOpen: (id: GaugeId) => void }) {
  const gesture = useMemo(() => makeDoubleTap(() => onOpen(id)), [id, onOpen]);
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.tile}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={`${GAUGE_LABEL[id]} gauge. Double-tap to enlarge.`}
      >
        <GaugeView id={id} compact />
      </View>
    </GestureDetector>
  );
}

function SourceBadge() {
  const motion = settingsStore.useSelect(s => s.motionSource);
  const engineSrc = settingsStore.useSelect(s => s.engineSource);
  const hub = statusStore.useSelect(s => s.hub);
  const altSrc = statusStore.useSelect(s => s.altitudeSource);
  const parts: string[] = [];
  if (motion === 'demo' && engineSrc === 'demo') parts.push('DEMO');
  else {
    if (motion === 'phone') parts.push(altSrc === 'gps' ? 'PHONE SENSORS (GPS ALT)' : 'PHONE SENSORS');
    if (engineSrc === 'demo') parts.push('DEMO TEMPS');
    if (motion === 'hub' || engineSrc === 'hub') parts.push(`HUB: ${hub.toUpperCase()}`);
  }
  const warn = (motion === 'hub' || engineSrc === 'hub') && hub !== 'connected';
  return (
    <Text style={[styles.badge, warn && { color: C.warn }]} numberOfLines={1}>
      {parts.join('  ·  ')}
    </Text>
  );
}

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [view, setView] = useState<ViewState>({ mode: 'GROUP' });
  const chosen = settingsStore.useSelect(s => s.groupGauges);
  const showAll = settingsStore.useSelect(s => s.groupShowsAll);
  const groupGauges: readonly GaugeId[] = showAll ? GAUGE_REGISTRY : chosen;
  const [area, setArea] = useState({ w: 0, h: 0 });
  const onGroupLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - area.w) > 1 || Math.abs(height - area.h) > 1) setArea({ w: width, h: height });
  };
  const moving = statusStore.useSelect(s => (s.speedMps ?? 0) > LOCKOUT_MPS);
  const insets = useSafeAreaInsets();
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

  // A fling moves too far to count as a tap, so the two can never both fire.
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

  const pad = {
    paddingLeft: Math.max(insets.left, 12),
    paddingRight: Math.max(insets.right, 12),
  };

  const content =
    view.mode === 'GROUP' ? (
      <View style={[styles.group, pad]}>
        <View style={styles.grid} onLayout={onGroupLayout}>
          {area.w > 0
            ? chunk(groupGauges, bestGrid(groupGauges.length, area.w, area.h, GAP).cols).map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map((id, i) => <Tile key={`${id}-${r}-${i}`} id={id} onOpen={open} />)}
                </View>
              ))
            : null}
        </View>
      </View>
    ) : (
      <GestureDetector gesture={singleGesture}>
        <View style={[styles.single, pad]} collapsable={false}
          accessibilityLabel={`${GAUGE_LABEL[GAUGE_REGISTRY[view.index]]} gauge`}>
          <GaugeView id={GAUGE_REGISTRY[view.index]} compact={false} />
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
          <SourceBadge />
        </View>
        <Pressable
          onPress={onOpenSettings}
          disabled={moving}
          hitSlop={16}
          accessibilityLabel={moving ? 'Settings locked while moving' : 'Settings'}
        >
          <Text style={[styles.gear, moving && { color: C.faint }]}>{moving ? 'LOCKED' : 'SETTINGS'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  group: { flex: 1, paddingTop: 36, paddingBottom: 12 },
  grid: { flex: 1, gap: GAP },
  gridRow: { flex: 1, flexDirection: 'row', gap: GAP },
  tile: {
    flex: 1, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.edge, borderRadius: 16, overflow: 'hidden',
  },
  single: { flex: 1, paddingTop: 36, paddingBottom: 20 },
  dots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint },
  dotOn: { backgroundColor: C.accent },
  topBar: {
    position: 'absolute', top: 8, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16,
  },
  badgeWrap: { flex: 1, flexShrink: 1 },
  badge: { color: C.quiet, fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  gear: { color: C.quiet, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
});
