import { File, Paths } from 'expo-file-system';

import type { CaptionTrack } from '@/services/video-source/types';

const MAX_BYTES = 5 * 1024 * 1024;

/** Signierte YouTube-Parameter behalten; nur das Ausgabeformat ändern. */
export function captionUrl(track: CaptionTrack): string {
  const url = new URL(track.url);
  if (url.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(url.hostname))
    throw new Error('Ungültige Untertitel-Adresse.');
  url.searchParams.set('fmt', 'vtt');
  return url.toString();
}

export function validateVtt(text: string): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (
    normalized.length > MAX_BYTES ||
    !/^WEBVTT(?:[ \t].*)?\n/.test(normalized) ||
    !/\d{2}:\d{2}\.\d{3} --> (?:\d{2}:)?\d{2}:\d{2}\.\d{3}/.test(normalized)
  )
    throw new Error('YouTube hat keine lesbaren Untertitel geliefert. Bitte erneut versuchen.');
  return normalized;
}

export async function loadCaption(track: CaptionTrack, signal: AbortSignal): Promise<string> {
  const url = captionUrl(track);
  const networkError = () =>
    new Error(
      'Untertitel konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut.',
    );
  const response = await fetch(url, { signal, headers: track.headers }).catch(() => {
    throw networkError();
  });
  if (!response.ok)
    throw new Error(`Untertitel konnten nicht geladen werden (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES)
    throw new Error('Die Untertitel-Datei ist zu groß.');
  const text = validateVtt(
    await response.text().catch(() => {
      throw networkError();
    }),
  );
  if (signal.aborted) throw new Error('Untertitel-Auswahl wurde abgebrochen.');
  // Eine Datei je Video/Spur statt einer neuen Datei bei jedem Umschalten. Cache ist entbehrlich.
  const safe = (value: string) => encodeURIComponent(value).replace(/%/g, '_');
  const file = new File(Paths.cache, `captions-${safe(track.videoId)}-${safe(track.id)}.vtt`);
  file.write(text);
  return file.uri;
}
