import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatViewCount } from '@/lib/format';
import type { VideoDetails } from '@/services/video-source';

interface Props {
  details?: VideoDetails;
  /** Inhalt der aufklappbaren technischen Details */
  diagnostics?: React.ReactNode;
}

/** Infobereich unter dem Player im YouTube-Stil */
export function VideoInfo({ details, diagnostics }: Props) {
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
      </View>

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
