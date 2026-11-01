import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/format';
import type { VideoSummary } from '@/services/video-source';

function bestThumbnail(video: VideoSummary) {
  return [...video.thumbnails].sort((a, b) => b.width - a.width)[0]?.url;
}

/** Video-Kachel im YouTube-Stil: großes Vorschaubild, darunter Titel und Kanal */
export function VideoCard({ video }: { video: VideoSummary }) {
  const theme = useTheme();
  const meta = [video.channel.name, video.viewCountText, video.publishedText]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link href={{ pathname: '/watch/[id]', params: { id: video.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={video.title}>
        <View>
          <Image
            source={bestThumbnail(video)}
            style={[styles.thumbnail, { backgroundColor: theme.backgroundElement }]}
            contentFit="cover"
            transition={150}
          />
          {video.isLive ? (
            <View style={[styles.badge, styles.live]}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                LIVE
              </ThemedText>
            </View>
          ) : video.durationSeconds !== undefined ? (
            <View style={styles.badge}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                {formatDuration(video.durationSeconds)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          {video.channel.avatar ? (
            <Image source={video.channel.avatar.url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]} />
          )}
          <View style={styles.texts}>
            <ThemedText numberOfLines={2} style={styles.title}>
              {video.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  badge: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 4,
    paddingHorizontal: Spacing.one,
  },
  live: {
    backgroundColor: '#CC0000',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 18,
  },
  info: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  texts: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
  },
});
