/** @jest-environment node */
/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VideoSummary } from '@/services/video-source/types';

import { LibraryRepository, type LibraryDatabase } from '../repository';

function adapter(sqlite: DatabaseSync): LibraryDatabase {
  return {
    execSync: (sql) => sqlite.exec(sql),
    runSync: (sql, ...params) => sqlite.prepare(sql).run(...params),
    getAllSync: <T>(sql: string, ...params: (string | number | null)[]) =>
      sqlite.prepare(sql).all(...params) as T[],
    getFirstSync: <T>(sql: string, ...params: (string | number | null)[]) =>
      (sqlite.prepare(sql).get(...params) as T | undefined) ?? null,
    withTransactionSync: (task) => {
      sqlite.exec('BEGIN');
      try {
        task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const video = (id: string): VideoSummary => ({
  id,
  title: `Video ${id}`,
  channel: { id: 'UC-test', name: 'Testkanal' },
  thumbnails: [],
  durationSeconds: 600,
  isLive: false,
});

it('bewahrt Verlauf, Position, Favoriten, Abos und Cache nach erneutem Öffnen der Datei', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flimmer-library-'));
  const path = join(directory, 'library.db');
  let sqlite = new DatabaseSync(path);
  try {
    let repo = new LibraryRepository(adapter(sqlite));
    repo.record(video('a'), { position: 42, watchedSeconds: 20 }, 1000);
    repo.record(video('a'), { position: 120, watchedSeconds: 10 }, 2000);
    repo.toggleFavorite(video('a'), 3000);
    repo.toggleSubscription(video('a').channel, 4000);
    repo.cache({ key: 'related:a', fetchedAt: 5000, items: [video('b')] });
    sqlite.close();
    sqlite = new DatabaseSync(path);
    repo = new LibraryRepository(adapter(sqlite));
    const state = repo.read();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({
      position: 120,
      watchedSeconds: 30,
      lastWatchedAt: 2000,
    });
    expect(state.favorites[0].video.id).toBe('a');
    expect(state.subscriptions[0].channel.id).toBe('UC-test');
    expect(repo.getCache('related:a')?.items[0].id).toBe('b');
    repo.removeHistory();
    expect(repo.read().history).toEqual([]);
    expect(repo.read().favorites).toHaveLength(1);
    expect(repo.read().subscriptions).toHaveLength(1);
    expect(repo.getCache('related:a')).toBeUndefined();
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('behält angereicherte Metadaten und entfernt Einträge unabhängig voneinander', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    const detailed = {
      ...video('a'),
      channel: { ...video('a').channel, avatar: { url: 'avatar', width: 40, height: 40 } },
    };
    repo.toggleFavorite(detailed, 1);
    repo.record(video('a'), { position: 8, watchedSeconds: 8 }, 2);
    repo.record(video('b'), { position: 15, watchedSeconds: 15 }, 3);
    expect(repo.read().history[1].video.channel.avatar?.url).toBe('avatar');
    repo.removeHistory('a');
    expect(repo.read().history.map((h) => h.video.id)).toEqual(['b']);
    expect(repo.read().favorites).toHaveLength(1);
    repo.toggleFavorite(video('a'), 4);
    expect(repo.read().favorites).toEqual([]);
    repo.toggleSubscription(video('a').channel, 5);
    repo.toggleSubscription(video('a').channel, 6);
    expect(repo.read().subscriptions).toEqual([]);
  } finally {
    sqlite.close();
  }
});
