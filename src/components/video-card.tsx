import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VideoThumbnail } from '@/components/video-thumbnail';
import { SaveToPlaylistButton } from '@/components/playlist-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/format';
import type { VideoSummary } from '@/services/video-source';

/** Video-Kachel im YouTube-Stil: großes Vorschaubild, darunter Titel und Kanal */
export function VideoCard({ video }: { video: VideoSummary }) {
  const theme = useTheme();
  const meta = [video.channel.name, video.viewCountText, video.publishedText]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <Link href={{ pathname: '/watch/[id]', params: { id: video.id } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={video.title}>
          <View>
            <VideoThumbnail
              key={video.id}
              videoId={video.id}
              thumbnails={video.thumbnails}
              style={[styles.thumbnail, { backgroundColor: theme.backgroundElement }]}
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
        </Pressable>
      </Link>
      <View style={styles.info}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Kanal öffnen: ${video.channel.name}`}
          disabled={!video.channel.id}
          onPress={() =>
            router.push({ pathname: '/channel/[id]', params: { id: video.channel.id } })
          }>
          {video.channel.avatar ? (
            <Image source={video.channel.avatar.url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]} />
          )}
        </Pressable>
        <View style={styles.texts}>
          <Link href={{ pathname: '/watch/[id]', params: { id: video.id } }} asChild>
            <Pressable accessibilityRole="button">
              <ThemedText numberOfLines={2} style={styles.title}>
                {video.title}
              </ThemedText>
            </Pressable>
          </Link>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Kanal öffnen: ${video.channel.name}`}
            disabled={!video.channel.id}
            onPress={() =>
              router.push({ pathname: '/channel/[id]', params: { id: video.channel.id } })
            }>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
          </Pressable>
        </View>
        <SaveToPlaylistButton video={video} compact />
      </View>
    </View>
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
