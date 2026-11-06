import type { Favorite, HistoryEntry } from '@/services/library/types';
import type { VideoSummary } from '@/services/video-source/types';

import {
  rankRecommendations,
  recommendationSeeds,
  stableRandom,
  watchWeight,
} from '../recommendations';

const video = (id: string, channel = 'UC-a'): VideoSummary => ({
  id,
  title: id,
  channel: { id: channel, name: channel },
  thumbnails: [],
  durationSeconds: 600,
  isLive: false,
});
const history = (id: string, watchedSeconds: number): HistoryEntry => ({
  video: video(id),
  watchedSeconds,
  position: watchedSeconds,
  lastWatchedAt: 1,
  completed: false,
});
const favorite = (id: string): Favorite => ({ video: video(id), savedAt: 1 });

it('nutzt Takeout-Verlauf als Interesse, ohne eine angesehene Dauer zu erfinden', () => {
  const imported = { ...history('importiert', 0), imported: true };
  expect(watchWeight(imported)).toBe(1.5);
  expect(recommendationSeeds([imported], [])).toEqual([['importiert', 1.5]]);
  expect(imported.watchedSeconds).toBe(0);
});

it('filtert Gesehenes und doppelte Kandidaten aus allen Quellen', () => {
  const batches = [
    { key: 'a', weight: 3, items: [video('seen'), video('new')] },
    { key: 'b', weight: 4, items: [video('new'), video('other')] },
  ];
  const result = rankRecommendations(batches, [history('seen', 10)], [], []);
  expect(result.map((v) => v.id)).toEqual(['new', 'other']);
});

it('entfernt frühere Interessenquellen direkt nach dem Löschen des Verlaufs oder eines Abos', () => {
  const batches = [
    { key: 'related:old', weight: 5, items: [video('old-interest')] },
    { key: 'channel:UC-removed', weight: 4, items: [video('old-sub')] },
    { key: 'home', weight: 1, items: [video('general')] },
  ];
  expect(rankRecommendations(batches, [], [], []).map((v) => v.id)).toEqual(['general']);
});

it('wertet kurze Abbrüche schwächer und belohnt kein Spulen ans Ende', () => {
  const aborted = { ...history('short', 5), position: 600, completed: true };
  expect(watchWeight(aborted)).toBeLessThan(watchWeight(history('watched', 500)));
  expect(
    recommendationSeeds([aborted, history('watched', 500)], [favorite('liked')]).map(([id]) => id),
  ).toEqual(['liked', 'watched', 'short']);
});

it('bevorzugt abonnierte und favorisierte Kanäle bei gleichen Ausgangswerten', () => {
  const items = [video('neutral', 'UC-b'), video('sub', 'UC-c'), video('like', 'UC-a')];
  const result = rankRecommendations(
    [{ key: 'home', items, weight: 1 }],
    [],
    [favorite('seed')],
    [{ channel: { id: 'UC-c', name: 'C' }, subscribedAt: 1 }],
  );
  expect(result.at(-1)?.id).toBe('neutral');
});

it('mischt Kanäle, auch wenn eine Quelle viel mehr Videos liefert', () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => video(`a-${i}`)),
    video('b', 'UC-b'),
    video('c', 'UC-c'),
  ];
  const result = rankRecommendations([{ key: 'home', items, weight: 1 }], [], [], []);
  expect(new Set(result.slice(0, 4).map((v) => v.channel.id)).size).toBe(3);
  expect(result).toHaveLength(12);
});

it('mischt unbekannte Kanal-IDs anhand des Namens und begrenzt die Liste', () => {
  const items = ['A', 'A', 'B', 'C'].map((name, i) => ({
    ...video(String(i), ''),
    channel: { id: '', name },
  }));
  expect(
    rankRecommendations([{ key: 'a', items, weight: 1 }], [], [], [], 3).map((v) => v.channel.name),
  ).toEqual(['A', 'B', 'C']);
});

describe('Abwechslung auf „Für dich“', () => {
  const many = Array.from({ length: 12 }, (_, i) => history(`h${i}`, 500));

  it('hält die zwei stärksten Interessen fest und wechselt die übrigen mit der Rotation', () => {
    const first = recommendationSeeds(many, [favorite('liked')], 6, 1).map(([id]) => id);
    const again = recommendationSeeds(many, [favorite('liked')], 6, 1).map(([id]) => id);
    expect(first).toEqual(again);
    expect(first.slice(0, 2)).toEqual(['liked', 'h0']);
    expect(new Set(first).size).toBe(6);
    const rotations = new Set(
      [2, 3, 4, 5, 6, 7].map((r) =>
        recommendationSeeds(many, [favorite('liked')], 6, r)
          .map(([id]) => id)
          .join(),
      ),
    );
    expect(rotations.size).toBeGreaterThan(1);
  });

  it('wertet Startvideos aus dem ganzen Pool, auch wenn sie nicht zu den sechs stärksten gehören', () => {
    const batches = [{ key: 'related:h11', weight: 0, items: [video('neu', 'UC-b')] }];
    expect(rankRecommendations(batches, many, [], []).map((v) => v.id)).toEqual(['neu']);
  });

  it('schiebt oft gezeigte, nicht geöffnete Videos nach hinten', () => {
    const items = [video('alt', 'UC-a'), video('frisch', 'UC-b')];
    const batches = [{ key: 'home', weight: 1, items }];
    expect(rankRecommendations(batches, [], [], [])[0].id).toBe('alt');
    const impressions = new Map([['alt', 3]]);
    expect(rankRecommendations(batches, [], [], [], 60, { impressions })[0].id).toBe('frisch');
  });

  it('lässt alte Abo-Videos nicht dauerhaft vor neuen Vorschlägen stehen', () => {
    const subscription = { channel: { id: 'UC-s', name: 'S' }, subscribedAt: 1 };
    const old = Array.from({ length: 12 }, (_, i) => video(`s${i}`, 'UC-s'));
    const batches = [
      { key: 'channel:UC-s', weight: 4, items: old },
      { key: 'home', weight: 1, items: [video('allgemein', 'UC-x')] },
    ];
    const result = rankRecommendations(batches, [], [], [subscription]).map((v) => v.id);
    expect(result.indexOf('allgemein')).toBeLessThan(3);
  });

  it('mischt mit Rotation leicht neu, bleibt für dieselbe Rotation aber stabil', () => {
    const items = Array.from({ length: 20 }, (_, i) => video(`v${i}`, `UC-${i}`));
    const batches = [{ key: 'home', weight: 1, items }];
    const order = (rotation: number) =>
      rankRecommendations(batches, [], [], [], 60, { rotation })
        .map((v) => v.id)
        .join();
    expect(order(1)).toBe(order(1));
    expect(new Set([1, 2, 3, 4].map(order)).size).toBeGreaterThan(1);
  });

  it('verteilt stabile Zufallswerte gleichmäßig', () => {
    const values = Array.from({ length: 2000 }, (_, i) => stableRandom(7, `id-${i}`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
