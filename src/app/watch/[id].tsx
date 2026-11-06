import { useEvent } from 'expo';
import {
  useRouter,
  Stack,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  BackHandler,
  FlatList,
  Pressable,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerVideo } from '@/components/player-video';
import { ThemedText } from '@/components/themed-text';
import { VideoCard } from '@/components/video-card';
import { CommentsPanel } from '@/components/watch/comments-panel';
import { PlayerControls } from '@/components/watch/player-controls';
import { PlaylistControls } from '@/components/watch/playlist-controls';
import { PlayerMenu } from '@/components/watch/player-menu';
import { SponsorOverlay } from '@/components/watch/sponsor-overlay';
import { useMinimizeGesture } from '@/components/watch/use-minimize-gesture';
import { VideoInfo } from '@/components/watch/video-info';
import { Spacing, TabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyStreamError } from '@/lib/friendly-error';
import { playlistNeighbor } from '@/lib/playlists';
import { library } from '@/services/library/store';
import { downloads } from '@/services/downloads/store';
import { getMiniPlayerFrame, type Frame } from '@/services/playback/mini-frame';
import { useNowPlaying, type StreamState } from '@/services/playback/now-playing';
import {
  videoSource,
  type CommentsResult,
  type RelatedPage,
  type VideoSummary,
  type WatchPage,
} from '@/services/video-source';

