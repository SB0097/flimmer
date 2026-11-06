import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ListViewToken,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibraryError } from '@/components/library-actions';
import { ScrollStatusBar, useScrollingChrome } from '@/components/scroll-chrome';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoCard } from '@/components/video-card';
import { Spacing } from '@/constants/theme';
import { useForYou } from '@/hooks/use-for-you';
import { useTheme } from '@/hooks/use-theme';
import { parseVideoId } from '@/lib/youtube-url';
import { library } from '@/services/library/store';
import { videoSource, type SearchPage, type VideoSummary } from '@/services/video-source';

/** Ein Video zählt als gezeigt, wenn es 1,5 Sekunden lang größtenteils sichtbar war. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 1500 };

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const chrome = useScrollingChrome('home', insets.top + 96);
  const list = useRef<FlatList<VideoSummary>>(null);
  useScrollToTop(list);
  const feed = useForYou();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<VideoSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const nextPage = useRef<SearchPage['next']>(undefined);
  const busy = useRef(false);
  const request = useRef(0);
  const searchingRef = useRef(false);
  useEffect(() => {
    searchingRef.current = searching;
  }, [searching]);
  const counted = useRef(new Set<string>());
  // FlatList verlangt einen stabilen Callback. Gezählt wird nur „Für dich“,
  // jedes Video höchstens einmal, solange die Startseite offen ist.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      if (searchingRef.current) return;
      const fresh = viewableItems
        .map((token) => token.item?.id)
        .filter((id): id is string => !!id && !counted.current.has(id));
      fresh.forEach((id) => counted.current.add(id));
      if (fresh.length) library.recordImpressions(fresh);
    },
    [],
  );
  // Bei jedem Zurückkehren neu zählen; die Datenbank wertet höchstens alle drei Stunden.
  useFocusEffect(
    useCallback(() => {
      counted.current.clear();
    }, []),
  );

  const goHome = () => {
    chrome.show();
    list.current?.scrollToOffset({ offset: 0, animated: false });
    request.current++;
    nextPage.current = undefined;
    busy.current = false;
    setQuery('');
    setSearching(false);
    setLoading(false);
    setLoadingMore(false);
    setError(undefined);
  };
  const submit = useCallback(async () => {
    const text = query.trim();
    if (!text) return;
    const id = parseVideoId(text);
    if (id) {
      router.push({ pathname: '/watch/[id]', params: { id } });
      return;
    }
    const token = ++request.current;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    nextPage.current = undefined;
    busy.current = false;
    setSearching(true);
    setLoading(true);
    setLoadingMore(false);
    setError(undefined);
    setItems([]);
    try {
      const page = await videoSource.search(text);
      if (request.current !== token) return;
      setItems(page.items);
      nextPage.current = page.next;
    } catch {
      if (request.current === token)
        setError('Suche fehlgeschlagen. Prüfe die Verbindung und versuche es erneut.');
    } finally {
      if (request.current === token) setLoading(false);
    }
  }, [query, router]);
  const loadMore = useCallback(async () => {
    if (!nextPage.current || busy.current) return;
    const token = request.current;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await nextPage.current();
      if (request.current !== token) return;
      nextPage.current = page.next;
      setItems((prev) => [...new Map([...prev, ...page.items].map((v) => [v.id, v])).values()]);
    } catch {
      if (request.current === token)
        setError('Weitere Ergebnisse konnten nicht geladen werden. Tippe auf „Erneut versuchen“.');
    } finally {
      if (request.current === token) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  const shown = searching ? items : feed.items;
  const failure = searching ? error : feed.error;
  return (
    <ThemedView style={styles.container}>
      <Animated.View
        onLayout={chrome.onHeaderLayout}
        style={[styles.headerOverlay, { backgroundColor: theme.background }, chrome.headerStyle]}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.brand} accessibilityRole="header">
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logo}
              accessible={false}
            />
            <ThemedText type="title">Flimmer</ThemedText>
          </View>
          <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement }]}>
            {searching ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zur Startseite"
                onPress={goHome}
                style={styles.icon}>
                <MaterialIcons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
            ) : (
              <MaterialIcons
                name="search"
                size={22}
                color={theme.textSecondary}
                style={styles.searchIcon}
              />
            )}
            <TextInput
              value={query}
              onChangeText={(text) => {
                if (!text) goHome();
                else setQuery(text);
              }}
              onSubmitEditing={submit}
              onFocus={() => chrome.setEditing(true)}
              onBlur={() => chrome.setEditing(false)}
              placeholder="Suchen oder YouTube-Link einfügen"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Suchen"
              style={[styles.input, { color: theme.text }]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Suche leeren"
                onPress={goHome}
                style={styles.icon}>
                <MaterialIcons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      </Animated.View>
      <Animated.FlatList
        ref={list}
        onScroll={chrome.onScroll}
        scrollEventThrottle={16}
        data={shown}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={() => {
          if (searching && !error) void loadMore();
        }}
        onEndReachedThreshold={1.5}
        refreshing={!searching && feed.loading && shown.length > 0}
        onRefresh={
          searching
            ? undefined
            : () => {
                void feed.refresh();
              }
        }
        contentContainerStyle={{
          paddingTop: chrome.headerHeight,
          paddingBottom: chrome.barHeight + 160,
        }}
        progressViewOffset={chrome.headerHeight}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.heading}>
            {!searching ? (
              <>
                <ThemedText type="subtitle">
                  {feed.personalized ? 'Für dich' : 'Entdecken'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {feed.personalized
                    ? 'Aus deinen Abos, Favoriten und angesehenen Videos zusammengestellt.'
                    : 'Mit deinen ersten Videos, Favoriten und Abos wird diese Seite persönlicher.'}
                </ThemedText>
              </>
            ) : null}
            <LibraryError />
            {failure ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {failure}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  style={styles.retry}
                  onPress={
                    searching
                      ? () => {
                          setError(undefined);
                          if (items.length) void loadMore();
                          else void submit();
                        }
                      : () => {
                          void feed.refresh();
                        }
                  }>
                  <ThemedText type="smallBold">Erneut versuchen</ThemedText>
                </Pressable>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          (searching ? loading : feed.loading) ? (
            <ActivityIndicator style={styles.hint} size="large" />
          ) : !failure ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {searching
                ? 'Keine Videos gefunden. Versuche einen anderen Suchbegriff.'
                : 'Gerade keine neuen Vorschläge. Ziehe zum Aktualisieren nach unten oder nutze die Suche.'}
            </ThemedText>
          ) : undefined
        }
        ListFooterComponent={
          loadingMore && searching ? <ActivityIndicator style={styles.hint} /> : undefined
        }
      />
      <ScrollStatusBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 36 },
  logo: { width: 30, height: 30, borderRadius: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 22, minHeight: 44 },
  icon: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { marginLeft: Spacing.three, marginRight: Spacing.two },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.two,
    paddingRight: Spacing.two,
    fontSize: 15,
  },
  heading: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  retry: { minHeight: 44, justifyContent: 'center' },
  hint: { padding: Spacing.four, textAlign: 'center' },
});
