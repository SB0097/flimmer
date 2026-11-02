import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QualityOption } from '@/lib/hls';

interface Props {
  visible: boolean;
  options: QualityOption[];
  /** `undefined` = Auto */
  selected?: number;
  /** Tatsächlich gespielte Höhe im Auto-Modus, z. B. 720 */
  autoHeight?: number;
  onSelect: (height: number | undefined) => void;
  onClose: () => void;
}

/** Auswahl der Videoqualität als Liste von unten, wie bei YouTube */
export function QualitySheet({ visible, options, selected, autoHeight, onSelect, onClose }: Props) {
  const theme = useTheme();

  const rows: { key: string; height: number | undefined; label: string; sub?: string }[] = [
    {
      key: 'auto',
      height: undefined,
      label: 'Automatisch',
      sub: autoHeight ? `gerade ${autoHeight}p` : 'passt sich der Verbindung an',
    },
    ...options.map((o) => ({ key: String(o.height), height: o.height, label: o.label })),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Schließen" />
      <ThemedView style={styles.sheet}>
        <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />
        <ThemedText type="smallBold" style={styles.title}>
          Qualität
        </ThemedText>
        {rows.map((row) => {
          const active = row.height === selected;
          return (
            <Pressable
              key={row.key}
              onPress={() => onSelect(row.height)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <View style={styles.check}>
                {active ? <MaterialIcons name="check" size={22} color={theme.text} /> : null}
              </View>
              <View style={styles.flex}>
                <ThemedText>{row.label}</ThemedText>
                {row.sub ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {row.sub}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Spacing.five,
    paddingTop: Spacing.two,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
  title: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.two,
  },
  check: {
    width: 28,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
