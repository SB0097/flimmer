import { recommendationSeeds, type RecommendationBatch } from '@/lib/recommendations';
import { videoSource } from '@/services/video-source';
import type { VideoSummary } from '@/services/video-source/types';

import { library } from './store';

interface Request {
  key: string;
  weight: number;
  maxAge: number;
  load(): Promise<VideoSummary[]>;
}

const inFlight = new Map<string, Promise<VideoSummary[]>>();

function fetchItems(request: Request): Promise<VideoSummary[]> {
  const running = inFlight.get(request.key);
  if (running) return running;
  const promise = new Promise<VideoSummary[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), 25_000);
    request
      .load()
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  }).finally(() => {
    inFlight.delete(request.key);
  });
  inFlight.set(request.key, promise);
  return promise;
}

/** Begrenzte Netzwerkarbeit; Sortierung und Interessen bleiben vollständig lokal. */
export async function loadRecommendationFeed(
  force: boolean,
  onItems: (batches: RecommendationBatch[]) => void,
  subscriptionsOnly = false,
): Promise<{ error?: string }> {
  const { history, favorites, subscriptions } = library.get();
  const requests: Request[] = [
    ...(subscriptionsOnly ? [] : recommendationSeeds(history, favorites)).map(([id, weight]) => ({
      key: `related:${id}`,
      weight,
      maxAge: 86_400_000,
      load: async () => (await videoSource.getWatchPage(id)).related,
    })),
    ...subscriptions.map(({ channel }) => ({
      key: `channel:${channel.id}`,
      weight: 4,
      maxAge: 15 * 60_000,
      load: async () => (await videoSource.getChannel(channel.id)).items,
    })),
    ...(subscriptionsOnly
      ? []
      : [
          {
            key: 'home',
            weight: 0.6,
            maxAge: 4 * 60 * 60_000,
            load: async () => (await videoSource.getHome()).items,
          },
        ]),
  ];
  const batches = new Map<string, RecommendationBatch>();
  const now = Date.now();
  const pending = requests.filter((request) => {
    const cache = library.getCache(request.key);
    if (cache)
      batches.set(request.key, { key: request.key, weight: request.weight, items: cache.items });
    return force || !cache || now - cache.fetchedAt > request.maxAge;
  });
  onItems([...batches.values()]);
  // Bei vielen Abos zuerst die am längsten nicht geladenen Kanäle. Bereits
  // zwischengespeicherte Videos aller Abos bleiben in der Mischung verfügbar.
  const channelRequests = pending
    .filter((r) => r.key.startsWith('channel:'))
    .sort(
      (a, b) =>
        (library.getCache(a.key)?.fetchedAt ?? 0) - (library.getCache(b.key)?.fetchedAt ?? 0),
    )
    .slice(0, 8);
  const queue = [...channelRequests, ...pending.filter((r) => !r.key.startsWith('channel:'))];
  let failures = 0;
  async function worker() {
    let request: Request | undefined;
    while ((request = queue.shift())) {
      try {
        const items = await fetchItems(request);
        library.cache({ key: request.key, items, fetchedAt: Date.now() });
        batches.set(request.key, { key: request.key, weight: request.weight, items });
        onItems([...batches.values()]);
      } catch {
        failures++;
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return failures
    ? {
        error: batches.size
          ? 'Einige Vorschläge konnten nicht aktualisiert werden. Gespeicherte Videos bleiben verfügbar.'
          : 'Vorschläge konnten nicht geladen werden. Prüfe die Verbindung oder nutze die Suche.',
      }
    : {};
}
