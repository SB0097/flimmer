import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { downloads, useDownloads } from '@/services/downloads/store';
import type { DownloadMode, DownloadQuality } from '@/services/downloads/hls';
import type { VideoSummary } from '@/services/video-source';

export function DownloadButton({
  video,
  compact = false,
}: {
  video: VideoSummary;
  compact?: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const saved = useDownloads().items.filter((i) => i.video.id === video.id);
  const ready = saved.some((i) => i.status === 'ready');
  const busy = saved.some((i) => ['queued', 'downloading'].includes(i.status));
  if (video.isLive) return null;
  const add = (mode: DownloadMode, quality: DownloadQuality) => {
    try {
      downloads.add(video, mode, quality);
      router.push('/downloads');
    } catch (error) {
      Alert.alert(
        'Download nicht möglich',
        error instanceof Error ? error.message : 'Bitte erneut versuchen.',
      );
    }
  };
  // Android zeigt maximal drei Alert-Knöpfe: Auswahl daher in einem zweiten Dialog.
  const open = () =>
    Alert.alert(
      'Downloads',
      'Video oder nur die Tonspur speichern? Bitte Flimmer während des Downloads geöffnet lassen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Nur Audio', onPress: () => add('audio', 720) },
        {
          text: 'Video',
          onPress: () =>
            Alert.alert(
              'Video herunterladen',
              'Bitte Flimmer während des Downloads geöffnet lassen. Die tatsächlich verfügbare Auflösung kann niedriger sein.',
              [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Bis 360p', onPress: () => add('video', 360) },
                { text: 'Bis 720p', onPress: () => add('video', 720) },
              ],
            ),
        },
      ],
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ready || busy ? 'Downloads öffnen' : 'Herunterladen'}
      onPress={ready || busy ? () => router.push('/downloads') : open}
      style={[styles.button, !compact && { backgroundColor: theme.backgroundElement }]}>
      <MaterialIcons
        name={ready ? 'offline-pin' : busy ? 'downloading' : 'file-download'}
        size={22}
        color={theme.text}
      />
      {!compact ? (
        <ThemedText type="smallBold">{ready ? 'Offline' : busy ? 'Lädt …' : 'Download'}</ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 24,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
