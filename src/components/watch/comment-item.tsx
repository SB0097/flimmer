import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatViewCount } from '@/lib/format';
import type { Comment, CommentsPage } from '@/services/video-source';

const BLUE = '#3EA6FF';

interface Props {
  comment: Comment;
  /** Antworten werden eingerückt und haben selbst keine Antworten */
  isReply?: boolean;
}

/** Ein Kommentar im YouTube-Stil, mit aufklappbaren Antworten */
export function CommentItem({ comment, isReply = false }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<Comment[]>([]);
  const [moreReplies, setMoreReplies] = useState<CommentsPage['more']>();
  const [showReplies, setShowReplies] = useState(false);
  const [loading, setLoading] = useState(false);

  const avatarSize = isReply ? 24 : 32;

  async function loadPage(load: () => Promise<CommentsPage>) {
    setLoading(true);
    try {
      const page = await load();
      setReplies((prev) => [...prev, ...page.items]);
      setMoreReplies(() => page.more);
    } catch {
      setMoreReplies(undefined);
    } finally {
      setLoading(false);
    }
  }

  function toggleReplies() {
    if (showReplies) {
      setShowReplies(false);
      return;
    }
    setShowReplies(true);
    if (replies.length === 0 && comment.loadReplies) loadPage(comment.loadReplies);
  }

  return (
    <View style={[styles.row, isReply && styles.replyRow]}>
      {comment.author.avatar ? (
        <Image
          source={comment.author.avatar.url}
          style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
        />
      ) : (
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: theme.backgroundSelected,
          }}
        />
      )}

      <View style={styles.body}>
        {comment.isPinned ? (
          <ThemedText type="small" themeColor="textSecondary">
            📌 Angepinnt
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          <ThemedText
            type="smallBold"
            themeColor={comment.author.isUploader ? 'text' : 'textSecondary'}>
            {comment.author.name}
          </ThemedText>
          {comment.publishedText ? ` · ${comment.publishedText}` : ''}
        </ThemedText>

        <Pressable onPress={() => setExpanded((v) => !v)}>
          <ThemedText type="small" numberOfLines={expanded ? undefined : 4}>
            {comment.text}
          </ThemedText>
        </Pressable>

        <View style={styles.actions}>
          <MaterialIcons name="thumb-up-off-alt" size={16} color={theme.textSecondary} />
          {comment.likeCount ? (
            <ThemedText type="small" themeColor="textSecondary">
              {formatViewCount(comment.likeCount)}
            </ThemedText>
          ) : null}
          {comment.isHearted ? <ThemedText type="small">❤️</ThemedText> : null}
        </View>

        {!isReply && comment.replyCount > 0 ? (
          <Pressable
            onPress={toggleReplies}
            style={styles.repliesToggle}
            accessibilityRole="button">
            <MaterialIcons
              name={showReplies ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={20}
              color={BLUE}
            />
            <ThemedText type="smallBold" style={{ color: BLUE }}>
              {comment.replyCount === 1 ? '1 Antwort' : `${comment.replyCount} Antworten`}
            </ThemedText>
          </Pressable>
        ) : null}

        {showReplies ? (
          <View style={styles.replies}>
            {replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply />
            ))}
            {loading ? <ActivityIndicator style={styles.spinner} /> : null}
            {!loading && moreReplies ? (
              <Pressable
                onPress={() => loadPage(moreReplies)}
                style={styles.repliesToggle}
                accessibilityRole="button">
                <MaterialIcons name="subdirectory-arrow-right" size={18} color={BLUE} />
                <ThemedText type="smallBold" style={{ color: BLUE }}>
                  Weitere Antworten
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  replyRow: {
    paddingHorizontal: 0,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  repliesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
  replies: {
    marginTop: Spacing.one,
  },
  spinner: {
    alignSelf: 'flex-start',
    margin: Spacing.two,
  },
});
