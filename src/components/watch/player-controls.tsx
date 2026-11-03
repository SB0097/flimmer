import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEvent } from 'expo';
import type { VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { formatDuration } from '@/lib/format';
import { CATEGORY_INFO, type Segment } from '@/lib/segments';
import { useSponsorSettings } from '@/services/settings/sponsor-settings';
import {
  clampSeekTarget,
  DEFAULT_TAP_SEEK,
  handleTap,
  sideOf,
  type TapState,
} from '@/lib/tap-seek';

const HIDE_AFTER_MS = 3000;

interface Props {
  player: VideoPlayer;
  isLive: boolean;
  isFullscreen?: boolean;
  onFullscreen?: () => void;
  /** Öffnet die Qualitätsauswahl; ohne Angabe kein Zahnrad */
  onOpenSettings?: () => void;
  /** Kurzlabel neben dem Zahnrad, z. B. „720p“ oder „Auto“ */
  qualityLabel?: string;
  /** SponsorBlock-Segmente für farbige Markierungen im Fortschrittsbalken */
  segments?: Segment[];
  /** Während des Ladens nur der Ladekreis, kein Play-Knopf dahinter (wie YouTube) */
  isLoading?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

/**
 * Steuerung über dem Video im YouTube-Stil:
 * Tippen blendet ein/aus, links/rechts doppeltippen spult ±10 s,
 * Fortschrittsbalken zum Antippen oder Ziehen.
 */
export function PlayerControls({
  player,
  isLive,
  isFullscreen = false,
  onFullscreen,
  onOpenSettings,
  qualityLabel,
  segments = [],
  isLoading = false,
  onPrevious,
  onNext,
}: Props) {
  const insets = useSafeAreaInsets();
  const sponsorSettings = useSponsorSettings();
  const markers = segments.filter((seg) => sponsorSettings[seg.category] !== 'off');
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const duration = player.duration;

  const [visible, setVisible] = useState(true);
  const [seekHint, setSeekHint] = useState<{ side: 'left' | 'right'; total: number }>();
  const [dragFraction, setDragFraction] = useState<number>();
  const [width, setWidth] = useState(0);
  /** Zählt Bedienungen; jede startet den Ausblende-Timer neu */
  const [interaction, setInteraction] = useState(0);
  const touch = useCallback(() => setInteraction((n) => n + 1), []);

  const tapState = useRef<TapState>({});
  const seekHintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Steuerung beim Abspielen nach einigen Sekunden ohne Bedienung ausblenden
  useEffect(() => {
    if (!visible || !isPlaying || dragFraction !== undefined) return;
    const t = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [visible, isPlaying, dragFraction, interaction]);

  useEffect(() => () => clearTimeout(seekHintTimer.current), []);

  const onSurfacePress = useCallback(
    (e: GestureResponderEvent) => {
      const side = sideOf(e.nativeEvent.locationX, width);
      const { state, action } = handleTap(tapState.current, Date.now(), side);
      tapState.current = state;

      if (action.type === 'seek') {
        // Beim Spulen nur den Hinweis zeigen, nicht die Steuerung
        setVisible(false);
        const target = clampSeekTarget(player.currentTime, action.seconds, player.duration);
        player.seekBy(target - player.currentTime);
        setSeekHint({ side: action.side, total: action.total });
        clearTimeout(seekHintTimer.current);
        seekHintTimer.current = setTimeout(
          () => setSeekHint(undefined),
          DEFAULT_TAP_SEEK.seekModeMs + 200,
        );
        return;
      }

      // Einzeltipp sofort umsetzen; folgt ein zweiter Tipp, wird oben gespult
      setVisible((v) => !v);
      touch();
    },
    [player, width, touch],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    setVisible(true);
    touch();
  }, [player, touch]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onSurfacePress}
        accessibilityLabel="Video: tippen für Steuerung, links oder rechts doppeltippen zum Spulen"
      />

      {seekHint ? <SeekHint side={seekHint.side} total={seekHint.total} /> : null}

      {visible && !seekHint ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.scrim]}>
          <View pointerEvents="box-none" style={styles.center}>
            <View style={styles.playRow}>
              {onPrevious || onNext ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Vorheriges Video"
                  accessibilityState={{ disabled: !onPrevious }}
                  disabled={!onPrevious}
                  onPress={onPrevious}
                  style={[styles.skipButton, !onPrevious && { opacity: 0.3 }]}>
                  <MaterialIcons name="skip-previous" size={32} color="#fff" />
                </Pressable>
              ) : null}
              {isLoading ? null : (
                <Pressable
                  onPress={togglePlay}
                  style={styles.playButton}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}>
                  <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={44} color="#fff" />
                </Pressable>
              )}
              {onPrevious || onNext ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Nächstes Video"
                  accessibilityState={{ disabled: !onNext }}
                  disabled={!onNext}
                  onPress={onNext}
                  style={[styles.skipButton, !onNext && { opacity: 0.3 }]}>
                  <MaterialIcons name="skip-next" size={32} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View
            pointerEvents="box-none"
            style={[
              styles.bottomRow,
              isFullscreen && {
                paddingLeft: insets.left + 24,
                paddingRight: insets.right + 24,
                paddingBottom: insets.bottom + 44,
              },
            ]}>
            {isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <ThemedText type="smallBold" style={styles.white}>
                  LIVE
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="smallBold" style={styles.white}>
                {formatDuration(dragFraction !== undefined ? dragFraction * duration : currentTime)}
                <ThemedText type="small" style={styles.dim}>
                  {' / '}
                  {formatDuration(duration)}
                </ThemedText>
              </ThemedText>
            )}
            <View style={styles.rightButtons}>
              {onOpenSettings ? (
                <Pressable
                  onPress={() => {
                    touch();
                    onOpenSettings();
                  }}
                  hitSlop={10}
                  style={styles.settings}
                  accessibilityRole="button"
                  accessibilityLabel="Einstellungen">
                  <MaterialIcons name="settings" size={22} color="#fff" />
                  {qualityLabel ? (
                    <ThemedText type="smallBold" style={[styles.white, styles.qualityLabel]}>
                      {qualityLabel}
                    </ThemedText>
                  ) : null}
                </Pressable>
              ) : null}
              {onFullscreen ? (
                <Pressable
                  onPress={onFullscreen}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}>
                  <MaterialIcons
                    name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
                    size={28}
                    color="#fff"
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* Im Vollbild nur zusammen mit der Steuerung zeigen, im Hochformat immer (wie YouTube) */}
      {!isLive && duration > 0 && (visible || !isFullscreen) ? (
        <SeekBar
          insetStyle={
            isFullscreen
              ? {
                  left: insets.left + 24,
                  right: insets.right + 24,
                  bottom: insets.bottom + 16,
                  height: 32,
                }
              : undefined
          }
          markers={markers.map((seg) => ({
            key: seg.uuid,
            from: seg.start / duration,
            to: seg.end / duration,
            color: CATEGORY_INFO[seg.category].color,
          }))}
          fraction={dragFraction ?? currentTime / duration}
          buffered={bufferedPosition / duration}
          showThumb={visible}
          onDrag={(f) => {
            setVisible(true);
            setDragFraction(f);
          }}
          onRelease={(f) => {
            player.seekBy(f * duration - player.currentTime);
            setDragFraction(undefined);
          }}
        />
      ) : null}
    </View>
  );
}

