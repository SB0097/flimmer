import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibraryError } from '@/components/library-actions';
import { PlaylistNameForm } from '@/components/playlist-name-dialog';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { library, useLibrary } from '@/services/library/store';
import type { VideoSummary } from '@/services/video-source';

export function SaveToPlaylistButton({
  video,
  compact = false,
}: {
  video: VideoSummary;
  compact?: boolean;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`In Playlist speichern: ${video.title}`}
        onPress={() => setVisible(true)}
        style={[
          styles.button,
          compact ? styles.compact : { backgroundColor: theme.backgroundElement },
        ]}>
        <MaterialIcons name="playlist-add" size={24} color={theme.text} />
        {!compact ? <ThemedText type="smallBold">Speichern</ThemedText> : null}
      </Pressable>
      {visible ? <PlaylistPicker video={video} onClose={() => setVisible(false)} /> : null}
    </>
  );
}

function PlaylistPicker({ video, onClose }: { video: VideoSummary; onClose: () => void }) {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { playlists } = useLibrary();
  const [creating, setCreating] = useState(false);
  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={() => (creating ? setCreating(false) : onClose())}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: bottom + 16 }]}>
          <View style={styles.heading}>
            <ThemedText type="subtitle" style={styles.flex}>
              {creating ? 'Neue Playlist' : 'In Playlists speichern'}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schließen"
              onPress={onClose}
              style={styles.compact}>
              <MaterialIcons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {video.title}
          </ThemedText>
          {creating ? (
            <PlaylistNameForm
              onCancel={() => setCreating(false)}
              onSave={(name) => {
                const id = library.createPlaylist(name, video);
                if (!id) return false;
                setCreating(false);
                return true;
              }}
            />
          ) : (
            <>
              <FlatList
                data={playlists}
                keyExtractor={(p) => p.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = item.videos.some((v) => v.id === video.id);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={item.name}
                      accessibilityState={{ checked: selected }}
                      onPress={() =>
                        selected
                          ? library.removePlaylistVideo(item.id, video.id)
                          : library.addPlaylistVideo(item.id, video)
                      }
                      style={styles.row}>
                      <MaterialIcons
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={24}
                        color={theme.text}
                      />
                      <View style={styles.flex}>
                        <ThemedText type="smallBold" numberOfLines={2}>
                          {item.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.videos.length} {item.videos.length === 1 ? 'Video' : 'Videos'}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    Erstelle deine erste Playlist für dieses Video.
                  </ThemedText>
                }
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreating(true)}
                style={styles.row}>
                <MaterialIcons name="add" size={24} color={theme.text} />
                <ThemedText type="smallBold">Neue Playlist</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">Fertig</ThemedText>
              </Pressable>
            </>
          )}
          <LibraryError />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { minHeight: 60, flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 8 },
  empty: { paddingVertical: 16 },
});
