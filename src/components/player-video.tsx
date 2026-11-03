import { VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useNowPlaying } from '@/services/playback/now-playing';
import { pauseIfPipDismissed } from '@/services/playback/player-actions';
import { usePlaybackSettings } from '@/services/settings/playback-settings';

/**
 * Bild des app-weiten Players. Es darf immer nur eine Instanz gleichzeitig
 * sichtbar sein (Video-Seite oder Mini-Player).
 */
export function PlayerVideo({ style }: { style?: StyleProp<ViewStyle> }) {
  const { player, stream, details } = useNowPlaying();
  const { pip } = usePlaybackSettings();
  const audioOnly = stream.kind === 'ready' && stream.result.source.via === 'Download · Nur Audio';
  if (audioOnly)
    return (
      <View style={[style, { backgroundColor: '#000' }]}>
        <Image
          source={details?.thumbnails.at(-1)?.url}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  return (
    <VideoView
      player={player}
      style={[style, { backgroundColor: '#000' }]}
      useExoShutter
      nativeControls={false}
      contentFit="contain"
      allowsPictureInPicture={pip}
      startsPictureInPictureAutomatically={pip}
      onPictureInPictureStop={() => pauseIfPipDismissed(player)}
    />
  );
}
