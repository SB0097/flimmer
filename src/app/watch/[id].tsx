import { useEvent } from 'expo';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoCard } from '@/components/video-card';
import { CommentsPanel } from '@/components/watch/comments-panel';
import { PlayerControls } from '@/components/watch/player-controls';
import { QualitySheet } from '@/components/watch/quality-sheet';
import { SponsorOverlay } from '@/components/watch/sponsor-overlay';
import { VideoInfo } from '@/components/watch/video-info';
import { Spacing } from '@/constants/theme';
import { friendlyStreamError } from '@/lib/friendly-error';
import type { Segment } from '@/lib/segments';
import { applyPlaybackSettings } from '@/services/playback/background';
import { loadQualities, sourceForQuality, type QualityInfo } from '@/services/playback/quality';
import { fetchSegments } from '@/services/sponsorblock/sponsorblock';
import {
  StreamUnavailableError,
  videoSource,
  type CommentsResult,
  type PlaybackSource,
  type RelatedPage,
  type StreamAttempt,
  type StreamResult,
  type VideoDetails,
  type VideoSummary,
  type WatchPage,
} from '@/services/video-source';
import { playbackSettings, usePlaybackSettings } from '@/services/settings/playback-settings';

type StreamState =
  | { kind: 'loading' }
  | { kind: 'ready'; result: StreamResult }
  | { kind: 'error'; error: unknown; attempts: StreamAttempt[] };

