import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { rankRecommendations, type RecommendationBatch } from '@/lib/recommendations';
import { loadRecommendationFeed } from '@/services/library/recommendation-feed';
import { useLibrary } from '@/services/library/store';

export function useForYou({ enabled = true, subscriptionsOnly = false } = {}) {
  const library = useLibrary();
  const [batches, setBatches] = useState<RecommendationBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const refresh = useCallback(
    async (force = true) => {
      const token = ++request.current;
      setLoading(true);
      setError(undefined);
      try {
        const result = await loadRecommendationFeed(
          force,
          (items) => {
            if (request.current === token) setBatches(items);
          },
          subscriptionsOnly,
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
      ),
    [batches, library, subscriptionsOnly],
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
