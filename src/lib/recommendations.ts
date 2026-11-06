import type { Favorite, HistoryEntry, Subscription } from '@/services/library/types';
import type { VideoSummary } from '@/services/video-source/types';

export interface RecommendationBatch {
  key: string;
  items: VideoSummary[];
  /** Lokales Gewicht der Quelle; nicht von YouTube übernommen. */
  weight: number;
}

export interface RankOptions {
  /** Wie oft ein Video schon auf „Für dich“ zu sehen war, ohne geöffnet zu werden. */
  impressions?: ReadonlyMap<string, number>;
  /** Wechselt beim App-Start und beim Aktualisieren; mischt die Reihenfolge leicht neu. */
  rotation?: number;
}

/** Wie stark jede frühere Anzeige ein Video nach hinten schiebt. */
const IMPRESSION_PENALTY = 0.7;
/** Feste stärkste Interessen; der Rest der Startvideos wechselt mit der Rotation. */
const FIXED_SEEDS = 2;
const SEED_POOL = 30;

/** Kurze Abbrüche liefern schwächere Signale als weitgehend angesehene Videos. */
export function watchWeight(entry: HistoryEntry): number {
  if (entry.imported) return 1.5;
  const duration = entry.video.durationSeconds;
  const ratio = duration ? Math.min(1, entry.watchedSeconds / duration) : 0;
  return ratio >= 0.6 ? 3 : ratio >= 0.2 || entry.watchedSeconds >= 180 ? 1.5 : 0.25;
}

/** Alle möglichen Startvideos mit Gewicht, stärkste zuerst. */
export function seedWeights(history: HistoryEntry[], favorites: Favorite[]): [string, number][] {
  const weights = new Map<string, number>();
  favorites.slice(0, 20).forEach((f, i) => weights.set(f.video.id, 5 - i * 0.05));
  history.slice(0, 40).forEach((h, i) => {
    weights.set(
      h.video.id,
      Math.max(weights.get(h.video.id) ?? 0, watchWeight(h) / (1 + i * 0.08)),
    );
  });
  return [...weights].sort((a, b) => b[1] - a[1]).slice(0, SEED_POOL);
}

/** Gleichmäßig verteilte Zahl in [0, 1), stabil für dieselbe Rotation und denselben Text. */
export function stableRandom(rotation: number, text: string): number {
  let hash = (rotation ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * Ohne Rotation die stärksten Interessen. Mit Rotation bleiben die zwei stärksten fest,
 * die übrigen werden gewichtet aus dem größeren Pool gezogen. So kommen auch ältere
 * Interessen wieder vor, statt tagelang dieselben Startvideos abzufragen.
 */
export function recommendationSeeds(
  history: HistoryEntry[],
  favorites: Favorite[],
  limit = 6,
  rotation?: number,
): [string, number][] {
  const pool = seedWeights(history, favorites);
  if (rotation === undefined || pool.length <= limit) return pool.slice(0, limit);
  const fixed = pool.slice(0, Math.min(FIXED_SEEDS, limit));
  // Gewichtetes Ziehen ohne Zurücklegen (Efraimidis-Spirakis): Schlüssel u^(1/w).
  const drawn = pool
    .slice(fixed.length)
    .map((seed) => ({ seed, key: Math.pow(stableRandom(rotation, seed[0]), 1 / seed[1]) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, limit - fixed.length)
    .map(({ seed }) => seed);
  return [...fixed, ...drawn].sort((a, b) => b[1] - a[1]);
}

export function channelKey(video: VideoSummary): string {
  return video.channel.id || video.channel.name.trim().toLocaleLowerCase() || video.id;
}

/** Doppelte und gesehene Videos raus, Interessen gewichten, Kanäle anschließend mischen. */
export function rankRecommendations(
  batches: RecommendationBatch[],
  history: HistoryEntry[],
  favorites: Favorite[],
  subscriptions: Subscription[],
  limit = 60,
  { impressions, rotation }: RankOptions = {},
): VideoSummary[] {
  const seen = new Set(history.map((h) => h.video.id));
  const likedChannels = new Set(favorites.map((f) => channelKey(f.video)));
  const subscribed = new Set(subscriptions.map((s) => s.channel.id));
  const seeds = new Map(seedWeights(history, favorites));
  const candidates = new Map<string, { video: VideoSummary; score: number }>();
  for (const batch of batches) {
    const isChannel = batch.key.startsWith('channel:');
    const weight = batch.key.startsWith('related:') ? seeds.get(batch.key.slice(8)) : batch.weight;
    if (weight === undefined || (isChannel && !subscribed.has(batch.key.slice(8)))) continue;
    batch.items.forEach((video, index) => {
      if (!video.id || seen.has(video.id)) return;
      let score =
        weight / (1 + index * (isChannel ? 0.15 : 0.08)) +
        (likedChannels.has(channelKey(video)) ? 2 : 0) +
        // Abo-Videos aus dem eigenen Kanal-Feed sind über das Quellgewicht schon bevorzugt.
        (!isChannel && video.channel.id && subscribed.has(video.channel.id) ? 2 : 0);
      if (impressions) score /= 1 + (impressions.get(video.id) ?? 0) * IMPRESSION_PENALTY;
      if (rotation !== undefined) score *= 0.8 + 0.4 * stableRandom(rotation, video.id);
      const existing = candidates.get(video.id);
      if (!existing || existing.score < score) candidates.set(video.id, { video, score });
    });
  }
  const remaining = [...candidates.values()].sort((a, b) => b.score - a.score);
  const result: VideoSummary[] = [];
  const counts = new Map<string, number>();
  while (remaining.length && result.length < limit) {
    const previous = result.at(-1);
    // Bereits häufig gezeigte Kanäle rutschen nach hinten. Bei wenig Auswahl bleiben
    // weitere Videos trotzdem erreichbar, statt die Startseite künstlich zu leeren.
    let best = 0;
    let bestScore = -Infinity;
    remaining.forEach((entry, index) => {
      const key = channelKey(entry.video);
      const repeat = previous && channelKey(previous) === key ? 0.1 : 1;
      const score = (entry.score * repeat) / (1 + (counts.get(key) ?? 0) * 1.5);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    const [{ video }] = remaining.splice(best, 1);
    result.push(video);
    const key = channelKey(video);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return result;
}
