import { createSettingsStore } from './store';

export interface PlaybackSettings {
  /** Ton läuft weiter, wenn die App in den Hintergrund geht oder der Bildschirm aus ist */
  background: boolean;
  /** Beim Verlassen der App (Home) läuft das Video in einem kleinen Fenster weiter */
  pip: boolean;
  /** Leise Videos auf die von YouTube übliche Lautheit anheben */
  loudness: boolean;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  background: true,
  pip: true,
  loudness: true,
};

function sanitize(raw: unknown): PlaybackSettings {
  const result = { ...DEFAULT_PLAYBACK_SETTINGS };
  if (raw && typeof raw === 'object') {
    const { background, pip, loudness } = raw as Record<string, unknown>;
    if (typeof background === 'boolean') result.background = background;
    if (typeof pip === 'boolean') result.pip = pip;
    if (typeof loudness === 'boolean') result.loudness = loudness;
  }
  return result;
}

export const playbackSettings = createSettingsStore(
  'settings.playback.v1',
  DEFAULT_PLAYBACK_SETTINGS,
  sanitize,
);

export const usePlaybackSettings = playbackSettings.use;