async function playSource(
  player: VideoPlayer,
  source: PlaybackSource,
  details?: VideoDetails,
  startAt?: number,
) {
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
  if (startAt && startAt > 1) player.seekBy(startAt - player.currentTime);
  player.play();
}

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stream, setStream] = useState<StreamState>({ kind: 'loading' });
  const [page, setPage] = useState<WatchPage>();
  const [related, setRelated] = useState<VideoSummary[]>([]);
  const moreRelated = useRef<RelatedPage['more']>(undefined);
  const loadingMore = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [comments, setComments] = useState<CommentsResult | null>();
  const [showComments, setShowComments] = useState(false);
  const [qualities, setQualities] = useState<QualityInfo>();
  const [quality, setQuality] = useState<number>();
  const [showQuality, setShowQuality] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);

  const playback = usePlaybackSettings();
  const player = useVideoPlayer(null, (p) => {
    applyPlaybackSettings(p, playbackSettings.get());
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 0.5;
  });
  const { status, error: playerError } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });

  // Einstellung „Im Hintergrund weiterspielen“ live übernehmen
  useEffect(() => {
    applyPlaybackSettings(player, playback);
  }, [player, playback]);

  // Beim Verlassen der Seite pausieren und zurück ins Hochformat
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [player]),
  );

  // Stream, Seitendaten und Kommentare parallel laden
  useEffect(() => {
    let cancelled = false;

    async function loadStream() {
      try {
        const result = await videoSource.getStreams(id);
        if (cancelled) return;
        setStream({ kind: 'ready', result });
        setQuality(undefined);
        setQualities(undefined);
        await playSource(player, result.source, result.details);
        const info = await loadQualities(result.source).catch(() => undefined);
        if (!cancelled) setQualities(info);
      } catch (e) {
        if (cancelled) return;
        setStream({
          kind: 'error',
          error: e,
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

    async function loadComments() {
      try {
        const result = await videoSource.getComments(id, 'top');
        if (!cancelled) setComments(result);
      } catch {
        if (!cancelled) setComments(null);
      }
    }

    async function loadSegments() {
      try {
        const result = await fetchSegments(id);
        if (!cancelled) setSegments(result);
      } catch {
        if (!cancelled) setSegments([]);
      }
    }

    loadStream();
    loadPage();
    loadComments();
    loadSegments();
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

  const chooseQuality = useCallback(
    async (height: number | undefined) => {
      setShowQuality(false);
      if (stream.kind !== 'ready' || !qualities || height === quality) return;
      setQuality(height);
      const position = player.currentTime;
      const source = await sourceForQuality(stream.result.source, qualities, height, id);
      await playSource(player, source, details, position);
    },
    [stream, qualities, quality, player, id, details],
  );

  // Eigenes Vollbild: Querformat, nur das Video
  const setFullscreen = useCallback(async (on: boolean) => {
    setIsFullscreen(on);
    await ScreenOrientation.lockAsync(
      on
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [isFullscreen, setFullscreen]);

  const attempts =
    stream.kind === 'ready'
      ? stream.result.attempts
      : stream.kind === 'error'
        ? stream.attempts
        : [];

  // Fehler: entweder beim Ermitteln des Streams oder beim Abspielen
  const failure =
    stream.kind === 'error'
      ? friendlyStreamError(stream.error, stream.attempts)
      : stream.kind === 'ready' && status === 'error'
        ? friendlyStreamError(playerError?.message ?? playerError)
        : undefined;

  const qualityLabel =
    quality !== undefined
      ? qualities?.options.find((o) => o.height === quality)?.label
      : videoTrack?.size?.height
        ? `Auto · ${videoTrack.size.height}p`
        : 'Auto';

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
      <ThemedText type="code">SponsorBlock: {segments.length} Segmente</ThemedText>
      {videoTrack?.size ? (
        <ThemedText type="code">
          Spur: {videoTrack.size.width}x{videoTrack.size.height}
          {videoTrack.frameRate ? ` @ ${Math.round(videoTrack.frameRate)} fps` : ''}
        </ThemedText>
      ) : null}
      {status === 'error' && playerError ? (
        <ThemedText type="code">Player-Fehler: {playerError.message}</ThemedText>
      ) : null}
      {stream.kind === 'error' ? (
        <ThemedText type="code">
          Fehler: {stream.error instanceof Error ? stream.error.message : String(stream.error)}
        </ThemedText>
      ) : null}
      {attempts.map((a, i) => (
        <ThemedText key={i} type="code">
          {a.ok ? '✓' : '✗'} {a.via}: {a.message}
        </ThemedText>
      ))}
    </View>
  );

  return (
    <ThemedView style={[styles.container, isFullscreen && styles.fullscreenContainer]}>
      <StatusBar style="light" hidden={isFullscreen} />
      <SafeAreaView
        edges={isFullscreen ? [] : ['top']}
        style={[styles.videoSafeArea, isFullscreen && styles.flex]}>
        <View style={isFullscreen ? styles.videoFullscreen : styles.videoBox}>
          {stream.kind === 'ready' ? (
            <>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                nativeControls={false}
                allowsPictureInPicture
                contentFit="contain"
              />
              {!failure ? (
                <PlayerControls
                  player={player}
                  isLive={Boolean(details?.isLive)}
                  isFullscreen={isFullscreen}
                  onFullscreen={() => setFullscreen(!isFullscreen)}
                  onOpenSettings={qualities ? () => setShowQuality(true) : undefined}
                  qualityLabel={qualities ? qualityLabel : undefined}
                  segments={segments}
                />
              ) : null}
              {!failure && segments.length > 0 ? (
                <SponsorOverlay player={player} segments={segments} />
              ) : null}
            </>
          ) : null}
          {!failure &&
          (stream.kind === 'loading' || (stream.kind === 'ready' && status === 'loading')) ? (
            <ActivityIndicator
              style={StyleSheet.absoluteFill}
              size="large"
              color="#fff"
              pointerEvents="none"
            />
          ) : null}
          {failure ? (
            <View style={[StyleSheet.absoluteFill, styles.errorBox]}>
              <ThemedText type="smallBold" style={styles.white}>
                {failure.title}
              </ThemedText>
              {failure.hint ? (
                <ThemedText type="small" style={[styles.white, styles.center]}>
                  {failure.hint}
                </ThemedText>
              ) : null}
              {failure.retryable ? (
                <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
                  <ThemedText type="smallBold" style={styles.white}>
                    Erneut versuchen
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      {!isFullscreen ? (
        <View style={styles.flex}>
          <FlatList
            data={related}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => <VideoCard video={item} />}
            ListHeaderComponent={
              <VideoInfo
                details={details}
                comments={comments}
                onOpenComments={() => setShowComments(true)}
                diagnostics={diagnostics}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={1.5}
          />
          {showComments ? (
            <CommentsPanel
              videoId={id}
              initial={comments ?? undefined}
              onClose={() => setShowComments(false)}
            />
          ) : null}
        </View>
      ) : null}

      <QualitySheet
        visible={showQuality}
        options={qualities?.options ?? []}
        selected={quality}
        autoHeight={quality === undefined ? videoTrack?.size?.height : undefined}
        onSelect={chooseQuality}
        onClose={() => setShowQuality(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullscreenContainer: {
    backgroundColor: '#000',
  },
  flex: {
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
  videoFullscreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  errorBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    backgroundColor: '#000',
  },
  retry: {
    marginTop: Spacing.two,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  white: {
    color: '#fff',
  },
  center: {
    textAlign: 'center',
  },
  diagnostics: {
    gap: Spacing.one,
  },
});
