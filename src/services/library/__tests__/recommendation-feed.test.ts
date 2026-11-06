import type { LibrarySnapshot } from '../types';
import type { VideoSummary } from '@/services/video-source/types';

import { videoSource } from '@/services/video-source';
import { library } from '../store';
import { loadRecommendationFeed } from '../recommendation-feed';

jest.mock('@/services/video-source', () => ({
  videoSource: { getHome: jest.fn(), getChannel: jest.fn(), getWatchPage: jest.fn() },
}));
jest.mock('../store', () => ({
  library: { get: jest.fn(), getCache: jest.fn(), cache: jest.fn() },
}));

const video: VideoSummary = {
  id: 'new',
  title: 'Neues Video',
  channel: { id: 'UC-test', name: 'Test' },
  thumbnails: [],
  isLive: false,
};
const empty: LibrarySnapshot = { history: [], favorites: [], subscriptions: [], playlists: [] };
const source = jest.mocked(videoSource);
const saved = jest.mocked(library);

beforeEach(() => {
  jest.resetAllMocks();
  saved.get.mockReturnValue(empty);
});

it('zeigt frischen Cache sofort und fragt ihn nicht erneut ab', async () => {
  saved.getCache.mockReturnValue({ key: 'home', fetchedAt: Date.now(), items: [video] });
  const onItems = jest.fn();
  await expect(loadRecommendationFeed(false, onItems)).resolves.toEqual({});
  expect(onItems.mock.calls[0][0][0].items).toEqual([video]);
  expect(source.getHome).not.toHaveBeenCalled();
});

it('behält bei Verbindungsfehlern die gespeicherten Vorschläge', async () => {
  saved.getCache.mockReturnValue({ key: 'home', fetchedAt: 1, items: [video] });
  source.getHome.mockRejectedValue(new Error('offline'));
  const onItems = jest.fn();
  const result = await loadRecommendationFeed(true, onItems);
  expect(result.error).toContain('Gespeicherte Videos');
  expect(onItems.mock.calls[0][0][0].items[0].id).toBe('new');
  expect(saved.cache).not.toHaveBeenCalled();
});

it('lädt im Abo-Bereich ausschließlich Kanäle, höchstens drei gleichzeitig und acht pro Runde', async () => {
  saved.get.mockReturnValue({
    ...empty,
    subscriptions: Array.from({ length: 10 }, (_, i) => ({
      channel: { id: `UC-${i}`, name: String(i) },
      subscribedAt: i,
    })),
  });
  let active = 0;
  let maxActive = 0;
  source.getChannel.mockImplementation(async (id) => {
    active++;
    maxActive = Math.max(active, maxActive);
    await Promise.resolve();
    active--;
    return { channel: { id, name: id }, description: '', items: [video] };
  });
  await loadRecommendationFeed(true, () => {}, true);
  expect(maxActive).toBeLessThanOrEqual(3);
  expect(source.getChannel).toHaveBeenCalledTimes(8);
  expect(source.getWatchPage).not.toHaveBeenCalled();
  expect(source.getHome).not.toHaveBeenCalled();
});

it('teilt gleichzeitige Abrufe derselben Quelle', async () => {
  let finish!: (page: { items: VideoSummary[] }) => void;
  source.getHome.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = loadRecommendationFeed(true, () => {});
  const second = loadRecommendationFeed(true, () => {});
  finish({ items: [video] });
  await Promise.all([first, second]);
  expect(source.getHome).toHaveBeenCalledTimes(1);
});

it('mischt gespeicherte Vorschläge früherer Startvideos ohne neue Anfrage dazu', async () => {
  saved.get.mockReturnValue({
    ...empty,
    history: Array.from({ length: 10 }, (_, i) => ({
      video: { ...video, id: `h${i}` },
      lastWatchedAt: 10 - i,
      position: 0,
      watchedSeconds: 300,
      completed: false,
    })),
  });
  saved.getCache.mockImplementation((key) =>
    key.startsWith('related:') ? { key, fetchedAt: Date.now(), items: [video] } : undefined,
  );
  source.getHome.mockResolvedValue({ items: [] } as never);
  const onItems = jest.fn();
  await loadRecommendationFeed(false, onItems, false, 42);
  const keys = onItems.mock.calls[0][0].map((b: { key: string }) => b.key);
  expect(keys.filter((k: string) => k.startsWith('related:'))).toHaveLength(10);
  expect(source.getWatchPage).not.toHaveBeenCalled();
});
