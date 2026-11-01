import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoCard } from '@/components/video-card';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseVideoId } from '@/lib/youtube-url';
import { videoSource, type SearchPage, type VideoSummary } from '@/services/video-source';

export default function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const nextPage = useRef<SearchPage['next']>(undefined);
  const loadingMore = useRef(false);

  const submit = useCallback(async () => {
    const text = query.trim();
    if (!text) return;

    // Link oder Video-ID eingefügt → direkt abspielen
    const id = parseVideoId(text);
    if (id) {
      router.push({ pathname: '/watch/[id]', params: { id } });
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const page = await videoSource.search(text);
      setItems(page.items);
      nextPage.current = page.next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadMore = useCallback(async () => {
    if (!nextPage.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await nextPage.current();
      nextPage.current = page.next;
      setItems((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...page.items.filter((v) => !seen.has(v.id))];
      });
    } catch {
      nextPage.current = undefined;
    } finally {
      loadingMore.current = false;
    }
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText type="subtitle">Flimmer</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          placeholder="Suchen oder YouTube-Link einfügen"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Suchen"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <View style={styles.center}>
          <ThemedText type="smallBold">Suche fehlgeschlagen</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            {error}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VideoCard video={item} />}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          contentContainerStyle={{ paddingBottom: BottomTabInset }}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Suchbegriff eingeben oder einen YouTube-Link einfügen.
            </ThemedText>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  hint: {
    padding: Spacing.three,
    textAlign: 'center',
  },
});
