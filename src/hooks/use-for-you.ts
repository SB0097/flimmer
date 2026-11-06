import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { rankRecommendations, type RecommendationBatch } from '@/lib/recommendations';
import { loadRecommendationFeed } from '@/services/library/recommendation-feed';
import { library as libraryStore, useLibrary } from '@/services/library/store';

/** Neu bei jedem App-Start, damit „Für dich“ nicht tagelang gleich sortiert bleibt. */
const appStartRotation = Date.now() >>> 0;

export function useForYou({ enabled = true, subscriptionsOnly = false } = {}) {
  const library = useLibrary();
  const [batches, setBatches] = useState<RecommendationBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // Rotation und Anzeigezähler nur beim Laden übernehmen: Beim Scrollen gezählte
  // Anzeigen sollen die gerade sichtbare Liste nicht umsortieren.
  const [rotation, setRotation] = useState(appStartRotation);
  const [impressions, setImpressions] = useState<ReadonlyMap<string, number>>(() =>
    subscriptionsOnly ? new Map() : libraryStore.impressions(),
  );
  const request = useRef(0);
  const currentRotation = useRef(appStartRotation);
  const refresh = useCallback(
    async (force = true) => {
      const token = ++request.current;
      if (!subscriptionsOnly && force) {
        // Nur beim aktiven Aktualisieren neu mischen; Tabwechsel behalten die Reihenfolge.
        currentRotation.current = (Date.now() + token) >>> 0;
        setRotation(currentRotation.current);
        setImpressions(libraryStore.impressions());
      }
      setLoading(true);
      setError(undefined);
      try {
        const result = await loadRecommendationFeed(
          force,
          (items) => {
            if (request.current === token) setBatches(items);
          },
          subscriptionsOnly,
          subscriptionsOnly ? undefined : currentRotation.current,
        );
        if (request.current === token) setError(result.error);
      } catch {
        if (request.current === token)
          setError('Vorschläge konnten nicht geladen werden. Bitte erneut versuchen.');
      } finally {
        if (request.current === token) setLoading(false);
      }
    },
    [subscriptionsOnly],
  );
  useFocusEffect(
    useCallback(() => {
      if (enabled) void refresh(false);
      return () => {
        request.current++;
      };
    }, [refresh, enabled]),
  );
  const items = useMemo(
    () =>
      rankRecommendations(
        batches,
        library.history,
        library.favorites,
        library.subscriptions,
        subscriptionsOnly ? 200 : 60,
        subscriptionsOnly ? {} : { impressions, rotation },
      ),
    [batches, library, subscriptionsOnly, impressions, rotation],
  );
  return {
    items,
    loading,
    error,
    refresh,
    personalized:
      library.history.length > 0 ||
      library.favorites.length > 0 ||
      library.subscriptions.length > 0,
  };
}
