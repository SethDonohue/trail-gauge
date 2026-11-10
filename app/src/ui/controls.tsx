import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C } from '../gauges/kit';

export const TOUCH_TARGET_DP = 44;

export function Segmented<T extends string>(props: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string;
}) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={props.label}>
      {props.options.map(o => {
        const on = o.value === props.value;
        return (
          <Pressable key={o.value} onPress={() => props.onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]}
            accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Btn({ label, onPress, quiet, disabled, style, onLongPress, delayLongPress, a11yHint }: {
  label: string; onPress?: () => void; quiet?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
  onLongPress?: () => void; delayLongPress?: number; a11yHint?: string;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={delayLongPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={a11yHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.btn, quiet && styles.btnQuiet, (pressed || disabled) && { opacity: 0.55 }, style]}>
      <Text style={[styles.btnText, quiet && { color: C.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8} accessibilityRole="switch"
      accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

export function Stepper({ value, unit, step, min, max, onChange, format, label }: {
  value: number; unit: string; step: number; min: number; max: number; onChange: (v: number) => void;
  format?: (v: number) => string; label: string;
}) {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      <Btn label="−" quiet onPress={() => onChange(round(Math.max(min, value - step)))} a11yHint={`Decrease ${label}`} />
      <Text style={styles.stepValue}>{`${format ? format(value) : value}${unit}`}</Text>
      <Btn label="+" quiet onPress={() => onChange(round(Math.min(max, value + step)))} a11yHint={`Increase ${label}`} />
    </View>
  );
}

export function Row({ label, hint, children, warn }: {
  label: string; hint?: string | null; children?: React.ReactNode; warn?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={[styles.hint, warn && { color: C.warn }]}>{hint}</Text> : null}
      </View>
      {children ? <View style={styles.rowControl}>{children}</View> : null}
    </View>
  );
}

export const Section = ({ title }: { title: string }) => (
  <Text style={styles.section} accessibilityRole="header">{title}</Text>
);

export const Para = ({ children }: { children: React.ReactNode }) => <Text style={styles.para}>{children}</Text>;

export const styles = StyleSheet.create({
  section: { color: C.quiet, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginTop: 22, marginBottom: 4 },
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge,
    columnGap: 16, rowGap: 8,
  },
  rowLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 220 },
  rowControl: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '100%' },
  label: { color: C.ink, fontSize: 16 },
  hint: { color: C.quiet, fontSize: 13, marginTop: 2, lineHeight: 18 },
  value: { color: C.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  para: { color: C.ink, fontSize: 16, lineHeight: 23, marginBottom: 12 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 10, borderWidth: 1, borderColor: C.control, overflow: 'hidden', flexShrink: 1 },
  segItem: { paddingHorizontal: 12, minHeight: TOUCH_TARGET_DP, justifyContent: 'center' },
  segOn: { backgroundColor: C.accent },
  segText: { color: C.quiet, fontSize: 14 },
  segTextOn: { color: C.bg, fontWeight: '700' },
  btn: {
    backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, minHeight: TOUCH_TARGET_DP,
    justifyContent: 'center', alignItems: 'center',
  },
  btnQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.control },
  btnText: { color: C.bg, fontSize: 15, fontWeight: '700' },
  toggle: {
    width: 52, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.control,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: C.accent, borderColor: C.accent },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.quiet },
  knobOn: { backgroundColor: C.bg, alignSelf: 'flex-end' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepValue: { color: C.ink, fontSize: 16, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: {
    color: C.ink, fontSize: 16, borderWidth: 1, borderColor: C.control, borderRadius: 10,
    paddingHorizontal: 12, minHeight: TOUCH_TARGET_DP, minWidth: 110,
  },
});
