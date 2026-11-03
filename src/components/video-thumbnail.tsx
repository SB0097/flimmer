import { Image } from 'expo-image';
import { useState } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';

import { thumbnailCandidates } from '@/lib/thumbnails';
import type { Thumbnail } from '@/services/video-source';

interface Props {
  videoId: string;
  thumbnails?: Thumbnail[];
  style?: StyleProp<ImageStyle>;
}

/**
 * Scharfes Vorschaubild: lädt das HD-Bild und weicht bei einem Fehler (z. B. sehr alte
 * Videos ohne HD-Bild) automatisch auf das nächstbeste aus.
 * Beim Einsatz in Listen mit `key={videoId}` verwenden, damit es pro Video neu beginnt.
 */
export function VideoThumbnail({ videoId, thumbnails, style }: Props) {
  const candidates = thumbnailCandidates(videoId, thumbnails);
  const [index, setIndex] = useState(0);

  return (
    <Image
      source={candidates[Math.min(index, candidates.length - 1)]}
      style={style}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      recyclingKey={videoId}
      onError={() => setIndex((i) => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
}
