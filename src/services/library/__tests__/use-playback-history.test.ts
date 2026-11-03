import { act, renderHook } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import { AppState, type AppStateStatus } from 'react-native';

import type { VideoSummary } from '@/services/video-source/types';

import { library } from '../store';
import { usePlaybackHistory } from '../use-playback-history';

jest.mock('../store', () => ({
  library: { get: jest.fn(), historyVersion: jest.fn(), record: jest.fn() },
}));

const video: VideoSummary = {
  id: 'test',
  title: 'Test',
  channel: { id: 'UC-test', name: 'Test' },
  thumbnails: [],
  durationSeconds: 600,
  isLive: false,
};

function fakePlayer() {
  const listeners = new Map<string, Set<(payload: { isPlaying?: boolean }) => void>>();
  const player = {
    currentTime: 0,
    playing: true,
    playbackRate: 1,
    addListener(event: string, listener: (payload: { isPlaying?: boolean }) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
  };
  return {
    player,
    asPlayer: player as unknown as VideoPlayer,
    listeners,
    emit: (event: string, payload = {}) =>
      listeners.get(event)?.forEach((listener) => listener(payload)),
  };
}

const saved = jest.mocked(library);
let now = 0;
beforeEach(() => {
  now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  saved.get.mockReturnValue({ history: [], favorites: [], subscriptions: [], playlists: [] });
  saved.historyVersion.mockReturnValue('0');
  saved.record.mockReset().mockReturnValue(true);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('wartet auf echte Wiedergabe, zählt keine Sprünge und speichert beim Pausieren', async () => {
  const fake = fakePlayer();
  const hook = await renderHook(() => usePlaybackHistory(fake.asPlayer, video));
  await act(() => {
    now = 4000;
    fake.player.currentTime = 4;
    fake.emit('timeUpdate');
  });
  expect(saved.record).not.toHaveBeenCalled();
  await act(() => {
    now = 5000;
    fake.player.currentTime = 5;
    fake.emit('timeUpdate');
  });
  expect(saved.record).toHaveBeenLastCalledWith(video, {
    position: 5,
    watchedSeconds: 5,
    completed: false,
  });
  await act(() => {
    now = 5500;
    fake.player.currentTime = 120;
    fake.emit('timeUpdate');
  });
  await act(() => {
    now = 6500;
    fake.player.currentTime = 121;
    fake.emit('timeUpdate');
    fake.player.playing = false;
    fake.emit('playingChange', { isPlaying: false });
  });
  expect(saved.record).toHaveBeenLastCalledWith(video, {
    position: 121,
    watchedSeconds: 1,
    completed: false,
  });
  await hook.unmount();
  expect([...fake.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
});

it('sichert die letzte Position beim Wechsel in den Hintergrund', async () => {
  let changeState!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeState = listener;
    return { remove };
  });
  const fake = fakePlayer();
  const hook = await renderHook(() => usePlaybackHistory(fake.asPlayer, video));
  await act(() => {
    now = 7000;
    fake.player.currentTime = 7;
    changeState('background');
  });
  expect(saved.record).toHaveBeenLastCalledWith(video, {
    position: 7,
    watchedSeconds: 7,
    completed: false,
  });
  await hook.unmount();
  expect(remove).toHaveBeenCalled();
});

it('fügt während derselben Wiedergabe einen gelöschten Verlauf nicht wieder hinzu', async () => {
  const fake = fakePlayer();
  const hook = await renderHook(() => usePlaybackHistory(fake.asPlayer, video));
  await act(() => {
    now = 5000;
    fake.player.currentTime = 5;
    fake.emit('timeUpdate');
  });
  saved.record.mockClear();
  saved.historyVersion.mockReturnValue('1');
  await act(() => {
    now = 30_000;
    fake.player.currentTime = 30;
    fake.emit('timeUpdate');
  });
  await hook.unmount();
  expect(saved.record).not.toHaveBeenCalled();
});
