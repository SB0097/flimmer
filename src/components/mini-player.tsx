import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlayerVideo } from '@/components/player-video';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setMiniPlayerFrame } from '@/services/playback/mini-frame';
import { useNowPlaying } from '@/services/playback/now-playing';

const HEIGHT = 64;

/**
 * Leiste über den Tabs, solange ein Video läuft und die Video-Seite nicht offen
 * ist: Bild, Titel, Play/Pause und Schließen. Tippen öffnet das Video wieder.
 */
export function MiniPlayer() {
  const theme = useTheme();
  const focused = useIsFocused();
  const videoRef = useRef<ComponentRef<typeof View>>(null);
  const { player, videoId, stream, details, close } = useNowPlaying();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  if (!videoId) return null;

  const duration = player.duration;
  const progress = !details?.isLive && duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const thumbnail = details?.thumbnails.at(-1)?.url;

  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        style={styles.main}
        onPress={() => router.push({ pathname: '/watch/[id]', params: { id: videoId } })}
        accessibilityRole="button"
        accessibilityLabel="Video öffnen">
        <View
          ref={videoRef}
          style={styles.video}
          onLayout={() =>
            videoRef.current?.measureInWindow((x, y, width, height) =>
              setMiniPlayerFrame({ x, y, width, height }),
            )
          }>
          {/* Das Videobild darf nur an einer Stelle hängen: auf der sichtbaren Seite */}
          {focused && stream.kind === 'ready' ? (
            <PlayerVideo style={StyleSheet.absoluteFill} />
          ) : thumbnail ? (
            <Image source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
        </View>
        <View style={styles.texts}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {details?.title ?? (stream.kind === 'error' ? 'Wiedergabe fehlgeschlagen' : 'Lädt …')}
          </ThemedText>
          {details ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {details.channel.name}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        onPress={() => (isPlaying ? player.pause() : player.play())}
        style={styles.button}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}>
        <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={30} color={theme.text} />
      </Pressable>
      <Pressable
        onPress={close}
        style={styles.button}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Schließen">
        <MaterialIcons name="close" size={26} color={theme.text} />
      </Pressable>

      <View style={styles.track}>
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'stretch',
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.two,
  },
  main: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  video: {
    height: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  texts: {
    flex: 1,
  },
  button: {
    padding: Spacing.two,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  progress: {
    height: '100%',
    backgroundColor: '#FF0033',
  },
});
