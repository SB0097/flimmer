import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { LibraryError, SubscribeButton } from '@/components/library-actions';
import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoCard } from '@/components/video-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { library, useLibrary } from '@/services/library/store';
import {
  videoSource,
  type ChannelPage,
  type SearchPage,
  type VideoSummary,
} from '@/services/video-source';

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChannelContents key={id} id={id} />;
}

function ChannelContents({ id }: { id: string }) {
  const { subscriptions } = useLibrary();
  const theme = useTheme();
  const [page, setPage] = useState<ChannelPage>();
  const channel = page?.channel ?? subscriptions.find((saved) => saved.channel.id === id)?.channel;
  const [items, setItems] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const next = useRef<SearchPage['next']>(undefined);
  const busy = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    videoSource
      .getChannel(id)
      .then((result) => {
        if (cancelled) return;
        setPage(result);
        setItems(result.items);
        next.current = result.next;
        library.cache({
          key: `channel:${result.channel.id}`,
          items: result.items,
          fetchedAt: Date.now(),
        });
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Dieser Kanal konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [id, attempt]);
  const retry = () => {
    setLoading(true);
    setError(undefined);
    setAttempt((n) => n + 1);
  };
  const loadMore = useCallback(async () => {
    if (!next.current || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const result = await next.current();
      if (!active.current) return;
      next.current = result.next;
      setItems((previous) => [
        ...new Map([...previous, ...result.items].map((v) => [v.id, v])).values(),
      ]);
    } catch {
      if (active.current)
        setError('Weitere Videos konnten nicht geladen werden. Tippe auf „Weiterladen“.');
    } finally {
      busy.current = false;
      if (active.current) setLoadingMore(false);
    }
  }, []);

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: channel?.name ?? 'Kanal' }} />
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={styles.content}
        onEndReached={() => {
          if (!error) void loadMore();
        }}
        onEndReachedThreshold={1}
        ListHeaderComponent={
          <View style={styles.header}>
            {channel ? (
              <>
                <View style={styles.row}>
                  {channel.avatar ? (
                    <Image source={channel.avatar.url} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]} />
                  )}
                  <View style={styles.flex}>
                    <ThemedText type="title">{channel.name}</ThemedText>
                    {channel.subscriberCountText ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {channel.subscriberCountText}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
                <SubscribeButton channel={channel} />
                {page?.description ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
                    {page.description}
                  </ThemedText>
                ) : null}
                <ThemedText type="subtitle">Videos</ThemedText>
              </>
            ) : null}
            <LibraryError />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" style={styles.message} />
          ) : !error ? (
            <ThemedText themeColor="textSecondary" style={styles.message}>
              Dieser Kanal hat keine öffentlichen Videos.
            </ThemedText>
          ) : undefined
        }
        ListFooterComponent={
          <View style={styles.message}>
            {error ? (
              <>
                <ThemedText type="small" style={styles.center}>
                  {error}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={
                    page
                      ? () => {
                          setError(undefined);
                          void loadMore();
                        }
                      : retry
                  }
                  style={styles.retry}>
                  <ThemedText type="smallBold">
                    {page ? 'Weiterladen' : 'Erneut versuchen'}
                  </ThemedText>
                </Pressable>
              </>
            ) : null}
            {loadingMore ? <ActivityIndicator /> : null}
          </View>
        }
      />
      <MiniPlayer />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 180 },
  header: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  message: { padding: Spacing.four, gap: Spacing.two, alignItems: 'center' },
  center: { textAlign: 'center' },
  retry: { padding: Spacing.three, minHeight: 44 },
});
