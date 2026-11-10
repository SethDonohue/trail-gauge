import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../gauges/kit';
import { Btn, Para, TOUCH_TARGET_DP } from './controls';
import { TIPS } from './tips';

export function TipsScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const tip = TIPS.find(t => t.id === open) ?? null;
  const close = () => {
    setOpen(null);
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (tip ? setOpen(null) : close())}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
      <View style={[styles.screen, { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <View style={styles.header}>
          {tip ? <Btn label="‹ Back" quiet onPress={() => setOpen(null)} /> : null}
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{tip ? tip.title : 'Guides & tips'}</Text>
          <Btn label="Done" onPress={close} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 32, maxWidth: 720 }}>
          {tip ? (
            tip.paragraphs.map((p, i) => <Para key={i}>{p}</Para>)
          ) : (
            TIPS.map(t => (
              <Pressable key={t.id} onPress={() => setOpen(t.id)} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
                accessibilityRole="button" accessibilityLabel={`More about ${t.title}`} accessibilityHint={t.summary}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{t.title}</Text>
                  <Text style={styles.itemHint}>{t.summary}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  title: { flex: 1, color: C.ink, fontSize: 22, fontWeight: '700' },
  item: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: TOUCH_TARGET_DP,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge,
  },
  itemTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  itemHint: { color: C.quiet, fontSize: 13, marginTop: 2 },
  chevron: { color: C.quiet, fontSize: 24, paddingLeft: 12 },
});
