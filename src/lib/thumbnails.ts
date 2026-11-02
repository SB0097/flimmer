import type { Thumbnail } from '@/services/video-source';

/**
 * Vorschaubilder in absteigender Qualität für ein Video.
 *
 * YouTube liefert in Listen (v. a. „Nächste Videos“) oft nur 168–336 px breite Bilder,
 * die in breiten Karten unscharf wirken. Deshalb zuerst das 1280×720-Bild direkt vom
 * Bild-Server (WebP: halbe Dateigröße), dann die von YouTube gelieferten, zuletzt
 * `hqdefault`, das es für jedes Video gibt (auch sehr alte ohne HD-Bild).
 */
export function thumbnailCandidates(videoId: string, thumbnails: Thumbnail[] = []): string[] {
  const original = [...thumbnails].sort((a, b) => b.width - a.width).map((t) => t.url);
  const urls = [
    `https://i.ytimg.com/vi_webp/${videoId}/hq720.webp`,
    ...original,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
  return [...new Set(urls.filter(Boolean))];
}
