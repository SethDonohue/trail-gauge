import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { fmtTemp, fmtVolts, tempUnit } from '../core/format';
import { live, statusStore, useFresh } from '../engine/live';
import { settingsStore } from '../engine/settings';
import { Altimeter } from './Altimeter';
import { ArcGauge, type Level } from './ArcGauge';
import { Compass } from './Compass';
import { Inclinometer } from './Inclinometer';
import type { GaugeId } from './registry';

export function GaugeView({ id, compact }: { id: GaugeId; compact: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const fresh = useFresh(id);
  const s = settingsStore.use();
  const disturbed = statusStore.useSelect(st => st.magDisturbed);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) {
      setSize({ w: width, h: height });
    }
  };

  const units = s.units;
  const warnC = s.coolantWarnC;
  const coolantLevel = (v: number): Level => {
    'worklet';
    return v >= warnC + 7 ? 2 : v >= warnC ? 1 : 0;
  };
  const ambientLevel = (v: number): Level => {
    'worklet';
    return v <= 2 ? 1 : 0; // ice risk
  };
  const batteryLevel = (v: number): Level => {
    'worklet';
    return v < 11.5 || v > 15.5 ? 2 : v < 12.0 || v > 14.9 ? 1 : 0;
  };
  const temp = (v: number) => {
    'worklet';
    return fmtTemp(v, units);
  };
  const volts = (v: number) => {
    'worklet';
    return fmtVolts(v);
  };
  const tLabel = (c: number) => fmtTemp(c, units);

  let body: React.ReactNode = null;
  if (size) {
    const common = { w: size.w, h: size.h, compact, fresh };
    // Remount arc gauges when units or thresholds change: their worklets capture those values.
    const arcKey = `${units}-${warnC}`;
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
      case 'AMBIENT_TEMP':
        body = (
          <ArcGauge key={arcKey} {...common} label="Outside" unit={tempUnit(units)} value={live.ambient}
            min={-20} max={50} minLabel={tLabel(-20)} maxLabel={tLabel(50)}
            level={ambientLevel} format={temp} />
        );
        break;
      case 'BATTERY':
        body = (
          <ArcGauge key={arcKey} {...common} label="Battery" unit="V" value={live.battery}
            min={10} max={16} minLabel="10" maxLabel="16"
            level={batteryLevel} format={volts} />
        );
        break;
    }
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {size ? <Canvas style={{ width: size.w, height: size.h }}>{body}</Canvas> : null}
    </View>
  );
}
