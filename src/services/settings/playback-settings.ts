import { createSettingsStore } from './store';

export interface PlaybackSettings {
  /** Ton läuft weiter, wenn die App in den Hintergrund geht oder der Bildschirm aus ist */
  background: boolean;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  background: true,
};

function sanitize(raw: unknown): PlaybackSettings {
  const result = { ...DEFAULT_PLAYBACK_SETTINGS };
  if (raw && typeof raw === 'object') {
    const { background } = raw as Record<string, unknown>;
    if (typeof background === 'boolean') result.background = background;
  }
  return result;
}

export const playbackSettings = createSettingsStore(
  'settings.playback.v1',
  DEFAULT_PLAYBACK_SETTINGS,
  sanitize,
);

export const usePlaybackSettings = playbackSettings.use;
