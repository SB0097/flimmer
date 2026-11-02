import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEvent } from 'expo';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PlayerVideo } from '@/components/player-video';
import { VideoThumbnail } from '@/components/video-thumbnail';
import { Spacing } from '@/constants/theme';
import { setMiniPlayerFrame } from '@/services/playback/mini-frame';
import { useNowPlaying } from '@/services/playback/now-playing';

/** Anteil der Bildschirmbreite, den das schwebende Fenster einnimmt (wie YouTube) */
const WIDTH_FRACTION = 0.52;
const MARGIN = Spacing.two;

/**
 * Schwebendes Mini-Fenster unten rechts (wie bei YouTube), solange ein Video läuft
 * und die Video-Seite nicht offen ist. Auf dem Video: oben links Play/Pause,
 * oben rechts Schließen; Tippen auf das Video öffnet es wieder groß.
 *
 * Gehört als letztes Kind in einen Bildschirm-Container – es liegt absolut
 * über dem Inhalt, direkt über der Tab-Leiste.
 */
export function MiniPlayer() {
  const focused = useIsFocused();
  const { width: screenWidth } = useWindowDimensions();
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const { player, videoId, stream, details, close } = useNowPlaying();

  // Position nur merken, solange das Fenster sichtbar ist: Liegt die Video-Seite
  // darüber, ordnet sich die Seite darunter anders an – das wäre das falsche Ziel.
  const measure = () => {
    if (!focused) return;
    cardRef.current?.measureInWindow((x, y, w, h) =>
      setMiniPlayerFrame({ x, y, width: w, height: h }),
    );
  };
  useEffect(() => {
    if (!focused || !videoId) return;
    cardRef.current?.measureInWindow((x, y, w, h) =>
      setMiniPlayerFrame({ x, y, width: w, height: h }),
    );
  }, [focused, videoId]);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  if (!videoId) return null;

  const width = Math.round(screenWidth * WIDTH_FRACTION);
  const height = Math.round((width * 9) / 16);
  const duration = player.duration;
  const progress = !details?.isLive && duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const title =
    details?.title ?? (stream.kind === 'error' ? 'Wiedergabe fehlgeschlagen' : 'Lädt …');

  return (
    <View
      ref={cardRef}
      // Unsichtbar, solange die Video-Seite darüber liegt: Beim Runterziehen gibt es
      // sonst ein zweites Bild. Gemessen wird trotzdem (Ziel der Animation).
      style={[styles.card, { width, height }, !focused && styles.hidden]}
      pointerEvents={focused ? 'auto' : 'none'}
      onLayout={measure}>
      {/* Das Videobild darf nur an einer Stelle hängen: auf der sichtbaren Seite */}
      {focused && stream.kind === 'ready' ? (
        <PlayerVideo style={StyleSheet.absoluteFill} />
      ) : (
        <VideoThumbnail
          key={videoId}
          videoId={videoId}
          thumbnails={details?.thumbnails}
          style={StyleSheet.absoluteFill}
        />
      )}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() =>
          router.push({ pathname: '/watch/[id]', params: { id: videoId, from: 'mini' } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Video öffnen: ${title}`}
      />

      {/* Wie YouTube: runde Knöpfe direkt auf dem Video – oben links Play/Pause, oben rechts Schließen */}
      <Pressable
        onPress={() => (isPlaying ? player.pause() : player.play())}
        hitSlop={6}
        style={[styles.round, styles.topLeft]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}>
        <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={24} color="#fff" />
      </Pressable>
      <Pressable
        onPress={close}
        hitSlop={6}
        style={[styles.round, styles.topRight]}
        accessibilityRole="button"
        accessibilityLabel="Schließen">
        <MaterialIcons name="close" size={22} color="#fff" />
      </Pressable>

      <View style={styles.track}>
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    right: MARGIN,
    bottom: MARGIN,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  hidden: {
    opacity: 0,
  },
  round: {
    position: 'absolute',
    top: Spacing.one,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topLeft: {
    left: Spacing.one,
  },
  topRight: {
    right: Spacing.one,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progress: {
    height: '100%',
    backgroundColor: '#FF0033',
  },
});
