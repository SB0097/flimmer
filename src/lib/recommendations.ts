import type { Favorite, HistoryEntry, Subscription } from '@/services/library/types';
import type { VideoSummary } from '@/services/video-source/types';

export interface RecommendationBatch {
  key: string;
  items: VideoSummary[];
  /** Lokales Gewicht der Quelle; nicht von YouTube übernommen. */
  weight: number;
}

/** Kurze Abbrüche liefern schwächere Signale als weitgehend angesehene Videos. */
export function watchWeight(entry: HistoryEntry): number {
  const duration = entry.video.durationSeconds;
  const ratio = duration ? Math.min(1, entry.watchedSeconds / duration) : 0;
  return ratio >= 0.6 ? 3 : ratio >= 0.2 || entry.watchedSeconds >= 180 ? 1.5 : 0.25;
}

export function recommendationSeeds(history: HistoryEntry[], favorites: Favorite[], limit = 6) {
  const weights = new Map<string, number>();
  favorites.slice(0, 20).forEach((f, i) => weights.set(f.video.id, 5 - i * 0.05));
  history.slice(0, 40).forEach((h, i) => {
    weights.set(
      h.video.id,
      Math.max(weights.get(h.video.id) ?? 0, watchWeight(h) / (1 + i * 0.08)),
    );
  });
  return [...weights].sort((a, b) => b[1] - a[1]).slice(0, limit);
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
): VideoSummary[] {
  const seen = new Set(history.map((h) => h.video.id));
  const likedChannels = new Set(favorites.map((f) => channelKey(f.video)));
  const subscribed = new Set(subscriptions.map((s) => s.channel.id));
  const seeds = new Map(recommendationSeeds(history, favorites));
  const candidates = new Map<string, { video: VideoSummary; score: number }>();
  for (const batch of batches) {
    const weight = batch.key.startsWith('related:') ? seeds.get(batch.key.slice(8)) : batch.weight;
    if (
      weight === undefined ||
      (batch.key.startsWith('channel:') && !subscribed.has(batch.key.slice(8)))
    )
      continue;
    batch.items.forEach((video, index) => {
      if (!video.id || seen.has(video.id)) return;
      const score =
        weight / (1 + index * 0.08) +
        (likedChannels.has(channelKey(video)) ? 2 : 0) +
        (video.channel.id && subscribed.has(video.channel.id) ? 2 : 0);
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
