import { useEvent } from 'expo';
import {
  router,
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
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerVideo } from '@/components/player-video';
import { ThemedText } from '@/components/themed-text';
import { VideoCard } from '@/components/video-card';
import { CommentsPanel } from '@/components/watch/comments-panel';
import { PlayerControls } from '@/components/watch/player-controls';
import { PlayerMenu } from '@/components/watch/player-menu';
import { SponsorOverlay } from '@/components/watch/sponsor-overlay';
import { useMinimizeGesture } from '@/components/watch/use-minimize-gesture';
import { VideoInfo } from '@/components/watch/video-info';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyStreamError } from '@/lib/friendly-error';
import { library } from '@/services/library/store';
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
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const theme = useTheme();
  const nowPlaying = useNowPlaying();
  const focused = useIsFocused();
  const { player, open, retry, chooseQuality: choose, qualities, quality, segments } = nowPlaying;
  // Bis der Player auf dieses Video umgeschaltet hat, gilt es als „lädt“
  const isCurrent = nowPlaying.videoId === id;
  const stream: StreamState = isCurrent ? nowPlaying.stream : { kind: 'loading' };

  const [page, setPage] = useState<WatchPage>();
  const [related, setRelated] = useState<VideoSummary[]>([]);
  const moreRelated = useRef<RelatedPage['more']>(undefined);
  const loadingMore = useRef(false);
  const [comments, setComments] = useState<CommentsResult | null>();
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
      open(id);
      return () => {
        setIsFullscreen(false);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [id, open]),
  );

  // Seitendaten (Beschreibung, nächste Videos) und Kommentare laden
  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
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
      try {
        const result = await videoSource.getComments(id, 'top');
        if (!cancelled) setComments(result);
      } catch {
        if (!cancelled) setComments(null);
      }
    }

    loadPage();
    loadComments();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
  }, [navigation]);

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
            y: screenHeight - insets.bottom - 80 - 8 - height,
            width,
            height,
          };
      // Video sitzt im Hochformat immer direkt unter der Statusleiste, volle Breite.
      // Bewusst berechnet statt gemessen: Messen würde laufende Animationen mitzählen.
      const video: Frame = {
        x: 0,
        y: insets.top,
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
    : screenHeight - insets.bottom - 80;
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
    <View ref={rootRef} onLayout={measureRoot} style={styles.container}>
      <Animated.View
        style={[
          styles.container,
          isFullscreen && styles.fullscreenContainer,
          { transform: [{ translateY: enterY }] },
        ]}>
        {/* Hintergrund extra, damit er beim Runterziehen ausblenden kann (App darunter wird sichtbar) */}
        {!isFullscreen ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[styles.statusBand, { height: insets.top, opacity: swipe.backgroundOpacity }]}
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
          <SafeAreaView edges={isFullscreen ? [] : ['top']} style={isFullscreen && styles.flex}>
            <Animated.View style={isFullscreen ? styles.flex : swipe.videoStyle}>
              <View style={isFullscreen ? styles.videoFullscreen : styles.videoBox}>
                {stream.kind === 'ready' && focused ? (
                  <>
                    <PlayerVideo style={StyleSheet.absoluteFill} />
                    {!failure ? (
                      <PlayerControls
                        player={player}
                        isLive={Boolean(details?.isLive)}
                        isFullscreen={isFullscreen}
                        onFullscreen={() => setFullscreen(!isFullscreen)}
                        onOpenSettings={() => setShowQuality(true)}
                        qualityLabel={qualities ? qualityLabel : undefined}
                        segments={segments}
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
          </SafeAreaView>
        </View>

        {!isFullscreen ? (
          <Animated.View style={[styles.flex, { opacity: swipe.contentOpacity }]}>
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
          </Animated.View>
        ) : null}

        <PlayerMenu
          visible={showQuality}
          onClose={() => setShowQuality(false)}
          qualityOptions={qualities?.options ?? []}
          quality={quality}
          autoHeight={quality === undefined ? videoTrack?.size?.height : undefined}
          onSelectQuality={chooseQuality}
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
