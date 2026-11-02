import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CommentItem } from '@/components/watch/comment-item';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  videoSource,
  type Comment,
  type CommentSort,
  type CommentsPage,
  type CommentsResult,
} from '@/services/video-source';

interface Props {
  videoId: string;
  /** Bereits geladene Top-Kommentare (spart beim Öffnen eine Anfrage) */
  initial?: CommentsResult;
  onClose: () => void;
}

/** Kommentar-Bereich unter dem Video, wie das Kommentar-Panel bei YouTube */
export function CommentsPanel({ videoId, initial, onClose }: Props) {
  const theme = useTheme();
  const [sort, setSort] = useState<CommentSort>('top');
  const [items, setItems] = useState<Comment[]>(initial?.items ?? []);
  const [countText, setCountText] = useState(initial?.countText);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(false);
  const more = useRef<CommentsPage['more']>(initial?.more);
  const loadingMore = useRef(false);
  const usedInitial = useRef(Boolean(initial));

  // Android-Zurück schließt zuerst das Panel
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (sort === 'top' && usedInitial.current) {
      usedInitial.current = false;
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const result = await videoSource.getComments(videoId, sort);
        if (cancelled) return;
        setItems(result.items);
        setCountText((c) => result.countText ?? c);
        more.current = result.more;
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [videoId, sort]);

  const changeSort = useCallback(
    (next: CommentSort) => {
      if (next === sort) return;
      setLoading(true);
      setItems([]);
      setSort(next);
    },
    [sort],
  );

  const loadMore = useCallback(async () => {
    if (!more.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await more.current();
      more.current = page.more;
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
    } catch {
      more.current = undefined;
    } finally {
      loadingMore.current = false;
    }
  }, []);

  return (
    <ThemedView style={[StyleSheet.absoluteFill, styles.panel]}>
      <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
        <ThemedText type="subtitle" style={styles.title}>
          Kommentare{' '}
          {countText ? (
            <ThemedText type="small" themeColor="textSecondary">
              {countText}
            </ThemedText>
          ) : null}
        </ThemedText>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Schließen">
          <MaterialIcons name="close" size={26} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {(['top', 'newest'] as const).map((s) => {
          const active = s === sort;
          return (
            <Pressable
              key={s}
              onPress={() => changeSort(s)}
              style={[
                styles.chip,
                { backgroundColor: active ? theme.text : theme.backgroundElement },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <ThemedText
                type="smallBold"
                style={{ color: active ? theme.background : theme.text }}>
                {s === 'top' ? 'Top' : 'Neueste'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <View style={styles.center}>
          <ThemedText themeColor="textSecondary">
            Kommentare konnten nicht geladen werden oder sind deaktiviert.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CommentItem comment={item} />}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              Noch keine Kommentare.
            </ThemedText>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  panel: {
    zIndex: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  empty: {
    padding: Spacing.three,
    textAlign: 'center',
  },
});
