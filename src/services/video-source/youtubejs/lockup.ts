import type { Thumbnail, VideoSummary } from '../types';

/**
 * Minimal benötigte Struktur eines `LockupView`-Knotens von YouTube
 * (so liefert YouTube seit 2025 die "Nächsten Videos"). Bewusst lose
 * typisiert, damit der Mapper ohne YouTube.js-Klassen testbar bleibt.
 */
export interface LockupLike {
  content_id?: string;
  content_type?: string;
  content_image?: {
    image?: Thumbnail[];
    overlays?: { badges?: { text?: string; badge_style?: string }[] }[];
  } | null;
  metadata?: {
    title?: { toString(): string } | null;
    image?: { avatar?: { image?: Thumbnail[] } | null } | null;
    metadata?: {
      metadata_rows?: { metadata_parts?: { text?: { toString(): string } | null }[] }[];
    } | null;
  } | null;
}

/** "1:02:03" → 3723, "4:05" → 245; sonst undefined */
export function parseDurationText(text: string | undefined): number | undefined {
  if (!text || !/^\d+(:\d{1,2}){1,2}$/.test(text.trim())) return undefined;
  return text
    .trim()
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
}

function rowTexts(lockup: LockupLike): string[][] {
  return (lockup.metadata?.metadata?.metadata_rows ?? []).map((row) =>
    (row.metadata_parts ?? []).map((p) => p.text?.toString().trim() ?? '').filter(Boolean),
  );
}

/** Wandelt einen LockupView in eine Video-Kachel um; `undefined` bei Playlists, Mixen usw. */
export function lockupToSummary(lockup: LockupLike): VideoSummary | undefined {
  if (lockup.content_type !== 'VIDEO' || !lockup.content_id) return undefined;

  const badges = (lockup.content_image?.overlays ?? []).flatMap((o) => o.badges ?? []);
  const isLive = badges.some(
    (b) => b.text === 'LIVE' || b.badge_style === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE',
  );
  const durationSeconds = isLive
    ? undefined
    : badges.map((b) => parseDurationText(b.text)).find((d) => d !== undefined);

  const [channelRow = [], statsRow = []] = rowTexts(lockup);
  const [viewCountText, publishedText] = statsRow;
  const avatar = lockup.metadata?.image?.avatar?.image?.[0];

  return {
    id: lockup.content_id,
    title: lockup.metadata?.title?.toString() ?? '',
    channel: { id: '', name: channelRow[0] ?? '', avatar },
    durationSeconds,
    viewCountText,
    publishedText,
    thumbnails: lockup.content_image?.image ?? [],
    isLive,
  };
}
