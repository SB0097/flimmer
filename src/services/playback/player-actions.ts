import type { SubtitleTrack, VideoPlayer } from 'expo-video';
import { AppState } from 'react-native';

import type { PlaybackSource, VideoDetails } from '@/services/video-source';

/** expo-video ist ein veränderliches natives Handle, kein React-Zustandsobjekt. */
export function setPlayerSubtitle(player: VideoPlayer, track: SubtitleTrack | null) {
  player.subtitleTrack = track;
}

/** Lädt eine Quelle in den Player und startet die Wiedergabe (optional ab `startAt` Sekunden) */
export async function playSource(
  player: VideoPlayer,
  source: PlaybackSource,
  details?: VideoDetails,
  startAt?: number,
  control?: { isCurrent(): boolean; resume: boolean },
) {
  player.showNowPlayingNotification = true;
  await player.replaceAsync({
    uri: source.uri,
    contentType: source.contentType,
    headers: source.headers,
    ...(source.externalSubtitles ? { externalSubtitles: source.externalSubtitles } : {}),
    metadata: details
      ? {
          title: details.title,
          artist: details.channel.name,
          artwork: details.thumbnails.at(-1)?.url,
        }
      : undefined,
  });
  if (control && !control.isCurrent()) return;
  if (startAt && startAt > 1) player.seekBy(startAt - player.currentTime);
  if (control?.resume !== false) player.play();
  else player.pause();
}

/** Beendet die Wiedergabe komplett; die Medien-Benachrichtigung verschwindet */
export function stopPlayback(player: VideoPlayer) {
  player.pause();
  player.showNowPlayingNotification = false;
  player.replace(null);
}

/** Merkt sich die Position nur, wenn sie sinnvoll ist (nicht ganz am Anfang oder Ende) */
export function resumablePosition(currentTime: number, duration: number): number | undefined {
  if (currentTime < 5) return undefined;
  if (duration > 0 && duration - currentTime < 10) return undefined;
  return currentTime;
}

/**
 * Nach dem Ende von Bild-im-Bild: Wurde das Fenster geschlossen (App bleibt im
 * Hintergrund), wird pausiert – sonst würde der Ton unsichtbar weiterlaufen.
 * JS-Timer laufen im Hintergrund nicht, deshalb wird über die Fortschritts-
 * Events des Players geprüft, ob die App nach kurzer Zeit wieder aktiv ist.
 */
export function pauseIfPipDismissed(player: VideoPlayer, graceMs = 800) {
  const stoppedAt = Date.now();
  const check = () => {
    if (AppState.currentState === 'active') return true;
    if (Date.now() - stoppedAt < graceMs) return false;
    player.pause();
    return true;
  };
  if (check()) return;
  const subscription = player.addListener('timeUpdate', () => {
    if (check()) subscription.remove();
  });
}

/** Lautstärke des Players (0–1) setzen, z. B. zum Ausblenden beim Sleep-Timer */
export function setPlayerVolume(player: VideoPlayer, volume: number) {
  player.volume = volume;
}
