/** @jest-environment node */
/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VideoSummary } from '@/services/video-source/types';

import {
  IMPRESSION_INTERVAL,
  IMPRESSION_TTL,
  LibraryRepository,
  type LibraryDatabase,
} from '../repository';
import type { LibraryImport } from '../import-types';

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

it('ergänzt Takeout atomar und wiederholbar, ohne Positionen, Metadaten oder Reihenfolgen zu ersetzen', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    repo.record(video('a'), { position: 120, watchedSeconds: 180 }, 500);
    repo.toggleFavorite(video('b'), 600);
    const batch: LibraryImport = {
      history: [
        { video: { ...video('a'), title: 'Importtitel' }, watchedAt: 999 },
        { video: video('b'), watchedAt: 400 },
      ],
      subscriptions: [video('a').channel],
      playlists: [{ key: 'liste', name: 'Importiert', videos: [video('b'), video('a')] }],
      warnings: [],
    };
    expect(repo.importData(batch, 1000)).toEqual({
      history: 1,
      subscriptions: 1,
      playlists: 1,
      videos: 2,
    });
    expect(repo.read().history.find((h) => h.video.id === 'a')).toMatchObject({
      position: 120,
      watchedSeconds: 180,
      lastWatchedAt: 500,
      video: { title: 'Video a' },
    });
    expect(repo.read().history.find((h) => h.video.id === 'b')).toMatchObject({
      imported: true,
      position: 0,
      watchedSeconds: 0,
    });
    repo.movePlaylistVideo('takeout:liste', 'a', -1, 2000);
    repo.renamePlaylist('takeout:liste', 'Mein Name', 2001);
    expect(repo.importData(batch, 3000)).toEqual({
      history: 0,
      subscriptions: 0,
      playlists: 0,
      videos: 0,
    });
    expect(repo.read().playlists[0].name).toBe('Mein Name');
    expect(repo.read().playlists[0].videos.map((v) => v.id)).toEqual(['a', 'b']);
    repo.record(video('b'), { position: 12, watchedSeconds: 8 }, 4000);
    expect(repo.read().history.find((h) => h.video.id === 'b')?.imported).toBeUndefined();
  } finally {
    sqlite.close();
  }
});

it('migriert alte Verlaufsdaten verlustfrei und rollt einen fehlgeschlagenen Import vollständig zurück', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(
      'CREATE TABLE library_history (video_id TEXT PRIMARY KEY NOT NULL, last_watched_at INTEGER NOT NULL, position REAL NOT NULL, watched_seconds REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0)',
    );
    sqlite.exec('CREATE TABLE library_videos (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL)');
    sqlite.prepare('INSERT INTO library_videos VALUES (?, ?)').run('a', JSON.stringify(video('a')));
    sqlite.prepare('INSERT INTO library_history VALUES (?, ?, ?, ?, ?)').run('a', 10, 42, 10, 0);
    const repo = new LibraryRepository(adapter(sqlite));
    sqlite.exec(
      "CREATE TRIGGER reject_import BEFORE INSERT ON library_playlist_videos BEGIN SELECT RAISE(ABORT, 'Fehler'); END",
    );
    expect(() =>
      repo.importData(
        {
          history: [{ video: video('b'), watchedAt: 20 }],
          subscriptions: [video('b').channel],
          playlists: [{ key: 'x', name: 'Test', videos: [video('b')] }],
          warnings: [],
        },
        100,
      ),
    ).toThrow();
    const saved = repo.read();
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0].position).toBe(42);
    expect(saved.subscriptions).toHaveLength(0);
    expect(saved.playlists).toHaveLength(0);
  } finally {
    sqlite.close();
  }
});

it('beachtet die Verlaufsgrenze und meldet nur tatsächlich beibehaltene Import-Einträge', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    const videos = sqlite.prepare('INSERT INTO library_videos VALUES (?, ?)');
    const history = sqlite.prepare(
      'INSERT INTO library_history (video_id, last_watched_at, position, watched_seconds) VALUES (?, ?, 42, 10)',
    );
    sqlite.exec('BEGIN');
    for (let i = 0; i < 1000; i++) {
      videos.run(String(i), JSON.stringify(video(String(i))));
      history.run(String(i), i + 100);
    }
    sqlite.exec('COMMIT');
    const result = repo.importData(
      {
        subscriptions: [],
        playlists: [],
        history: [{ video: video('zu-alt'), watchedAt: 1 }],
        warnings: [],
      },
      2000,
    );
    expect(result.history).toBe(0);
    expect(repo.read().history).toHaveLength(1000);
    expect(repo.read().history.every((h) => h.position === 42)).toBe(true);
  } finally {
    sqlite.close();
  }
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

it('zählt Anzeigen auf „Für dich“ höchstens alle drei Stunden und vergisst sie nach zwei Wochen', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const repo = new LibraryRepository(adapter(sqlite));
    const hour = 60 * 60_000;
    repo.recordImpressions(['a', 'b'], 0);
    repo.recordImpressions(['a'], hour);
    expect(repo.readImpressions(hour)).toEqual(
      new Map([
        ['a', 1],
        ['b', 1],
      ]),
    );
    repo.recordImpressions(['a'], IMPRESSION_INTERVAL + 1);
    repo.recordImpressions([], IMPRESSION_INTERVAL + 2);
    expect(repo.readImpressions(IMPRESSION_INTERVAL + 2).get('a')).toBe(2);
    const later = IMPRESSION_TTL + IMPRESSION_INTERVAL;
    expect(repo.readImpressions(later)).toEqual(new Map([['a', 2]]));
    repo.recordImpressions(['c'], later);
    expect(
      sqlite.prepare('SELECT video_id FROM library_impressions ORDER BY video_id').all(),
    ).toEqual([{ video_id: 'a' }, { video_id: 'c' }]);
  } finally {
    sqlite.close();
  }
});