function SeekHint({ side, total }: { side: 'left' | 'right'; total: number }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.seekHint, side === 'left' ? styles.seekHintLeft : styles.seekHintRight]}>
      <MaterialIcons
        name={side === 'left' ? 'fast-rewind' : 'fast-forward'}
        size={32}
        color="#fff"
      />
      <ThemedText type="smallBold" style={styles.white}>
        {total} Sekunden
      </ThemedText>
    </View>
  );
}

interface SeekBarProps {
  insetStyle?: ViewStyle;
  markers: { key: string; from: number; to: number; color: string }[];
  fraction: number;
  buffered: number;
  showThumb: boolean;
  onDrag: (fraction: number) => void;
  onRelease: (fraction: number) => void;
}

function SeekBar({
  insetStyle,
  markers,
  fraction,
  buffered,
  showThumb,
  onDrag,
  onRelease,
}: SeekBarProps) {
  const width = useRef(0);
  const startX = useRef(0);
  const callbacks = useRef({ onDrag, onRelease });
  useEffect(() => {
    callbacks.current = { onDrag, onRelease };
  }, [onDrag, onRelease]);

  // Die Refs werden nur in den Gesten-Callbacks gelesen, nicht beim Rendern.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const toFraction = (x: number) =>
      Math.min(1, Math.max(0, width.current ? x / width.current : 0));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        callbacks.current.onDrag(toFraction(startX.current));
      },
      onPanResponderMove: (_, g) => callbacks.current.onDrag(toFraction(startX.current + g.dx)),
      onPanResponderRelease: (_, g) =>
        callbacks.current.onRelease(toFraction(startX.current + g.dx)),
      onPanResponderTerminate: (_, g) =>
        callbacks.current.onRelease(toFraction(startX.current + g.dx)),
    });
  });

  const clamp = (f: number) =>
    `${Math.min(100, Math.max(0, (Number.isFinite(f) ? f : 0) * 100))}%` as const;

  return (
    <View
      style={[styles.seekTouch, insetStyle]}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel="Fortschritt"
      {...pan.panHandlers}>
      <View style={styles.seekTrack} pointerEvents="none">
        <View style={[styles.seekBuffered, { width: clamp(buffered) }]} />
        <View style={[styles.seekProgress, { width: clamp(fraction) }]} />
        {markers.map((m) => (
          <View
            key={m.key}
            style={[
              styles.seekMarker,
              { left: clamp(m.from), width: clamp(m.to - m.from), backgroundColor: m.color },
            ]}
          />
        ))}
      </View>
      {showThumb ? (
        <View pointerEvents="none" style={[styles.seekThumb, { left: clamp(fraction) }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  skipButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  white: {
    color: '#fff',
  },
  dim: {
    color: 'rgba(255,255,255,0.75)',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  settings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  qualityLabel: {
    fontSize: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.playback,
  },
  seekHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  seekHintLeft: {
    left: 0,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  seekHintRight: {
    right: 0,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  seekTouch: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    justifyContent: 'flex-end',
  },
  seekTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  seekBuffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  seekProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Brand.playback,
  },
  seekMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.9,
  },
  seekThumb: {
    position: 'absolute',
    bottom: -4.5,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: Brand.playback,
  },
});
