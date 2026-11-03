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
import { playlistNeighbor, type PlaybackQueue } from '@/lib/playlists';
import { sleepRemainingMs, sleepStep, type SleepTimer } from '@/lib/sleep-timer';
import { library } from '@/services/library/store';
import { usePlaybackHistory } from '@/services/library/use-playback-history';
import { applyPlaybackSettings } from '@/services/playback/background';
import {
  playSource,
  resumablePosition,
  setPlayerVolume,
  stopPlayback,
} from '@/services/playback/player-actions';
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
  open(id: string, playlistId?: string): void;
  playlist?: PlaybackQueue;
  playPlaylist(playlistId: string, startId: string): boolean;
  stepPlaylist(direction: -1 | 1): void;
  leavePlaylist(): void;
  retry(): void;
  chooseQuality(height: number | undefined): Promise<void>;
  /** Wiedergabe beenden (Mini-Player schließen) */
  close(): void;
  /** Eingestellter Sleep-Timer; undefined = aus */
  sleepTimer?: SleepTimer;
  /** Sleep-Timer stellen: Minuten, 'endOfVideo' (Ende des aktuellen Videos) oder undefined = aus */
  setSleepTimer(choice: number | 'endOfVideo' | undefined): void;
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
  const [playlist, setPlaylist] = useState<PlaybackQueue>();
  const playlistRef = useRef<PlaybackQueue | undefined>(undefined);
  const readyId = useRef<string | undefined>(undefined);
  const autoAdvanceBlocked = useRef(false);

  const [sleepTimer, setSleepTimerState] = useState<SleepTimer>();
  const currentId = useRef<string | undefined>(undefined);

  // Einstellung „Im Hintergrund weiterspielen“ live übernehmen
  useEffect(() => {
    applyPlaybackSettings(player, playback);
  }, [player, playback]);

  const reset = useCallback(() => {
    setStream({ kind: 'loading' });
    setSegments([]);
    setQualities(undefined);
    setQuality(undefined);
  }, []);

  const loadVideo = useCallback(
    (id: string) => {
      if (currentId.current === id) return;
      currentId.current = id;
      readyId.current = undefined;
      autoAdvanceBlocked.current = false;
      reset();
      setPlayerVolume(player, 1);
      setSleepTimerState((t) => (t?.kind === 'endOfVideo' ? undefined : t));
      setVideoId(id);
    },
    [player, reset],
  );

  const leavePlaylist = useCallback(() => {
    playlistRef.current = undefined;
    setPlaylist(undefined);
  }, []);

  const playPlaylist = useCallback(
    (playlistId: string, startId: string) => {
      const saved = library.get().playlists.find((p) => p.id === playlistId);
      if (!saved || !saved.videos.some((v) => v.id === startId)) return false;
      const queue: PlaybackQueue = {
        id: saved.id,
        name: saved.name,
        videoIds: saved.videos.map((v) => v.id),
      };
      playlistRef.current = queue;
      setPlaylist(queue);
      loadVideo(startId);
      return true;
    },
    [loadVideo],
  );

  const open = useCallback(
    (id: string, playlistId?: string) => {
      // Eine wieder geöffnete Video-Seite folgt der inzwischen weitergelaufenen Liste.
      if (playlistId && playlistRef.current?.id === playlistId) return;
      if (playlistId && playPlaylist(playlistId, id)) return;
      leavePlaylist();
      loadVideo(id);
    },
    [leavePlaylist, loadVideo, playPlaylist],
  );

  const stepPlaylist = useCallback(
    (direction: -1 | 1) => {
      if (!playlistRef.current || !currentId.current) return;
      const next = playlistNeighbor(playlistRef.current.videoIds, currentId.current, direction);
      if (next) loadVideo(next);
    },
    [loadVideo],
  );

  const close = useCallback(() => {
    currentId.current = undefined;
    readyId.current = undefined;
    leavePlaylist();
    setSleepTimerState(undefined);
    stopPlayback(player);
    reset();
    setVideoId(undefined);
  }, [player, reset, leavePlaylist]);

  const setSleepTimer = useCallback(
    (choice: number | 'endOfVideo' | undefined) => {
      setPlayerVolume(player, 1);
      if (choice === 'endOfVideo') {
        setSleepTimerState(
          currentId.current ? { kind: 'endOfVideo', videoId: currentId.current } : undefined,
        );
      } else {
        setSleepTimerState(
          choice ? { kind: 'time', endsAt: Date.now() + choice * 60_000 } : undefined,
        );
      }
    },
    [player],
  );

  // „Ende des Videos“ gilt nur für das Video, bei dem er gestellt wurde
  const activeSleep =
    sleepTimer?.kind === 'endOfVideo' && sleepTimer.videoId !== videoId ? undefined : sleepTimer;

  // Sleep-Timer: über die Player-Events prüfen (JS-Timer laufen im Hintergrund nicht)
  useEffect(() => {
    const sleepTimer = activeSleep;
    if (!sleepTimer) return;
    const finish = () => {
      autoAdvanceBlocked.current = true;
      player.pause();
      setPlayerVolume(player, 1);
      setSleepTimerState(undefined);
    };
    const progress = player.addListener('timeUpdate', () => {
      const remaining = sleepRemainingMs(
        sleepTimer,
        Date.now(),
        player.currentTime,
        player.duration,
      );
      if (remaining === undefined) return;
      const step = sleepStep(remaining);
      if (step.action === 'fade') setPlayerVolume(player, step.volume);
      if (step.action === 'stop') finish();
    });
    const ended = player.addListener('playToEnd', () => {
      if (sleepTimer.kind === 'endOfVideo') finish();
    });
    // Zeit abgelaufen, während pausiert war → beim Weiterspielen nicht sofort wieder stoppen
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying && sleepTimer.kind === 'time' && Date.now() >= sleepTimer.endsAt) {
        setPlayerVolume(player, 1);
        setSleepTimerState(undefined);
      }
    });
    return () => {
      progress.remove();
      ended.remove();
      playing.remove();
    };
  }, [player, activeSleep]);

  // Derselbe Player spielt die Liste auch im Mini-Player und im Hintergrund weiter.
  // Doppelte/späte Ende-Events des alten Streams dürfen keinen Eintrag überspringen.
  useEffect(() => {
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) autoAdvanceBlocked.current = false;
    });
    const ended = player.addListener('playToEnd', () => {
      if (!currentId.current || readyId.current !== currentId.current || autoAdvanceBlocked.current)
        return;
      if (
        activeSleep?.kind === 'endOfVideo' ||
        (activeSleep?.kind === 'time' && Date.now() >= activeSleep.endsAt)
      )
        return;
      stepPlaylist(1);
    });
    return () => {
      playing.remove();
      ended.remove();
    };
  }, [player, activeSleep, stepPlaylist]);

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
        const history = library.get().history.find((h) => h.video.id === id);
        const savedPosition =
          history && !result.details?.isLive
            ? resumablePosition(history.position, result.details?.durationSeconds ?? 0)
            : undefined;
        await playSource(player, result.source, result.details, savedPosition);
        if (cancelled) return;
        readyId.current = id;
        setStream({ kind: 'ready', result });
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
  usePlaybackHistory(player, details);

  const chooseQuality = useCallback(
    async (height: number | undefined) => {
      if (stream.kind !== 'ready' || !qualities || !videoId || height === quality) return;
      setQuality(height);
      const position = player.currentTime;
      const source = await sourceForQuality(stream.result.source, qualities, height, videoId);
      if (currentId.current !== videoId) return;
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
      playlist,
      playPlaylist,
      stepPlaylist,
      leavePlaylist,
      retry,
      chooseQuality,
      close,
      sleepTimer: activeSleep,
      setSleepTimer,
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
      playlist,
      playPlaylist,
      stepPlaylist,
      leavePlaylist,
      retry,
      chooseQuality,
      close,
      activeSleep,
      setSleepTimer,
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
