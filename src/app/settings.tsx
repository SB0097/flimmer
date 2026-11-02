import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_INFO, SEGMENT_CATEGORIES, type CategoryMode } from '@/lib/segments';
import {
  resetSponsorSettings,
  setCategoryMode,
  useSponsorSettings,
} from '@/services/settings/sponsor-settings';

const MODES: { mode: CategoryMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'manual', label: 'Knopf' },
  { mode: 'off', label: 'Aus' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const settings = useSponsorSettings();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">SponsorBlock</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Von der Community markierte Stellen in Videos. „Auto“ überspringt sie automatisch, „Knopf“
          zeigt einen Überspringen-Knopf, „Aus“ ignoriert sie. Gesendet wird nur ein Teil eines
          Hash-Werts der Video-ID, kein Konto nötig.
        </ThemedText>

        {SEGMENT_CATEGORIES.map((category) => {
          const info = CATEGORY_INFO[category];
          return (
            <View key={category} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: info.color }]} />
              <ThemedText type="small" style={styles.flex}>
                {info.label}
              </ThemedText>
              <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
                {MODES.map(({ mode, label }) => {
                  const active = settings[category] === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setCategoryMode(category, mode)}
                      style={[styles.segment, active && { backgroundColor: theme.text }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${info.label}: ${label}`}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: active ? theme.background : theme.text }}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

        <Pressable onPress={resetSponsorSettings} style={styles.reset} accessibilityRole="button">
          <ThemedText type="small" themeColor="textSecondary">
            Auf Standard zurücksetzen
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  reset: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
});
