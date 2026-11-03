import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { downloads, useDownloads } from '@/services/downloads/store';
import type { DownloadEntry } from '@/services/downloads/manager';
import { useNowPlaying } from '@/services/playback/now-playing';

function size(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}
const labels = {
  queued: 'Wartet',
  downloading: 'Wird heruntergeladen',
  ready: 'Offline verfügbar',
  interrupted: 'Unterbrochen',
  cancelled: 'Abgebrochen',
  error: 'Fehlgeschlagen',
};
function action(run: () => Promise<void>) {
  void run().catch((error) =>
    Alert.alert('Downloads', error instanceof Error ? error.message : 'Aktion fehlgeschlagen.'),
  );
}

export default function DownloadsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { items, error } = useDownloads();
  const now = useNowPlaying();
  const remove = (item: DownloadEntry) =>
    Alert.alert(
      'Download löschen?',
      `„${item.video.title}“ wird von diesem Gerät entfernt. Favoriten, Verlauf und Playlists bleiben erhalten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            action(async () => {
              if (
                now.videoId === item.video.id &&
                now.stream.kind === 'ready' &&
                now.stream.result.source.via.startsWith('Download')
              )
                now.close();
              await downloads.remove(item.id);
            }),
        },
      ],
    );
  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 160 }}
        ListHeaderComponent={
          <View style={styles.heading}>
            <ThemedText type="small" themeColor="textSecondary">
              Downloads bleiben in Flimmer auf diesem Gerät. Bitte die App während des Ladens
              geöffnet lassen. Nach einem Abbruch kannst du den Download neu starten.
            </ThemedText>
            <ThemedText type="smallBold">
              Gespeichert: {size(items.reduce((n, i) => n + i.bytes, 0))}
            </ThemedText>
            {error ? <ThemedText type="small">{error}</ThemedText> : null}
          </View>
        }
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            Noch keine Downloads. Tippe bei einem Video auf das Download-Symbol.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <View style={[styles.item, { backgroundColor: theme.backgroundElement }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.video.title} offline abspielen`}
              disabled={item.status !== 'ready'}
              onPress={() =>
                router.push({
                  pathname: '/watch/[id]',
                  params: { id: item.video.id, download: item.id },
                })
              }
              style={styles.row}>
              <MaterialIcons
                name={item.mode === 'audio' ? 'headphones' : 'play-circle-outline'}
                size={32}
                color={theme.text}
              />
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {item.video.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.video.channel.name} ·{' '}
                  {item.label ?? (item.mode === 'audio' ? 'Nur Audio' : `Bis ${item.quality}p`)}
                </ThemedText>
              </View>
            </Pressable>
            <ThemedText type="small">
              {labels[item.status]}
              {item.status === 'downloading'
                ? ` · ${Math.floor(item.progress * 100)} %`
                : ''} · {size(item.bytes)}
            </ThemedText>
            {item.status === 'downloading' ? (
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={{
                    height: 4,
                    width: `${Math.round(item.progress * 100)}%`,
                    backgroundColor: theme.text,
                  }}
                />
              </View>
            ) : null}
            {item.error ? (
              <ThemedText type="small" themeColor="textSecondary">
                {item.error}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              {!items.some(
                (other) => other.video.id === item.video.id && other.mode !== item.mode,
              ) ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => {
                    try {
                      downloads.add(item.video, item.mode === 'audio' ? 'video' : 'audio', 720);
                    } catch (error) {
                      Alert.alert(
                        'Downloads',
                        error instanceof Error ? error.message : 'Download nicht möglich.',
                      );
                    }
                  }}>
                  <ThemedText type="smallBold">
                    {item.mode === 'audio' ? 'Auch als Video laden' : 'Auch nur Audio laden'}
                  </ThemedText>
                </Pressable>
              ) : null}
              {['queued', 'downloading'].includes(item.status) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => action(() => downloads.cancel(item.id))}
                  style={styles.button}>
                  <ThemedText type="smallBold">Abbrechen</ThemedText>
                </Pressable>
              ) : null}
              {['error', 'interrupted', 'cancelled'].includes(item.status) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => action(() => downloads.retry(item.id))}
                  style={styles.button}>
                  <ThemedText type="smallBold">Erneut laden</ThemedText>
                </Pressable>
              ) : null}
              {item.status === 'ready' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/watch/[id]',
                      params: { id: item.video.id, download: item.id },
                    })
                  }
                  style={styles.button}>
                  <ThemedText type="smallBold">Abspielen</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => remove(item)}
                style={styles.button}>
                <ThemedText type="smallBold">Löschen</ThemedText>
              </Pressable>
            </View>
          </View>
        )}
      />
      <MiniPlayer bottomInset={insets.bottom} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { gap: 12, marginBottom: 16 },
  empty: { paddingVertical: 32, textAlign: 'center' },
  item: { borderRadius: 12, padding: 12, gap: 10, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  track: { height: 4, overflow: 'hidden', borderRadius: 2 },
});
