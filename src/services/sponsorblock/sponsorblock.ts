import * as Crypto from 'expo-crypto';

import { parseSegments, SEGMENT_CATEGORIES, type Segment } from '@/lib/segments';

const API = 'https://sponsor.ajay.app/api/skipSegments';

/**
 * Lädt die SponsorBlock-Segmente eines Videos.
 *
 * Datenschutz: Es wird nicht die Video-ID gesendet, sondern nur die ersten
 * 4 Zeichen ihres SHA-256-Hashs. Der Server antwortet mit allen Videos, die
 * dieses Präfix teilen; das passende Video wird lokal herausgesucht.
 */
export async function fetchSegments(videoId: string, signal?: AbortSignal): Promise<Segment[]> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, videoId);
  const params = new URLSearchParams({
    categories: JSON.stringify(SEGMENT_CATEGORIES),
    actionTypes: JSON.stringify(['skip']),
  });
  const response = await fetch(`${API}/${hash.slice(0, 4)}?${params}`, { signal });
  if (response.status === 404) return []; // keine Segmente für dieses Präfix
  if (!response.ok) throw new Error(`SponsorBlock: HTTP ${response.status}`);
  return parseSegments(await response.json(), videoId);
}
