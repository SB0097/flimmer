import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEvent } from 'expo';
import type { VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { autoSkip, CATEGORY_INFO, manualSegmentAt, rearmable, type Segment } from '@/lib/segments';
import { useSponsorSettings } from '@/services/settings/sponsor-settings';

const TOAST_MS = 4000;

interface Props {
  player: VideoPlayer;
  segments: Segment[];
}

/**
 * Überspringt SponsorBlock-Segmente: automatisch (mit Hinweis und „Rückgängig“)
 * oder per Knopf, je nach Einstellung der Kategorie.
 */
export function SponsorOverlay({ player, segments }: Props) {
  const settings = useSponsorSettings();
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  const skipped = useRef(new Set<string>());
  const [toast, setToast] = useState<{ label: string; from: number; uuids: string[] }>();

  // Neue Segmente (anderes Video) → Gedächtnis zurücksetzen
  useEffect(() => {
    skipped.current = new Set();
  }, [segments]);

  // Automatisch überspringen
  useEffect(() => {
    // Zurückgespult vor ein schon übersprungenes Segment → wieder scharf schalten
    rearmable(segments, currentTime, skipped.current).forEach((id) => skipped.current.delete(id));
    const result = autoSkip(segments, currentTime, settings, skipped.current);
    if (!result) return;
    result.segments.forEach((s) => skipped.current.add(s.uuid));
    player.seekBy(result.to - player.currentTime);
    const labels = [...new Set(result.segments.map((s) => CATEGORY_INFO[s.category].short))];
    setToast({
      label: `${labels.join(' + ')} übersprungen`,
      from: result.segments[0].start,
      uuids: result.segments.map((s) => s.uuid),
    });
  }, [currentTime, segments, settings, player]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const manual = manualSegmentAt(segments, currentTime, settings);

  if (toast) {
    return (
      <View pointerEvents="box-none" style={styles.anchor}>
        <View style={styles.pill}>
          <ThemedText type="smallBold" style={styles.white}>
            {toast.label}
          </ThemedText>
          <Pressable
            onPress={() => {
              // Zurück an den Anfang; die Segmente bleiben als „übersprungen“ markiert
              player.seekBy(toast.from - player.currentTime);
              setToast(undefined);
            }}
            hitSlop={10}
            accessibilityRole="button">
            <ThemedText type="smallBold" style={styles.undo}>
              Rückgängig
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (manual) {
    return (
      <View pointerEvents="box-none" style={styles.anchor}>
        <Pressable
          onPress={() => {
            skipped.current.add(manual.uuid);
            player.seekBy(manual.end - player.currentTime);
          }}
          style={styles.pill}
          accessibilityRole="button">
          <ThemedText type="smallBold" style={styles.white}>
            {CATEGORY_INFO[manual.category].short} überspringen
          </ThemedText>
          <MaterialIcons name="skip-next" size={20} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.five + Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  white: {
    color: '#fff',
  },
  undo: {
    color: '#3EA6FF',
  },
});