export default function WatchScreen() {
  const router = useRouter();
  const {
    id: routeId,
    from,
    playlist: playlistId,
    download: downloadId,
  } = useLocalSearchParams<{ id: string; from?: string; playlist?: string; download?: string }>();
  const theme = useTheme();
  const nowPlaying = useNowPlaying();
  const id =
    playlistId && nowPlaying.playlist?.id === playlistId && nowPlaying.videoId
      ? nowPlaying.videoId
      : routeId;
  const focused = useIsFocused();
  const { player, open, retry, chooseQuality: choose, qualities, quality, segments } = nowPlaying;
  // Bis der Player auf dieses Video umgeschaltet hat, gilt es als „lädt“
  const isCurrent = nowPlaying.videoId === id;
  const stream: StreamState = isCurrent ? nowPlaying.stream : { kind: 'loading' };

  const [page, setPage] = useState<WatchPage>();
  const [related, setRelated] = useState<VideoSummary[]>([]);
  const moreRelated = useRef<RelatedPage['more']>(undefined);
  const loadingMore = useRef(false);
  const pageRequest = useRef(0);
  const [loadedComments, setComments] = useState<{ id: string; result: CommentsResult | null }>();
  const comments = loadedComments?.id === id ? loadedComments.result : undefined;
  const [showComments, setShowComments] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { status, error: playerError } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });

  // Seite sichtbar → dieses Video abspielen (läuft es schon, z. B. aus dem
  // Mini-Player, geht es nahtlos weiter). Beim Verlassen zurück ins Hochformat;
  // die Wiedergabe läuft im Mini-Player weiter.
  useFocusEffect(
    useCallback(() => {
      open(routeId, playlistId, downloadId);
    }, [routeId, playlistId, downloadId, open]),
  );
  useFocusEffect(
    useCallback(
      () => () => {
        setIsFullscreen(false);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      },
      [],
    ),
  );

  // Seitendaten (Beschreibung, nächste Videos) und Kommentare laden
  useEffect(() => {
    if (!focused) return;
    const request = pageRequest.current + 1;
    pageRequest.current = request;
    loadingMore.current = false;
    moreRelated.current = undefined;
    let cancelled = false;

    async function loadPage() {
      try {
        const local = downloads.find(id, downloadId);
        if (local) {
          if (!cancelled) {
            setPage({ details: local.details ?? { ...local.video, description: '' }, related: [] });
            setRelated([]);
          }
          return;
        }
        const result = await videoSource.getWatchPage(id);
        if (cancelled) return;
        setPage(result);
        library.updateMetadata(result.details);
        library.cache({ key: `related:${id}`, items: result.related, fetchedAt: Date.now() });
        setRelated(result.related);
        moreRelated.current = result.moreRelated;
      } catch {
        // Ohne Seitendaten bleibt der Player nutzbar; Basisdaten kommen aus dem Stream.
      }
    }

    async function loadComments() {
      if (downloads.find(id, downloadId)) {
        if (!cancelled) setComments({ id, result: null });
        return;
      }
      try {
        const result = await videoSource.getComments(id, 'top');
        if (!cancelled) setComments({ id, result });
      } catch {
        if (!cancelled) setComments({ id, result: null });
      }
    }

    loadPage();
    loadComments();
    return () => {
      cancelled = true;
      pageRequest.current = request + 1;
    };
  }, [id, focused, downloadId]);

  const loadMore = useCallback(async () => {
    if (page?.details.id !== id || !moreRelated.current || loadingMore.current) return;
    loadingMore.current = true;
    const token = pageRequest.current;
    try {
      const next = await moreRelated.current();
      if (token !== pageRequest.current) return;
      moreRelated.current = next.more;
      setRelated((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...next.items.filter((v) => !seen.has(v.id) && v.id !== id)];
      });
    } catch {
      if (token === pageRequest.current) moreRelated.current = undefined;
    } finally {
      if (token === pageRequest.current) loadingMore.current = false;
    }
  }, [id, page]);

  const details =
    (page?.details.id === id ? page.details : undefined) ??
    (stream.kind === 'ready' ? stream.result.details : undefined);
  const queueIds = nowPlaying.playlist?.videoIds ?? [];

  const chooseQuality = useCallback(
    (height: number | undefined) => {
      setShowQuality(false);
      choose(height);
    },
    [choose],
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

  // Runterziehen → Video schrumpft in den Mini-Player. Danach alle Video-Seiten
  // schließen; die Seite hat keine eigene System-Animation (das Video sitzt schon im Mini-Player).
  const navigation = useNavigation();
  const minimize = useCallback(() => {
    const routes = navigation.getState()?.routes ?? [];
    let count = 0;
    for (let i = routes.length - 1; i >= 0 && routes[i].name === 'watch/[id]'; i--) count++;
    if (count > 0 && router.canDismiss()) router.dismiss(count);
    else router.replace('/');
  }, [navigation, router]);

  // Lage dieser Seite im Fenster – Bezugspunkt für die Mini-Player-Position
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [measured, setMeasured] = useState(false);
  const measureRoot = () =>
    rootRef.current?.measureInWindow((x, y) => {
      setOrigin({ x, y });
      setMeasured(true);
    });

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Nach dem Einblenden der Systemleisten können die Insets noch vom Vollbild
  // stammen (top=0). Auf Android die native Statusleistenhöhe als Untergrenze
  // verwenden, bis die neuen Insets eintreffen.
  const portraitTop = Math.max(
    insets.top,
    Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0,
  );
  const swipe = useMinimizeGesture({
    isFullscreen,
    getFrames: () => {
      // Alles relativ zu dieser Seite rechnen (Messungen in Fenster-Koordinaten
      // können je nach Seite um die Statusleiste verschoben sein)
      const width = screenWidth * 0.52;
      const height = (width * 9) / 16;
      const measured = getMiniPlayerFrame();
      const target = measured
        ? { ...measured, x: measured.x - origin.x, y: measured.y - origin.y }
        : // Noch nie gemessen → übliche Position unten rechts über der Tab-Leiste
          {
            x: screenWidth - 8 - width,
            y: screenHeight - insets.bottom - TabBarHeight - 8 - height,
            width,
            height,
          };
      // Video sitzt im Hochformat immer direkt unter der Statusleiste, volle Breite.
      // Bewusst berechnet statt gemessen: Messen würde laufende Animationen mitzählen.
      const video: Frame = {
        x: 0,
        y: portraitTop,
        width: screenWidth,
        height: (screenWidth * 9) / 16,
      };
      return { video, target };
    },
    onMinimize: minimize,
    onExitFullscreen: () => setFullscreen(false),
    onEnterFullscreen: () => setFullscreen(true),
    startMinimized: from === 'mini',
  });

  // Öffnen: aus dem Mini-Player heraus wachsen, sonst von unten hereinschieben
  const [enterY] = useState(() => new Animated.Value(from === 'mini' ? 0 : screenHeight));
  useLayoutEffect(() => {
    if (from === 'mini') {
      // wartet auf die Messung der Seite (siehe unten)
    } else {
      Animated.timing(enterY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    // nur beim ersten Anzeigen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minimizeVideo = swipe.minimize;
  // Aus dem Mini-Player: wachsen, sobald die Seite gemessen ist (Ziel stimmt erst dann)
  const expandFromMini = swipe.expandFromMini;
  useEffect(() => {
    if (from === 'mini' && measured) expandFromMini();
  }, [from, measured, expandFromMini]);

  // Zurück-Taste wie bei YouTube: Video schrumpft in den Mini-Player
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        minimizeVideo();
        return true;
      });
      return () => sub.remove();
    }, [minimizeVideo]),
  );

  // Bereich der Tab-Leiste (unter dem Mini-Fenster) – blendet beim Ziehen früher aus
  const miniFrame = getMiniPlayerFrame();
  const navTop = miniFrame
    ? miniFrame.y - origin.y + miniFrame.height + 8
    : screenHeight - insets.bottom - TabBarHeight;
  const navHeight = Math.max(0, screenHeight - navTop);

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

  const isLoading =
    !failure && (stream.kind === 'loading' || (stream.kind === 'ready' && status === 'loading'));

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
    <View
      ref={rootRef}
      onLayout={measureRoot}
      style={[styles.container, !isFullscreen && { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          statusBarHidden: isFullscreen,
          statusBarStyle: 'light',
          navigationBarHidden: isFullscreen,
        }}
      />
      <Animated.View
        style={[
          styles.container,
          isFullscreen && styles.fullscreenContainer,
          { transform: [{ translateY: enterY }] },
        ]}>
        {/* Hintergrund extra, damit er beim Runterziehen ausblenden kann (App darunter wird sichtbar) */}
        {!isFullscreen ? (
          // Reicht bis unter die Systemnavigation: Der Inhalt endet über ihr (paddingBottom),
          // ohne eigene Fläche schiene dort sonst die durchsichtige Seite darunter durch.
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: -insets.bottom }]}>
            <Animated.View
              style={[styles.statusBand, { height: portraitTop, opacity: swipe.backgroundOpacity }]}
            />
            <Animated.View
              style={[
                styles.flex,
                { backgroundColor: theme.background, opacity: swipe.backgroundOpacity },
              ]}
            />
            <Animated.View
              style={{
                height: navHeight,
                backgroundColor: theme.background,
                opacity: swipe.navOpacity,
              }}
            />
          </View>
        ) : null}
        <StatusBar style="light" hidden={isFullscreen} />
        <View {...swipe.panHandlers} style={isFullscreen && styles.flex}>
          <View style={isFullscreen ? styles.flex : { paddingTop: portraitTop }}>
            <Animated.View
              style={isFullscreen ? [styles.flex, swipe.fullscreenStyle] : swipe.videoStyle}>
              <View style={isFullscreen ? styles.videoFullscreen : styles.videoBox}>
                {stream.kind === 'ready' && focused ? (
                  <>
                    {/* SurfaceView nach einer echten Fenstergrößenänderung frisch anhängen.
                        Der globale Player bleibt bestehen, verliert also weder Position noch Ton. */}
                    <PlayerVideo
                      key={`video:${screenWidth}x${screenHeight}`}
                      style={StyleSheet.absoluteFill}
                    />
                    {!failure ? (
                      <PlayerControls
                        // Nach Rotation mit der final gemessenen Geometrie neu aufbauen.
                        // So behält der PanResponder der Zeitleiste weder alte Breiten
                        // noch einen während des Layoutwechsels begonnenen Touch-Zustand.
                        key={`${id}:${isFullscreen ? 'fullscreen' : 'inline'}:${screenWidth}x${screenHeight}`}
                        player={player}
                        isLive={Boolean(details?.isLive)}
                        isFullscreen={isFullscreen}
                        onFullscreen={() => setFullscreen(!isFullscreen)}
                        onOpenSettings={() => setShowQuality(true)}
                        qualityLabel={qualities ? qualityLabel : undefined}
                        segments={segments}
                        onPrevious={
                          playlistNeighbor(queueIds, id, -1)
                            ? () => nowPlaying.stepPlaylist(-1)
                            : undefined
                        }
                        onNext={
                          playlistNeighbor(queueIds, id, 1)
                            ? () => nowPlaying.stepPlaylist(1)
                            : undefined
                        }
                        isLoading={isLoading}
                      />
                    ) : null}
                    {!failure && segments.length > 0 ? (
                      <SponsorOverlay player={player} segments={segments} />
                    ) : null}
                  </>
                ) : null}
                {isLoading ? (
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
            </Animated.View>
          </View>
        </View>

        {!isFullscreen ? (
          <Animated.View style={[styles.flex, { opacity: swipe.contentOpacity }]}>
            <FlatList
              data={page?.details.id === id ? related : []}
              keyExtractor={(v) => v.id}
              renderItem={({ item }) => <VideoCard video={item} />}
              ListHeaderComponent={
                <>
                  <PlaylistControls />
                  <VideoInfo
                    key={id}
                    details={details}
                    comments={comments}
                    onOpenComments={() => setShowComments(true)}
                    diagnostics={diagnostics}
                  />
                </>
              }
              onEndReached={loadMore}
              onEndReachedThreshold={1.5}
            />
            {showComments ? (
              <CommentsPanel
                key={id}
                videoId={id}
                initial={comments ?? undefined}
                onClose={() => setShowComments(false)}
              />
            ) : null}
          </Animated.View>
        ) : null}

        <PlayerMenu
          visible={showQuality}
          onClose={() => setShowQuality(false)}
          qualityOptions={qualities?.options ?? []}
          quality={quality}
          autoHeight={quality === undefined ? videoTrack?.size?.height : undefined}
          onSelectQuality={chooseQuality}
          captions={
            stream.kind === 'ready' && stream.result.captions?.length
              ? stream.result.captions
              : page?.details.id === id
                ? page.captions
                : []
          }
          caption={nowPlaying.caption}
          captionBusy={nowPlaying.captionBusy}
          captionError={nowPlaying.captionError}
          onSelectCaption={nowPlaying.chooseCaption}
          sleepTimer={nowPlaying.sleepTimer}
          onSetSleepTimer={nowPlaying.setSleepTimer}
          isLive={Boolean(details?.isLive)}
        />
      </Animated.View>
    </View>
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
  statusBand: {
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
