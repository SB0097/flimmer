import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FavoriteButton, LibraryError, SubscribeButton } from '@/components/library-actions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatViewCount } from '@/lib/format';
import type { CommentsResult, VideoDetails } from '@/services/video-source';

interface Props {
  details?: VideoDetails;
  /** Top-Kommentare für die Vorschau; `null` = deaktiviert/nicht ladbar */
  comments?: CommentsResult | null;
  onOpenComments?: () => void;
  /** Inhalt der aufklappbaren technischen Details */
  diagnostics?: React.ReactNode;
}

/** Infobereich unter dem Player im YouTube-Stil */
export function VideoInfo({ details, comments, onOpenComments, diagnostics }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (!details) {
    return (
      <View style={styles.container}>
        <View style={[styles.skeletonTitle, { backgroundColor: theme.backgroundElement }]} />
        <View style={[styles.skeletonLine, { backgroundColor: theme.backgroundElement }]} />
      </View>
    );
  }

  const meta = [details.viewCountText, details.publishedText].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
        <ThemedText style={styles.title} numberOfLines={expanded ? undefined : 2}>
          {details.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {meta}
          {meta ? '  ' : ''}
          <ThemedText type="smallBold">{expanded ? 'weniger' : '...mehr'}</ThemedText>
        </ThemedText>
      </Pressable>

      <View style={styles.channelRow}>
        <Pressable
          style={styles.channelLink}
          accessibilityRole="button"
          accessibilityLabel={`Kanal öffnen: ${details.channel.name}`}
          disabled={!details.channel.id}
          onPress={() =>
            router.push({ pathname: '/channel/[id]', params: { id: details.channel.id } })
          }>
          {details.channel.avatar ? (
            <Image source={details.channel.avatar.url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]} />
          )}
          <View style={styles.channelText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {details.channel.name}
            </ThemedText>
            {details.channel.subscriberCountText ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {details.channel.subscriberCountText}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        <SubscribeButton channel={details.channel} />
      </View>

      <View style={styles.chips}>
        <FavoriteButton video={details} />
      </View>
      <LibraryError />

      {details.likeCount !== undefined ? (
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">👍 {formatViewCount(details.likeCount)}</ThemedText>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={[styles.description, { backgroundColor: theme.backgroundElement }]}
        accessibilityRole="button"
        accessibilityLabel="Beschreibung ein- oder ausklappen">
        <ThemedText type="smallBold">
          {[details.viewCountText, details.dateText ?? details.publishedText]
            .filter(Boolean)
            .join('  ')}
        </ThemedText>
        <ThemedText type="small" numberOfLines={expanded ? undefined : 3}>
          {details.description || 'Keine Beschreibung'}
        </ThemedText>
        {expanded && diagnostics ? (
          <View style={styles.diagnostics}>
            <Pressable onPress={() => setShowDiagnostics((v) => !v)} accessibilityRole="button">
              <ThemedText type="smallBold" themeColor="textSecondary">
                {showDiagnostics ? '▾' : '▸'} Technische Details
              </ThemedText>
            </Pressable>
            {showDiagnostics ? diagnostics : null}
          </View>
        ) : null}
      </Pressable>

      {comments !== undefined ? (
        <Pressable
          onPress={comments ? onOpenComments : undefined}
          style={[styles.description, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button"
          accessibilityLabel="Kommentare öffnen">
          <ThemedText type="smallBold">
            Kommentare{' '}
            {comments?.countText ? (
              <ThemedText type="small" themeColor="textSecondary">
                {comments.countText}
              </ThemedText>
            ) : null}
          </ThemedText>
          {comments === null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Kommentare sind deaktiviert oder nicht verfügbar.
            </ThemedText>
          ) : comments.items[0] ? (
            <View style={styles.commentPreview}>
              {comments.items[0].author.avatar ? (
                <Image source={comments.items[0].author.avatar.url} style={styles.smallAvatar} />
              ) : (
                <View style={[styles.smallAvatar, { backgroundColor: theme.backgroundSelected }]} />
              )}
              <ThemedText type="small" numberOfLines={2} style={styles.flex}>
                {comments.items[0].text}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Noch keine Kommentare.
            </ThemedText>
          )}
        </Pressable>
      ) : null}

      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Nächste Videos
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
    marginBottom: Spacing.one,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  channelLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  channelText: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  description: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  diagnostics: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  commentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  smallAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  flex: {
    flex: 1,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  skeletonTitle: {
    height: 22,
    borderRadius: 6,
    width: '85%',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 6,
    width: '50%',
  },
});
