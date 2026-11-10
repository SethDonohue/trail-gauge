import React, { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { dewPointC, BATTERY_HIGH_ALARM_V, BATTERY_HIGH_WARN_V, BATTERY_ALARM_MARGIN_V,
  CABIN_ALARM_MARGIN_C, COOLANT_ALARM_MARGIN_C } from '../core/alerts';
import { usableGaugeColor } from '../core/colors';
import { fmtTemp, fmtVolts, tempUnit } from '../core/format';
import { live, readFresh, statusStore, useFresh } from '../engine/live';
import { settingsStore } from '../engine/settings';
import { Altimeter } from './Altimeter';
import { ArcGauge, type Level } from './ArcGauge';
import { Compass } from './Compass';
import { Inclinometer } from './Inclinometer';
import { C } from './kit';
import type { GaugeId } from './registry';

// Dew point for the Humidity gauge, refreshed every 2 s (it changes slowly).
function useDewPoint(enabled: boolean): number | null {
  const [dp, setDp] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const t = readFresh('cabin');
      const rh = readFresh('humidity');
      setDp(t !== null && rh !== null ? Math.round(dewPointC(t, rh) * 10) / 10 : null);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [enabled]);
  return dp;
}

export function GaugeView({ id, compact }: { id: GaugeId; compact: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const fresh = useFresh(id);
  const s = settingsStore.use();
  const disturbed = statusStore.useSelect(st => st.magDisturbed);
  const holding = statusStore.useSelect(st => st.outsideHolding);
  const disagree = statusStore.useSelect(st => st.outsideDisagree);
  const fog = statusStore.useSelect(st => st.alertLevels.fog ?? null);
  const dewPoint = useDewPoint(id === 'HUMIDITY');

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) {
      setSize({ w: width, h: height });
    }
  };

  const units = s.units;
  const accent = usableGaugeColor(s.gaugeColor);
  const { coolantWarnC, batteryLowV, iceRiskC, cabinWarnC } = s;
  const coolantLevel = (v: number): Level => {
    'worklet';
    return v >= coolantWarnC + COOLANT_ALARM_MARGIN_C ? 2 : v >= coolantWarnC ? 1 : 0;
  };
  const ambientLevel = (v: number): Level => {
    'worklet';
    return v <= iceRiskC ? 1 : 0; // ice risk
  };
  const batteryLevel = (v: number): Level => {
    'worklet';
    if (v < batteryLowV - BATTERY_ALARM_MARGIN_V || v > BATTERY_HIGH_ALARM_V) return 2;
    return v < batteryLowV || v > BATTERY_HIGH_WARN_V ? 1 : 0;
  };
  const cabinLevel = (v: number): Level => {
    'worklet';
    return v >= cabinWarnC + CABIN_ALARM_MARGIN_C ? 2 : v >= cabinWarnC ? 1 : 0;
  };
  const humidityLevel = (_v: number): Level => {
    'worklet';
    return 0; // the fog risk, not the humidity itself, is the alert: shown as a note
  };
  const temp = (v: number) => {
    'worklet';
    return fmtTemp(v, units);
  };
  const volts = (v: number) => {
    'worklet';
    return fmtVolts(v);
  };
  const pct = (v: number) => {
    'worklet';
    return Number.isFinite(v) ? `${Math.round(v)}` : '--';
  };
  const tLabel = (c: number) => fmtTemp(c, units);

  let body: React.ReactNode = null;
  if (size) {
    const common = { w: size.w, h: size.h, compact, fresh, accent };
    // Remount arc gauges when units, thresholds or colour change: their worklets capture those.
    const arcKey = `${units}-${coolantWarnC}-${batteryLowV}-${iceRiskC}-${cabinWarnC}-${accent}`;
    switch (id) {
      case 'INCLINOMETER':
        body = <Inclinometer {...common} pitchWarnDeg={s.pitchWarnDeg} rollWarnDeg={s.rollWarnDeg} />;
        break;
      case 'COMPASS':
        body = <Compass {...common} disturbed={disturbed} />;
        break;
      case 'ALTIMETER':
        body = <Altimeter {...common} units={units} qnhHpa={s.qnhHpa} />;
        break;
      case 'ENGINE_TEMP':
        body = (
          <ArcGauge key={arcKey} {...common} label="Coolant" unit={tempUnit(units)} value={live.coolant}
            min={40} max={130} minLabel={tLabel(40)} maxLabel={tLabel(130)}
            level={coolantLevel} format={temp} />
        );
        break;
      case 'AMBIENT_TEMP': {
        const note = !fresh ? null : disagree ? 'SENSORS DISAGREE' : holding ? 'HOLDING (SLOW)' : null;
        body = (
          <ArcGauge key={arcKey} {...common} label="Outside" unit={tempUnit(units)} value={live.ambient}
            min={-20} max={50} minLabel={tLabel(-20)} maxLabel={tLabel(50)}
            level={ambientLevel} format={temp} note={note} noteColor={disagree ? C.warn : C.quiet} />
        );
        break;
      }
      case 'BATTERY':
        body = (
          <ArcGauge key={arcKey} {...common} label="Battery" unit="V" value={live.battery}
            min={10} max={16} minLabel="10" maxLabel="16"
            level={batteryLevel} format={volts} />
        );
        break;
      case 'CABIN_TEMP':
        body = (
          <ArcGauge key={arcKey} {...common} label="Cabin" unit={tempUnit(units)} value={live.cabin}
            min={-10} max={50} minLabel={tLabel(-10)} maxLabel={tLabel(50)}
            level={cabinLevel} format={temp} />
        );
        break;
      case 'HUMIDITY': {
        const fogNote = fog === 2 ? 'WINDOW FOG' : fog === 1 ? 'FOG RISK' : null;
        const dp = dewPoint !== null && !compact ? `DEW POINT ${fmtTemp(dewPoint, units)}` : null;
        body = (
          <ArcGauge key={arcKey} {...common} label="Humidity" unit="%" value={live.humidity}
            min={0} max={100} minLabel="0" maxLabel="100"
            level={humidityLevel} format={pct}
            note={!fresh ? null : fogNote ?? dp} noteColor={fog === 2 ? C.alarm : fog === 1 ? C.warn : C.quiet} />
        );
        break;
      }
    }
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {size ? <Canvas style={{ width: size.w, height: size.h }}>{body}</Canvas> : null}
    </View>
  );
}
