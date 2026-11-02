import type { VideoPlayer } from 'expo-video';

import type { PlaybackSettings } from '@/services/settings/playback-settings';

/** Überträgt die Wiedergabe-Einstellungen auf den Player */
export function applyPlaybackSettings(player: VideoPlayer, settings: PlaybackSettings) {
  player.staysActiveInBackground = settings.background;
}
