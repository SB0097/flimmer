import { useEvent } from 'expo';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  StreamUnavailableError,
  videoSource,
  type StreamAttempt,
  type StreamResult,
} from '@/services/video-source';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: StreamResult }
  | { kind: 'error'; message: string; attempts: StreamAttempt[] };

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [showDetails, setShowDetails] = useState(false);

  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });
  const { status, error: playerError } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await videoSource.getStreams(id);
        if (cancelled) return;
        setState({ kind: 'ready', result });
        const { source, details } = result;
        await player.replaceAsync({
          uri: source.uri,
          contentType: source.contentType,
          headers: source.headers,
          metadata: details
            ? {
                title: details.title,
                artist: details.channel.name,
                artwork: details.thumbnails.at(-1)?.url,
              }
            : undefined,
        });
        if (!cancelled) player.play();
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
          attempts: e instanceof StreamUnavailableError ? e.attempts : [],
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, player, attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const details = state.kind === 'ready' ? state.result.details : undefined;
  const attempts =
    state.kind === 'ready' ? state.result.attempts : state.kind === 'error' ? state.attempts : [];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.videoBox}>
        {state.kind === 'ready' ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            nativeControls
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : null}
        {state.kind === 'loading' || (state.kind === 'ready' && status === 'loading') ? (
          <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color="#fff" />
        ) : null}
        {state.kind === 'error' ? (
          <View style={styles.errorBox}>
            <ThemedText type="smallBold" style={styles.white}>
              Video kann nicht abgespielt werden
            </ThemedText>
            <Pressable onPress={retry} style={styles.retry} accessibilityRole="button">
              <ThemedText type="smallBold" style={styles.white}>
                Erneut versuchen
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {details ? (
          <>
            <ThemedText style={styles.title}>{details.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[
                details.channel.name,
                details.viewCount !== undefined
                  ? `${details.viewCount.toLocaleString('de-DE')} Aufrufe`
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </>
        ) : null}

        {state.kind === 'error' ? (
          <ThemedText type="small" themeColor="textSecondary">
            {state.message}
          </ThemedText>
        ) : null}
        {status === 'error' && playerError ? (
          <ThemedText type="small" themeColor="textSecondary">
            Player-Fehler: {playerError.message}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={() => setShowDetails((v) => !v)}
          style={[styles.detailsToggle, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button">
          <ThemedText type="smallBold">{showDetails ? '▾' : '▸'} Technische Details</ThemedText>
        </Pressable>
        {showDetails ? (
          <View style={styles.details}>
            <ThemedText type="code">Video-ID: {id}</ThemedText>
            <ThemedText type="code">Quelle: {videoSource.name}</ThemedText>
            {state.kind === 'ready' ? (
              <ThemedText type="code">
                Stream: {state.result.source.contentType} über {state.result.source.via}
              </ThemedText>
            ) : null}
            <ThemedText type="code">Player-Status: {status}</ThemedText>
            {attempts.map((a, i) => (
              <ThemedText key={i} type="code">
                {a.ok ? '✓' : '✗'} {a.via}: {a.message}
              </ThemedText>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  errorBox: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  retry: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  white: {
    color: '#fff',
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  detailsToggle: {
    marginTop: Spacing.three,
    borderRadius: 8,
    padding: Spacing.two,
  },
  details: {
    gap: Spacing.one,
  },
});
