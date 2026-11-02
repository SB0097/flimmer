import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_INFO, SEGMENT_CATEGORIES, type CategoryMode } from '@/lib/segments';
import { playbackSettings, usePlaybackSettings } from '@/services/settings/playback-settings';
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
  const playback = usePlaybackSettings();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Wiedergabe</ThemedText>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText>Im Hintergrund weiterspielen</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Ton läuft weiter, wenn du die App verlässt oder den Bildschirm sperrst. Steuerung über
              die Benachrichtigung.
            </ThemedText>
          </View>
          <Switch
            value={playback.background}
            onValueChange={(background) => playbackSettings.update({ background })}
            accessibilityLabel="Im Hintergrund weiterspielen"
          />
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText>Bild-im-Bild</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Verlässt du die App während eines Videos, läuft es in einem kleinen Fenster über
              anderen Apps weiter. Ist das aus, läuft nur der Ton weiter (wenn oben eingeschaltet).
            </ThemedText>
          </View>
          <Switch
            value={playback.pip}
            onValueChange={(pip) => playbackSettings.update({ pip })}
            accessibilityLabel="Bild-im-Bild"
          />
        </View>

        <ThemedText type="subtitle" style={styles.section}>
          SponsorBlock
        </ThemedText>
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
      <MiniPlayer />
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
  section: {
    marginTop: Spacing.three,
  },
  reset: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
});
