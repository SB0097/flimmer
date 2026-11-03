import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter, useScrollToTop } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
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
import { formatDuration } from '@/lib/format';
import { library, useLibrary } from '@/services/library/store';
import type { VideoSummary } from '@/services/video-source';

type Tab = 'Verlauf' | 'Favoriten' | 'Abos';

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const chrome = useScrollingChrome('library', insets.top + 120);
  const list = useRef<FlatList<VideoSummary>>(null);
  useScrollToTop(list);
  const saved = useLibrary();
  const [tab, setTab] = useState<Tab>('Verlauf');
  const feed = useForYou({ enabled: tab === 'Abos', subscriptionsOnly: true });
  const subscribedIds = new Set(saved.subscriptions.map((s) => s.channel.id));
  const items =
    tab === 'Verlauf'
      ? saved.history.map((h) => h.video)
      : tab === 'Favoriten'
        ? saved.favorites.map((f) => f.video)
        : feed.items.filter((v) => subscribedIds.has(v.channel.id));
  const counts = {
    Verlauf: saved.history.length,
    Favoriten: saved.favorites.length,
    Abos: saved.subscriptions.length,
  };
  const clearHistory = () =>
    Alert.alert(
      'Verlauf löschen?',
      'Die lokalen Sehpositionen und die daraus abgeleiteten Interessen werden entfernt. Favoriten und Abos bleiben erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => library.removeHistory() },
      ],
    );

  return (
    <ThemedView style={styles.flex}>
      <Animated.View
        onLayout={chrome.onHeaderLayout}
        style={[styles.headerOverlay, { backgroundColor: theme.background }, chrome.headerStyle]}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.row}>
            <ThemedText type="title" style={styles.flex}>
              Bibliothek
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Einstellungen öffnen"
              onPress={() => router.push('/settings')}
              style={styles.icon}>
              <MaterialIcons name="settings" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.row}>
            {(['Verlauf', 'Favoriten', 'Abos'] as Tab[]).map((name) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === name }}
                onPress={() => {
                  chrome.show();
                  list.current?.scrollToOffset({ offset: 0, animated: false });
                  setTab(name);
                }}
                style={[
                  styles.tab,
                  {
                    backgroundColor:
                      tab === name ? theme.backgroundSelected : theme.backgroundElement,
                  },
                ]}>
                <ThemedText type="smallBold">
                  {name} · {counts[name]}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </Animated.View>
      <Animated.FlatList
        ref={list}
        onScroll={chrome.onScroll}
        scrollEventThrottle={16}
        data={items}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{
          paddingTop: chrome.headerHeight,
          paddingBottom: chrome.barHeight + 160,
        }}
        progressViewOffset={chrome.headerHeight}
        refreshing={tab === 'Abos' && feed.loading}
        onRefresh={
          tab === 'Abos'
            ? () => {
                void feed.refresh();
              }
            : undefined
        }
        ListHeaderComponent={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Playlists öffnen: ${saved.playlists.length}`}
              onPress={() => router.push('/playlists')}
              style={styles.playlists}>
              <MaterialIcons name="playlist-play" size={28} color={theme.text} />
              <ThemedText type="smallBold" style={styles.flex}>
                Meine Playlists · {saved.playlists.length}
              </ThemedText>
              <MaterialIcons name="chevron-right" size={24} color={theme.textSecondary} />
            </Pressable>
            <LibraryError />
            {tab === 'Verlauf' && saved.history.length ? (
              <Pressable accessibilityRole="button" onPress={clearHistory} style={styles.clear}>
                <ThemedText type="smallBold">Verlauf löschen</ThemedText>
              </Pressable>
            ) : null}
            {tab === 'Abos' ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.channels}>
                  {saved.subscriptions.map(({ channel }) => (
                    <Pressable
                      key={channel.id}
                      style={styles.channel}
                      accessibilityRole="button"
                      accessibilityLabel={`Kanal öffnen: ${channel.name}`}
                      onPress={() =>
                        router.push({ pathname: '/channel/[id]', params: { id: channel.id } })
                      }>
                      {channel.avatar ? (
                        <Image source={channel.avatar.url} style={styles.avatar} />
                      ) : (
                        <View
                          style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}
                        />
                      )}
                      <ThemedText type="small" numberOfLines={2} style={styles.center}>
                        {channel.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
                {saved.subscriptions.length ? (
                  <ThemedText type="subtitle" style={styles.section}>
                    Neue Videos aus deinen Abos
                  </ThemedText>
                ) : null}
                {feed.error ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
                    {feed.error}
                  </ThemedText>
                ) : null}
              </>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const history =
            tab === 'Verlauf' ? saved.history.find((h) => h.video.id === item.id) : undefined;
          return (
            <View>
              <VideoCard video={item} />
              {tab !== 'Abos' ? (
                <View style={styles.itemActions}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    {history
                      ? `${new Date(history.lastWatchedAt).toLocaleDateString('de-DE')} · ${formatDuration(history.position)}${item.durationSeconds ? ` / ${formatDuration(item.durationSeconds)}` : ''}`
                      : 'Lokal favorisiert'}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      tab === 'Verlauf'
                        ? `${item.title} aus Verlauf entfernen`
                        : `${item.title} aus Favoriten entfernen`
                    }
                    onPress={() =>
                      tab === 'Verlauf'
                        ? library.removeHistory(item.id)
                        : library.toggleFavorite(item)
                    }
                    style={styles.icon}>
                    <MaterialIcons
                      name={tab === 'Verlauf' ? 'delete-outline' : 'favorite'}
                      size={22}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          tab === 'Abos' && feed.loading && saved.subscriptions.length ? (
            <ActivityIndicator style={styles.message} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
              {tab === 'Verlauf'
                ? 'Hier erscheinen Videos, die du mindestens kurz angesehen hast. Beim nächsten Öffnen geht es an deiner letzten Position weiter.'
                : tab === 'Favoriten'
                  ? 'Tippe unter einem Video auf „Favorit“, um es hier zu speichern.'
                  : saved.subscriptions.length
                    ? 'Aktuell keine ungesehenen Videos. Ziehe zum Aktualisieren nach unten oder öffne einen Kanal.'
                    : 'Abonniere einen Kanal auf seiner Kanalseite oder direkt unter einem Video. Deine Abos bleiben auf diesem Gerät.'}
            </ThemedText>
          )
        }
      />
      <ScrollStatusBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  playlists: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  clear: { alignSelf: 'flex-end', padding: Spacing.three, minHeight: 44 },
  message: { padding: Spacing.four, textAlign: 'center' },
  channels: { padding: Spacing.three, gap: Spacing.three },
  channel: { width: 76, alignItems: 'center', gap: Spacing.two },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  center: { textAlign: 'center' },
  section: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    marginTop: -Spacing.three,
    marginBottom: Spacing.three,
  },
});
