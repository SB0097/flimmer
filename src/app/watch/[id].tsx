import { useEvent } from 'expo';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoCard } from '@/components/video-card';
import { PlayerControls } from '@/components/watch/player-controls';
import { VideoInfo } from '@/components/watch/video-info';
import { Spacing } from '@/constants/theme';
import {
  StreamUnavailableError,
  videoSource,
  type RelatedPage,
  type StreamAttempt,
  type StreamResult,
  type VideoSummary,
  type WatchPage,
} from '@/services/video-source';

type StreamState =
  | { kind: 'loading' }
  | { kind: 'ready'; result: StreamResult }
  | { kind: 'error'; message: string; attempts: StreamAttempt[] };

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stream, setStream] = useState<StreamState>({ kind: 'loading' });
  const [page, setPage] = useState<WatchPage>();
  const [related, setRelated] = useState<VideoSummary[]>([]);
  const moreRelated = useRef<RelatedPage['more']>(undefined);
  const loadingMore = useRef(false);
  const [attempt, setAttempt] = useState(0);

  const videoRef = useRef<VideoView>(null);
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 0.5;
  });
  const { status, error: playerError } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  // Beim Wechsel zu einem anderen Video (neue Seite im Stapel) dieses pausieren
  useFocusEffect(
    useCallback(() => {
      return () => player.pause();
    }, [player]),
  );

  // Stream und Seitendaten parallel laden
  useEffect(() => {
    let cancelled = false;

    async function loadStream() {
      try {
        const result = await videoSource.getStreams(id);
        if (cancelled) return;
        setStream({ kind: 'ready', result });
        const { source, details } = result;
        await player.replaceAsync({
          uri: source.uri,
          contentType: source.contentType,
          headers: source.headers,
          metadata: details
            ? {
                title: details.title,
                artist: details.channel.name,
                artwork: details.thumbnails.at(-1)?.url,
              }
            : undefined,
        });
        if (!cancelled) player.play();
      } catch (e) {
        if (cancelled) return;
        setStream({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
          attempts: e instanceof StreamUnavailableError ? e.attempts : [],
        });
      }
    }

    async function loadPage() {
      try {
        const result = await videoSource.getWatchPage(id);
        if (cancelled) return;
        setPage(result);
        setRelated(result.related);
        moreRelated.current = result.moreRelated;
      } catch {
        // Ohne Seitendaten bleibt der Player nutzbar; Basisdaten kommen aus dem Stream.
      }
    }

    loadStream();
    loadPage();
    return () => {
      cancelled = true;
    };
  }, [id, player, attempt]);

  const retry = useCallback(() => {
    setStream({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (!moreRelated.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const next = await moreRelated.current();
      moreRelated.current = next.more;
      setRelated((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...next.items.filter((v) => !seen.has(v.id) && v.id !== id)];
      });
    } catch {
      moreRelated.current = undefined;
    } finally {
      loadingMore.current = false;
    }
  }, [id]);

  const details = page?.details ?? (stream.kind === 'ready' ? stream.result.details : undefined);
  const attempts =
    stream.kind === 'ready'
      ? stream.result.attempts
      : stream.kind === 'error'
        ? stream.attempts
        : [];

  const diagnostics = (
    <View style={styles.diagnostics}>
      <ThemedText type="code">Video-ID: {id}</ThemedText>
      <ThemedText type="code">Quelle: {videoSource.name}</ThemedText>
      {stream.kind === 'ready' ? (
        <ThemedText type="code">
          Stream: {stream.result.source.contentType} über {stream.result.source.via}
        </ThemedText>
      ) : null}
      <ThemedText type="code">Player-Status: {status}</ThemedText>
      {status === 'error' && playerError ? (
        <ThemedText type="code">Player-Fehler: {playerError.message}</ThemedText>
      ) : null}
      {attempts.map((a, i) => (
        <ThemedText key={i} type="code">
          {a.ok ? '✓' : '✗'} {a.via}: {a.message}
        </ThemedText>
      ))}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.videoSafeArea}>
        <View style={styles.videoBox}>
          {stream.kind === 'ready' ? (
            <>
              <VideoView
                ref={videoRef}
                player={player}
                style={StyleSheet.absoluteFill}
                nativeControls={false}
                allowsPictureInPicture
                contentFit="contain"
              />
              <PlayerControls
                player={player}
                isLive={Boolean(details?.isLive)}
                onFullscreen={() => videoRef.current?.enterFullscreen()}
              />
            </>
          ) : null}
          {stream.kind === 'loading' || (stream.kind === 'ready' && status === 'loading') ? (
            <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color="#fff" />
          ) : null}
          {stream.kind === 'error' ? (
            <View style={styles.errorBox}>
              <ThemedText type="smallBold" style={styles.white}>
                Video kann nicht abgespielt werden
              </ThemedText>
              <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
                <ThemedText type="smallBold" style={styles.white}>
                  Erneut versuchen
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <FlatList
        data={related}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        ListHeaderComponent={<VideoInfo details={details} diagnostics={diagnostics} />}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoSafeArea: {
    backgroundColor: '#000',
  },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  errorBox: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  retry: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  white: {
    color: '#fff',
  },
  diagnostics: {
    gap: Spacing.one,
  },
});
