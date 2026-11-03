import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { playlistNeighbor } from '@/lib/playlists';
import { useNowPlaying } from '@/services/playback/now-playing';

export function PlaylistControls() {
  const theme = useTheme();
  const { playlist, videoId, stepPlaylist } = useNowPlaying();
  if (!playlist || !videoId) return null;
  const previous = playlistNeighbor(playlist.videoIds, videoId, -1);
  const next = playlistNeighbor(playlist.videoIds, videoId, 1);
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {playlist.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {playlist.videoIds.indexOf(videoId) + 1} / {playlist.videoIds.length} · Playlist
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Vorheriges Video"
        accessibilityState={{ disabled: !previous }}
        disabled={!previous}
        onPress={() => stepPlaylist(-1)}
        style={[styles.button, !previous && styles.disabled]}>
        <MaterialIcons name="skip-previous" size={28} color={theme.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nächstes Video"
        accessibilityState={{ disabled: !next }}
        disabled={!next}
        onPress={() => stepPlaylist(1)}
        style={[styles.button, !next && styles.disabled]}>
        <MaterialIcons name="skip-next" size={28} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
  },
  text: { flex: 1 },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
});
