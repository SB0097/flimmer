import { act, renderHook, waitFor } from '@testing-library/react-native';

import { library } from '@/services/library/store';
import { videoSource } from '@/services/video-source';
import { playSource } from '../player-actions';
import { NowPlayingProvider, useNowPlaying } from '../now-playing';

type Callback = (event: { isPlaying: boolean }) => void;
const mockListeners = new Map<string, Set<Callback>>();
const mockPlayer = {
  currentTime: 0,
  duration: 100,
  playing: false,
  pause: jest.fn(),
  addListener: jest.fn((event: string, listener: Callback) => {
    const listeners = mockListeners.get(event) ?? new Set<Callback>();
    listeners.add(listener);
    mockListeners.set(event, listeners);
    return { remove: () => listeners.delete(listener) };
  }),
};
const emit = (event: string, isPlaying = false) => {
  for (const listener of [...(mockListeners.get(event) ?? [])]) listener({ isPlaying });
};

jest.mock('expo-video', () => ({ useVideoPlayer: () => mockPlayer }));
jest.mock('@/services/library/store', () => ({ library: { get: jest.fn() } }));
jest.mock('@/services/library/use-playback-history', () => ({ usePlaybackHistory: jest.fn() }));
jest.mock('@/services/settings/playback-settings', () => ({
  playbackSettings: { get: () => ({}) },
  usePlaybackSettings: () => ({}),
}));
jest.mock('../background', () => ({ applyPlaybackSettings: jest.fn() }));
jest.mock('../player-actions', () => ({
  playSource: jest.fn(async () => {}),
  setPlayerVolume: jest.fn(),
  stopPlayback: jest.fn(),
  resumablePosition: jest.fn(),
}));
jest.mock('../quality', () => ({
  loadQualities: jest.fn(async () => undefined),
  sourceForQuality: jest.fn(),
}));
jest.mock('../sponsor-skipper', () => ({
  SponsorSkipper: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/services/sponsorblock/sponsorblock', () => ({
  fetchSegments: jest.fn(async () => []),
}));
jest.mock('@/services/video-source', () => ({
  videoSource: { getStreams: jest.fn() },
  StreamUnavailableError: class extends Error {},
}));

const saved = jest.mocked(library);
const source = jest.mocked(videoSource);
const video = (id: string) => ({
  id,
  title: id,
  channel: { id: 'UC', name: 'Test' },
  thumbnails: [],
  isLive: false,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockPlayer.currentTime = 0;
  saved.get.mockReturnValue({
    history: [],
    favorites: [],
    subscriptions: [],
    playlists: [
      {
        id: 'p',
        name: 'Testliste',
        createdAt: 1,
        updatedAt: 1,
        videos: ['a', 'b', 'c'].map(video),
      },
    ],
  });
  source.getStreams.mockImplementation(async (id) => ({
    source: { uri: `https://stream/${id}`, contentType: 'hls', via: 'VISIONOS' },
    attempts: [],
    details: { ...video(id), description: '' },
  }));
});

async function start(id = 'a') {
  const hook = await renderHook(useNowPlaying, { wrapper: NowPlayingProvider });
  await act(() => {
    expect(hook.result.current.playPlaylist('p', id)).toBe(true);
  });
  await waitFor(() => expect(hook.result.current.stream.kind).toBe('ready'));
  return hook;
}

it('spielt automatisch in Reihenfolge weiter und überspringt bei doppelten Ende-Events kein Video', async () => {
  const { result } = await start();
  await act(() => {
    emit('playToEnd');
    emit('playToEnd');
  });
  expect(result.current.videoId).toBe('b');
  await waitFor(() => expect(result.current.stream.kind).toBe('ready'));
  await act(() => emit('playToEnd'));
  expect(result.current.videoId).toBe('c');
  await waitFor(() => expect(result.current.stream.kind).toBe('ready'));
  await act(() => emit('playToEnd'));
  expect(result.current.videoId).toBe('c');
  expect(source.getStreams.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
});

it('behält die laufende Liste beim Wiederöffnen einer älteren Video-Seite', async () => {
  const { result } = await start();
  await act(() => result.current.stepPlaylist(1));
  await waitFor(() => expect(result.current.stream.kind).toBe('ready'));
  await act(() => result.current.open('a', 'p'));
  expect(result.current.videoId).toBe('b');
  expect(result.current.playlist?.id).toBe('p');
  await act(() => result.current.open('einzeln'));
  expect(result.current.playlist).toBeUndefined();
  expect(result.current.videoId).toBe('einzeln');
});

it('startet an der gewählten Stelle und ermöglicht vor/zurück ohne Überlauf', async () => {
  const { result } = await start('b');
  await act(() => result.current.stepPlaylist(-1));
  expect(result.current.videoId).toBe('a');
  await act(() => result.current.stepPlaylist(-1));
  expect(result.current.videoId).toBe('a');
  await act(() => expect(result.current.playPlaylist('fehlt', 'a')).toBe(false));
  expect(result.current.playlist?.id).toBe('p');
});

it('stoppt mit dem Sleep-Timer am Videoende, statt den nächsten Eintrag zu starten', async () => {
  const { result } = await start();
  await act(() => result.current.setSleepTimer('endOfVideo'));
  await act(() => emit('playToEnd'));
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(result.current.videoId).toBe('a');
  expect(result.current.sleepTimer).toBeUndefined();
  await act(() => emit('playToEnd'));
  expect(result.current.videoId).toBe('a');
});

it('startet nach einem abgelaufenen Minuten-Timer kein weiteres Video', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const { result } = await start();
    await act(() => result.current.setSleepTimer(1));
    clock.mockReturnValue(62000);
    await act(() => emit('timeUpdate'));
    await act(() => emit('playToEnd'));
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(result.current.videoId).toBe('a');
  } finally {
    clock.mockRestore();
  }
});

it('verwirft beim Schließen die Warteschlange und ignoriert verspätete Ende-Events', async () => {
  const { result } = await start();
  await act(() => result.current.close());
  await act(() => emit('playToEnd'));
  expect(result.current.videoId).toBeUndefined();
  expect(result.current.playlist).toBeUndefined();
  expect(playSource).toHaveBeenCalledTimes(1);
});

it('ignoriert eine spät geladene Quelle, wenn bereits ein anderes Video gewählt wurde', async () => {
  let release!: (value: Awaited<ReturnType<typeof videoSource.getStreams>>) => void;
  source.getStreams.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const { result } = await renderHook(useNowPlaying, { wrapper: NowPlayingProvider });
  await act(() => {
    result.current.playPlaylist('p', 'a');
  });
  await act(() => result.current.stepPlaylist(1));
  await waitFor(() => expect(result.current.stream.kind).toBe('ready'));
  await act(() =>
    release({
      source: { uri: 'https://old', contentType: 'hls', via: 'VISIONOS' },
      attempts: [],
      details: { ...video('a'), description: '' },
    }),
  );
  expect(result.current.videoId).toBe('b');
  expect(result.current.details?.id).toBe('b');
  expect(playSource).toHaveBeenCalledTimes(1);
});
