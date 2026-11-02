import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEvent } from 'expo';
import type { VideoPlayer } from 'expo-video';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { CATEGORY_INFO, manualSegmentAt, type Segment } from '@/lib/segments';
import { useSponsorSkip } from '@/services/playback/sponsor-skipper';
import { useSponsorSettings } from '@/services/settings/sponsor-settings';

interface Props {
  player: VideoPlayer;
  segments: Segment[];
}

/**
 * Hinweis nach automatischem Überspringen (mit „Rückgängig“) und
 * Überspringen-Knopf für Kategorien im Knopf-Modus.
 */
export function SponsorOverlay({ player, segments }: Props) {
  const settings = useSponsorSettings();
  const { toast, undo, markSkipped } = useSponsorSkip();
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  const manual = manualSegmentAt(segments, currentTime, settings);

  if (toast) {
    return (
      <View pointerEvents="box-none" style={styles.anchor}>
        <View style={styles.pill}>
          <ThemedText type="smallBold" style={styles.white}>
            {toast.label}
          </ThemedText>
          <Pressable onPress={undo} hitSlop={10} accessibilityRole="button">
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
            markSkipped(manual.uuid);
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
