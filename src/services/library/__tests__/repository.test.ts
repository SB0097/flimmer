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

it('erweitert eine bestehende Bibliothek ohne Datenverlust und speichert Playlists über Neustarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flimmer-playlists-'));
  const path = join(directory, 'library.db');
  let sqlite = new DatabaseSync(path);
  try {
    let repo = new LibraryRepository(adapter(sqlite));
    repo.record(video('verlauf'), { position: 42, watchedSeconds: 10 }, 1);
    repo.toggleFavorite(video('favorit'), 2);
    repo.toggleSubscription(video('verlauf').channel, 3);
    // Der Zustand entspricht einer Bibliothek vor Einführung der neuen Tabellen.
    sqlite.exec('DROP TABLE library_playlist_videos; DROP TABLE library_playlists;');
    repo = new LibraryRepository(adapter(sqlite));
    repo.createPlaylist('p', "  Meine 'Videos' 🎵  ", 4, video('a'));
    repo.addPlaylistVideo('p', video('b'), 5);
    repo.addPlaylistVideo('p', video('a'), 6);
    repo.renamePlaylist('p', 'Für später', 7);
    repo.movePlaylistVideo('p', 'b', -1, 8);
    sqlite.close();
    sqlite = new DatabaseSync(path);
    repo = new LibraryRepository(adapter(sqlite));
    const saved = repo.read();
    expect(saved.playlists[0]).toMatchObject({ name: 'Für später', createdAt: 4, updatedAt: 8 });
    expect(saved.playlists[0].videos.map((v) => v.id)).toEqual(['b', 'a']);
    expect(saved.history[0].position).toBe(42);
    expect(saved.favorites[0].video.id).toBe('favorit');
    expect(saved.subscriptions).toHaveLength(1);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('behält gemeinsame Videos beim Löschen von Verlauf, Favoriten oder einzelnen Playlists', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    repo.record(video('a'), { position: 20, watchedSeconds: 10 }, 1);
    repo.toggleFavorite(video('a'), 2);
    repo.createPlaylist('p1', 'Erste', 3, video('a'));
    repo.createPlaylist('p2', 'Zweite', 4, video('a'));
    repo.removeHistory();
    repo.toggleFavorite(video('a'), 5);
    repo.deletePlaylist('p1');
    expect(repo.read().playlists[0].videos[0].id).toBe('a');
    repo.removePlaylistVideo('p2', 'a', 6);
    expect(repo.read().playlists[0].videos).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM library_videos').all()).toEqual([]);
    repo.toggleFavorite(video('b'), 7);
    repo.addPlaylistVideo('p2', video('b'), 8);
    repo.deletePlaylist('p2');
    expect(repo.read().playlists).toEqual([]);
    expect(repo.read().favorites[0].video.id).toBe('b');
  } finally {
    sqlite.close();
  }
});

it('sortiert nach Entfernen und Hinzufügen korrekt und lässt Randbewegungen unverändert', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    repo.createPlaylist('p', 'Reihenfolge', 1);
    for (const id of ['a', 'b', 'c']) repo.addPlaylistVideo('p', video(id), 2);
    repo.removePlaylistVideo('p', 'b', 3);
    repo.addPlaylistVideo('p', video('d'), 4);
    repo.movePlaylistVideo('p', 'a', -1, 5);
    repo.movePlaylistVideo('p', 'd', 1, 6);
    repo.movePlaylistVideo('p', 'fehlt', 1, 7);
    expect(repo.read().playlists[0].videos.map((v) => v.id)).toEqual(['a', 'c', 'd']);
    repo.movePlaylistVideo('p', 'a', 1, 8);
    expect(repo.read().playlists[0].videos.map((v) => v.id)).toEqual(['c', 'a', 'd']);
  } finally {
    sqlite.close();
  }
});

it('weist ungültige Namen und fehlende Listen ab, ohne verwaiste Videos anzulegen', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    expect(() => repo.createPlaylist('p', ' ', 1, video('a'))).toThrow();
    expect(() => repo.addPlaylistVideo('fehlt', video('b'), 2)).toThrow();
    expect(repo.read().playlists).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM library_videos').all()).toEqual([]);
    repo.createPlaylist('p', 'Gültig', 3);
    expect(() => repo.renamePlaylist('p', 'x'.repeat(101), 4)).toThrow();
    expect(repo.read().playlists[0].name).toBe('Gültig');
  } finally {
    sqlite.close();
  }
});

it('rollt Playlist und Metadaten zurück, wenn das erste Video nicht gespeichert werden kann', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    sqlite.exec(`CREATE TRIGGER reject_first_video BEFORE INSERT ON library_playlist_videos
      BEGIN SELECT RAISE(ABORT, 'Speichern fehlgeschlagen'); END;`);
    expect(() => repo.createPlaylist('p', 'Atomar', 1, video('a'))).toThrow();
    expect(repo.read().playlists).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM library_videos').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});
