import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibraryError } from '@/components/library-actions';
import { MiniPlayer } from '@/components/mini-player';
import { PlaylistNameDialog } from '@/components/playlist-name-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoThumbnail } from '@/components/video-thumbnail';
import { useTheme } from '@/hooks/use-theme';
import { library, useLibrary } from '@/services/library/store';

export default function PlaylistsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { playlists } = useLibrary();
  const [creating, setCreating] = useState(false);
  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 160 }}
        ListHeaderComponent={
          <View style={styles.heading}>
            <ThemedText type="small" themeColor="textSecondary">
              Deine Playlists bleiben auf diesem Gerät.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCreating(true)}
              style={[styles.create, { backgroundColor: theme.backgroundElement }]}>
              <MaterialIcons name="add" size={24} color={theme.text} />
              <ThemedText type="smallBold">Neue Playlist</ThemedText>
            </Pressable>
            <LibraryError />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.videos.length} Videos`}
            onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: item.id } })}
            style={styles.row}>
            <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]}>
              {item.videos[0] ? (
                <VideoThumbnail
                  videoId={item.videos[0].id}
                  thumbnails={item.videos[0].thumbnails}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <MaterialIcons name="playlist-play" size={36} color={theme.textSecondary} />
              )}
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {item.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.videos.length} {item.videos.length === 1 ? 'Video' : 'Videos'}
              </ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        )}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            Noch keine Playlists. Lege hier eine Liste an oder tippe bei einem Video auf das
            Playlist-Symbol.
          </ThemedText>
        }
      />
      {creating ? (
        <PlaylistNameDialog
          title="Neue Playlist"
          onCancel={() => setCreating(false)}
          onSave={(name) => {
            const id = library.createPlaylist(name);
            if (!id) return false;
            setCreating(false);
            router.push({ pathname: '/playlist/[id]', params: { id } });
            return true;
          }}
        />
      ) : null}
      <MiniPlayer bottomInset={insets.bottom} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { gap: 12, marginBottom: 8 },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 24,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  cover: {
    width: 120,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { paddingVertical: 32, textAlign: 'center' },
});
