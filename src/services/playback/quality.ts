import { File, Paths } from 'expo-file-system';

import { masterForHeight, parseVariants, qualityOptions, type QualityOption } from '@/lib/hls';
import type { PlaybackSource } from '@/services/video-source';

export interface QualityInfo {
  master: string;
  options: QualityOption[];
}

/** Lädt die HLS-Master-Playlist und liest die verfügbaren Qualitäten aus. */
export async function loadQualities(source: PlaybackSource): Promise<QualityInfo | undefined> {
  if (source.contentType !== 'hls') return undefined;
  const response = await fetch(source.uri, { headers: source.headers });
  if (!response.ok) return undefined;
  const master = await response.text();
  const options = qualityOptions(parseVariants(master));
  return options.length > 1 ? { master, options } : undefined;
}

/**
 * Quelle mit fester Qualität: eine lokale Master-Playlist, die nur die
 * gewählte Auflösung (plus Tonspuren) enthält. `undefined` = Auto.
 */
export async function sourceForQuality(
  base: PlaybackSource,
  info: QualityInfo,
  height: number | undefined,
  videoId: string,
): Promise<PlaybackSource> {
  if (height === undefined) return base;
  const file = new File(Paths.cache, `hls-${videoId}-${height}.m3u8`);
  if (!file.exists) file.create();
  await file.write(masterForHeight(info.master, height));
  return { ...base, uri: file.uri, contentType: 'hls' };
}
