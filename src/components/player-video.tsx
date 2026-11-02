import { VideoView } from 'expo-video';
import type { StyleProp, ViewStyle } from 'react-native';

import { useNowPlaying } from '@/services/playback/now-playing';
import { pauseIfPipDismissed } from '@/services/playback/player-actions';
import { usePlaybackSettings } from '@/services/settings/playback-settings';

/**
 * Bild des app-weiten Players. Es darf immer nur eine Instanz gleichzeitig
 * sichtbar sein (Video-Seite oder Mini-Player).
 */
export function PlayerVideo({ style }: { style?: StyleProp<ViewStyle> }) {
  const { player } = useNowPlaying();
  const { pip } = usePlaybackSettings();
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={false}
      contentFit="contain"
      allowsPictureInPicture={pip}
      startsPictureInPictureAutomatically={pip}
      onPictureInPictureStop={() => pauseIfPipDismissed(player)}
    />
  );
}
