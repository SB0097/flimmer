import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibraryError } from '@/components/library-actions';
import { MiniPlayer } from '@/components/mini-player';
import { PlaylistNameDialog } from '@/components/playlist-name-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoThumbnail } from '@/components/video-thumbnail';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/format';
import { library, useLibrary } from '@/services/library/store';
import { useNowPlaying } from '@/services/playback/now-playing';

export default function PlaylistScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { playlists } = useLibrary();
  const playlist = playlists.find((p) => p.id === id);
  const { playPlaylist } = useNowPlaying();
  const [renaming, setRenaming] = useState(false);
  const play = (videoId?: string) => {
    if (!playlist) return;
    const startId = videoId ?? playlist.videos[0]?.id;
    if (!startId || !playPlaylist(id, startId)) return;
    router.push({ pathname: '/watch/[id]', params: { id: startId, playlist: id } });
  };
  const remove = () => {
    if (!playlist) return;
    Alert.alert(
      'Playlist löschen?',
      `„${playlist.name}“ wird von diesem Gerät entfernt. Verlauf und Favoriten bleiben erhalten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            if (library.deletePlaylist(id)) router.back();
          },
        },
      ],
    );
  };
  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: playlist?.name ?? 'Playlist' }} />
      {!playlist ? (
        <View style={styles.heading}>
          <LibraryError />
          <ThemedText>Diese Playlist ist nicht mehr vorhanden.</ThemedText>
        </View>
      ) : (
        <FlatList
          data={playlist.videos}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
          ListHeaderComponent={
            <View style={styles.heading}>
              <ThemedText type="small" themeColor="textSecondary">
                {playlist.videos.length} {playlist.videos.length === 1 ? 'Video' : 'Videos'} · Auf
                diesem Gerät
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !playlist.videos.length }}
                disabled={!playlist.videos.length}
                onPress={() => play()}
                style={[
                  styles.play,
                  { backgroundColor: theme.backgroundElement },
                  !playlist.videos.length && styles.disabled,
                ]}>
                <MaterialIcons name="play-arrow" size={24} color={theme.text} />
                <ThemedText type="smallBold">Alles abspielen</ThemedText>
              </Pressable>
              <View style={styles.buttons}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.textButton}
                  onPress={() => setRenaming(true)}>
                  <ThemedText type="smallBold">Umbenennen</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.textButton} onPress={remove}>
                  <ThemedText type="smallBold">Playlist löschen</ThemedText>
                </Pressable>
              </View>
              <LibraryError />
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}. ${item.title} abspielen`}
                style={styles.row}
                onPress={() => play(item.id)}>
                <VideoThumbnail
                  videoId={item.id}
                  thumbnails={item.thumbnails}
                  style={[styles.thumbnail, { backgroundColor: theme.backgroundElement }]}
                />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.channel.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {index + 1} ·{' '}
                    {item.isLive
                      ? 'LIVE'
                      : item.durationSeconds !== undefined
                        ? formatDuration(item.durationSeconds)
                        : 'Video'}
                  </ThemedText>
                </View>
              </Pressable>
              <View style={styles.buttons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Nach oben: ${item.title}`}
                  accessibilityState={{ disabled: index === 0 }}
                  disabled={index === 0}
                  onPress={() => library.movePlaylistVideo(id, item.id, -1)}
                  style={[styles.icon, index === 0 && styles.disabled]}>
                  <MaterialIcons name="arrow-upward" size={22} color={theme.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Nach unten: ${item.title}`}
                  accessibilityState={{ disabled: index === playlist.videos.length - 1 }}
                  disabled={index === playlist.videos.length - 1}
                  onPress={() => library.movePlaylistVideo(id, item.id, 1)}
                  style={[styles.icon, index === playlist.videos.length - 1 && styles.disabled]}>
                  <MaterialIcons name="arrow-downward" size={22} color={theme.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Aus Playlist entfernen: ${item.title}`}
                  onPress={() => library.removePlaylistVideo(id, item.id)}
                  style={styles.icon}>
                  <MaterialIcons name="playlist-remove" size={24} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Diese Playlist ist noch leer. Über das Playlist-Symbol bei einem Video kannst du es
              hier speichern.
            </ThemedText>
          }
        />
      )}
      {renaming && playlist ? (
        <PlaylistNameDialog
          title="Playlist umbenennen"
          initialName={playlist.name}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            if (!library.renamePlaylist(id, name)) return false;
            setRenaming(false);
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
  heading: { padding: 16, gap: 12 },
  play: {
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  textButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  item: { padding: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumbnail: { width: 128, aspectRatio: 16 / 9, borderRadius: 8 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  empty: { padding: 24, textAlign: 'center' },
});
