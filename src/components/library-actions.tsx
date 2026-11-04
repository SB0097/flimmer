import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { library, useLibrary } from '@/services/library/store';
import type { ChannelRef, VideoSummary } from '@/services/video-source';

export function SubscribeButton({ channel }: { channel: ChannelRef }) {
  const theme = useTheme();
  const { subscriptions } = useLibrary();
  const subscribed = subscriptions.some((s) => s.channel.id === channel.id);
  if (!channel.id) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        subscribed ? `${channel.name} deabonnieren` : `${channel.name} abonnieren`
      }
      accessibilityState={{ selected: subscribed }}
      onPress={() => library.toggleSubscription(channel)}
      style={[styles.button, { backgroundColor: subscribed ? theme.accentSurface : theme.accent }]}>
      <ThemedText type="smallBold" style={{ color: subscribed ? theme.accent : theme.onAccent }}>
        {subscribed ? 'Abonniert' : 'Abonnieren'}
      </ThemedText>
    </Pressable>
  );
}

export function FavoriteButton({ video }: { video: VideoSummary }) {
  const theme = useTheme();
  const { favorites } = useLibrary();
  const saved = favorites.some((f) => f.video.id === video.id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      accessibilityState={{ selected: saved }}
      onPress={() => library.toggleFavorite(video)}
      style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
      <MaterialIcons
        name={saved ? 'favorite' : 'favorite-border'}
        size={20}
        color={saved ? theme.accent : theme.text}
      />
      <ThemedText type="smallBold">{saved ? 'Favorisiert' : 'Favorit'}</ThemedText>
    </Pressable>
  );
}

export function LibraryError() {
  const { error } = useLibrary();
  if (!error) return null;
  return (
    <View style={styles.error}>
      <ThemedText type="small">{error}</ThemedText>
      <Pressable onPress={library.reload} accessibilityRole="button">
        <ThemedText type="smallBold">Erneut versuchen</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: 24,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    paddingVertical: Spacing.two,
  },
  error: { padding: Spacing.three, gap: Spacing.two },
});
