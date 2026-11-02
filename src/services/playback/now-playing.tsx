import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Segment } from '@/lib/segments';
import { applyPlaybackSettings } from '@/services/playback/background';
import { playSource, resumablePosition, stopPlayback } from '@/services/playback/player-actions';
import { loadQualities, sourceForQuality, type QualityInfo } from '@/services/playback/quality';
import { SponsorSkipper } from '@/services/playback/sponsor-skipper';
import { playbackSettings, usePlaybackSettings } from '@/services/settings/playback-settings';
import { fetchSegments } from '@/services/sponsorblock/sponsorblock';
import {
  StreamUnavailableError,
  videoSource,
  type StreamAttempt,
  type StreamResult,
  type VideoDetails,
} from '@/services/video-source';

export type StreamState =
  | { kind: 'loading' }
  | { kind: 'ready'; result: StreamResult }
  | { kind: 'error'; error: unknown; attempts: StreamAttempt[] };

export interface NowPlaying {
  /** Der eine, app-weite Player (Video-Seite, Mini-Player, Bild-im-Bild, Hintergrund) */
  player: VideoPlayer;
  /** Aktuell geladenes Video; undefined = nichts läuft */
  videoId?: string;
  stream: StreamState;
  details?: VideoDetails;
  segments: Segment[];
  qualities?: QualityInfo;
  /** Gewählte Höhe in Pixeln; undefined = Auto */
  quality?: number;
  /** Video laden und abspielen; läuft es schon, passiert nichts */
  open(id: string): void;
  retry(): void;
  chooseQuality(height: number | undefined): Promise<void>;
  /** Wiedergabe beenden (Mini-Player schließen) */
  close(): void;
}

const NowPlayingContext = createContext<NowPlaying | null>(null);

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  const playback = usePlaybackSettings();
  const player = useVideoPlayer(null, (p) => {
    applyPlaybackSettings(p, playbackSettings.get());
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 0.5;
  });

  const [videoId, setVideoId] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [stream, setStream] = useState<StreamState>({ kind: 'loading' });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [qualities, setQualities] = useState<QualityInfo>();
  const [quality, setQuality] = useState<number>();

  const currentId = useRef<string | undefined>(undefined);
  const positions = useRef(new Map<string, number>());

  // Einstellung „Im Hintergrund weiterspielen“ live übernehmen
  useEffect(() => {
    applyPlaybackSettings(player, playback);
  }, [player, playback]);

  /** Position des laufenden Videos merken, damit es später dort weitergeht */
  const rememberPosition = useCallback(() => {
    const id = currentId.current;
    if (!id) return;
    const position = resumablePosition(player.currentTime, player.duration);
    if (position === undefined) positions.current.delete(id);
    else positions.current.set(id, position);
  }, [player]);

  const reset = useCallback(() => {
    setStream({ kind: 'loading' });
    setSegments([]);
    setQualities(undefined);
    setQuality(undefined);
  }, []);

  const open = useCallback(
    (id: string) => {
      if (currentId.current === id) return;
      rememberPosition();
      currentId.current = id;
      reset();
      setVideoId(id);
    },
    [rememberPosition, reset],
  );

  const close = useCallback(() => {
    rememberPosition();
    currentId.current = undefined;
    stopPlayback(player);
    reset();
    setVideoId(undefined);
  }, [player, rememberPosition, reset]);

  const retry = useCallback(() => {
    setStream({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // Stream und SponsorBlock-Segmente laden, sobald ein neues Video gewählt wird
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    async function loadStream(id: string) {
      try {
        const result = await videoSource.getStreams(id);
        if (cancelled) return;
        setStream({ kind: 'ready', result });
        await playSource(player, result.source, result.details, positions.current.get(id));
        const info = await loadQualities(result.source).catch(() => undefined);
        if (!cancelled) setQualities(info);
      } catch (e) {
        if (cancelled) return;
        setStream({
          kind: 'error',
          error: e,
          attempts: e instanceof StreamUnavailableError ? e.attempts : [],
        });
      }
    }

    async function loadSegments(id: string) {
      const result = await fetchSegments(id).catch(() => []);
      if (!cancelled) setSegments(result);
    }

    loadStream(videoId);
    loadSegments(videoId);
    return () => {
      cancelled = true;
    };
  }, [videoId, attempt, player]);

  const details = stream.kind === 'ready' ? stream.result.details : undefined;

  const chooseQuality = useCallback(
    async (height: number | undefined) => {
      if (stream.kind !== 'ready' || !qualities || !videoId || height === quality) return;
      setQuality(height);
      const position = player.currentTime;
      const source = await sourceForQuality(stream.result.source, qualities, height, videoId);
      await playSource(player, source, stream.result.details, position);
    },
    [stream, qualities, quality, player, videoId],
  );

  const value = useMemo<NowPlaying>(
    () => ({
      player,
      videoId,
      stream,
      details,
      segments,
      qualities,
      quality,
      open,
      retry,
      chooseQuality,
      close,
    }),
    [
      player,
      videoId,
      stream,
      details,
      segments,
      qualities,
      quality,
      open,
      retry,
      chooseQuality,
      close,
    ],
  );

  return (
    <NowPlayingContext.Provider value={value}>
      <SponsorSkipper player={player} segments={segments}>
        {children}
      </SponsorSkipper>
    </NowPlayingContext.Provider>
  );
}

export function useNowPlaying(): NowPlaying {
  const context = useContext(NowPlayingContext);
  if (!context) throw new Error('useNowPlaying braucht einen NowPlayingProvider');
  return context;
}
