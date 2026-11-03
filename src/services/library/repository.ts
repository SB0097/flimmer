import type { ChannelRef, VideoSummary } from '@/services/video-source/types';

import type { FeedCache, LibrarySnapshot, ProgressUpdate } from './types';

/** Kleine Schnittstelle, damit dieselben Abfragen auch mit echtem SQLite testbar sind. */
export interface LibraryDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...params: (string | number | null)[]): unknown;
  getAllSync<T>(sql: string, ...params: (string | number | null)[]): T[];
  getFirstSync<T>(sql: string, ...params: (string | number | null)[]): T | null;
  withTransactionSync(task: () => void): void;
}

export class LibraryRepository {
  constructor(private readonly db: LibraryDatabase) {
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS library_videos (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_history (
        video_id TEXT PRIMARY KEY NOT NULL, last_watched_at INTEGER NOT NULL,
        position REAL NOT NULL, watched_seconds REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS library_favorites (video_id TEXT PRIMARY KEY NOT NULL, saved_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS library_subscriptions (channel_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, subscribed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS library_feed_cache (key TEXT PRIMARY KEY NOT NULL, fetched_at INTEGER NOT NULL, json TEXT NOT NULL);
    `);
  }

  read(): LibrarySnapshot {
    const history = this.db.getAllSync<{
      json: string;
      last_watched_at: number;
      position: number;
      watched_seconds: number;
      completed: number;
    }>(
      `SELECT v.json, h.* FROM library_history h JOIN library_videos v ON v.id = h.video_id ORDER BY h.last_watched_at DESC`,
    );
    const favorites = this.db.getAllSync<{ json: string; saved_at: number }>(
      `SELECT v.json, f.saved_at FROM library_favorites f JOIN library_videos v ON v.id = f.video_id ORDER BY f.saved_at DESC`,
    );
    const subscriptions = this.db.getAllSync<{ json: string; subscribed_at: number }>(
      'SELECT json, subscribed_at FROM library_subscriptions ORDER BY subscribed_at DESC',
    );
    return {
      history: history.map((h) => ({
        video: JSON.parse(h.json) as VideoSummary,
        lastWatchedAt: h.last_watched_at,
        position: h.position,
        watchedSeconds: h.watched_seconds,
        completed: Boolean(h.completed),
      })),
      favorites: favorites.map((f) => ({
        video: JSON.parse(f.json) as VideoSummary,
        savedAt: f.saved_at,
      })),
      subscriptions: subscriptions.map((s) => ({
        channel: JSON.parse(s.json) as ChannelRef,
        subscribedAt: s.subscribed_at,
      })),
    };
  }

  private putVideo(video: VideoSummary): void {
    const row = this.db.getFirstSync<{ json: string }>(
      'SELECT json FROM library_videos WHERE id = ?',
      video.id,
    );
    const previous = row ? (JSON.parse(row.json) as VideoSummary) : undefined;
    // Stream-Basisdaten dürfen das reichhaltigere Kanalbild/Datum nicht wieder entfernen.
    const summary: VideoSummary = {
      id: video.id,
      title: video.title,
      channel: video.channel,
      durationSeconds: video.durationSeconds,
      viewCountText: video.viewCountText,
      publishedText: video.publishedText,
      thumbnails: video.thumbnails,
      isLive: video.isLive,
    };
    const merged = previous
      ? {
          ...previous,
          ...Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined)),
          channel: {
            ...previous.channel,
            ...Object.fromEntries(
              Object.entries(video.channel).filter(
                ([, value]) => value !== undefined && value !== '',
              ),
            ),
          },
        }
      : summary;
    this.db.runSync(
      'INSERT OR REPLACE INTO library_videos (id, json) VALUES (?, ?)',
      video.id,
      JSON.stringify(merged),
    );
  }

  updateMetadata(video: VideoSummary): void {
    if (this.db.getFirstSync('SELECT id FROM library_videos WHERE id = ?', video.id))
      this.putVideo(video);
  }

  record(video: VideoSummary, update: ProgressUpdate, now: number): void {
    if (!Number.isFinite(update.position) || !Number.isFinite(update.watchedSeconds)) return;
    this.db.withTransactionSync(() => {
      this.putVideo(video);
      this.db.runSync(
        `INSERT INTO library_history (video_id, last_watched_at, position, watched_seconds, completed)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET
        last_watched_at = excluded.last_watched_at, position = excluded.position,
        watched_seconds = library_history.watched_seconds + excluded.watched_seconds,
        completed = MAX(library_history.completed, excluded.completed)`,
        video.id,
        now,
        Math.max(0, update.position),
        Math.max(0, update.watchedSeconds),
        update.completed ? 1 : 0,
      );
      this.db.execSync(`DELETE FROM library_history WHERE video_id NOT IN (
        SELECT video_id FROM library_history ORDER BY last_watched_at DESC LIMIT 1000
      );`);
      this.pruneVideos();
    });
  }

  toggleFavorite(video: VideoSummary, now: number): void {
    this.db.withTransactionSync(() => {
      const exists = this.db.getFirstSync(
        'SELECT video_id FROM library_favorites WHERE video_id = ?',
        video.id,
      );
      if (exists) this.db.runSync('DELETE FROM library_favorites WHERE video_id = ?', video.id);
      else {
        this.putVideo(video);
        this.db.runSync(
          'INSERT INTO library_favorites (video_id, saved_at) VALUES (?, ?)',
          video.id,
          now,
        );
      }
      this.pruneVideos();
    });
  }

  toggleSubscription(channel: ChannelRef, now: number): void {
    if (!channel.id) return;
    const exists = this.db.getFirstSync(
      'SELECT channel_id FROM library_subscriptions WHERE channel_id = ?',
      channel.id,
    );
    if (exists)
      this.db.runSync('DELETE FROM library_subscriptions WHERE channel_id = ?', channel.id);
    else
      this.db.runSync(
        'INSERT INTO library_subscriptions (channel_id, json, subscribed_at) VALUES (?, ?, ?)',
        channel.id,
        JSON.stringify(channel),
        now,
      );
  }

  removeHistory(id?: string): void {
    this.db.withTransactionSync(() => {
      if (id) this.db.runSync('DELETE FROM library_history WHERE video_id = ?', id);
      else {
        this.db.execSync(
          "DELETE FROM library_history; DELETE FROM library_feed_cache WHERE key LIKE 'related:%';",
        );
      }
      this.pruneVideos();
    });
  }

  private pruneVideos(): void {
    this.db.execSync(
      'DELETE FROM library_videos WHERE id NOT IN (SELECT video_id FROM library_history UNION SELECT video_id FROM library_favorites)',
    );
  }

  getCache(key: string): FeedCache | undefined {
    const row = this.db.getFirstSync<{ fetched_at: number; json: string }>(
      'SELECT fetched_at, json FROM library_feed_cache WHERE key = ?',
      key,
    );
    return row
      ? { key, fetchedAt: row.fetched_at, items: JSON.parse(row.json) as VideoSummary[] }
      : undefined;
  }

  cache(batch: FeedCache): void {
    this.db.withTransactionSync(() => {
      this.db.runSync(
        'INSERT OR REPLACE INTO library_feed_cache (key, fetched_at, json) VALUES (?, ?, ?)',
        batch.key,
        batch.fetchedAt,
        JSON.stringify(batch.items.slice(0, 40)),
      );
      this.db.execSync(
        'DELETE FROM library_feed_cache WHERE key NOT IN (SELECT key FROM library_feed_cache ORDER BY fetched_at DESC LIMIT 100)',
      );
    });
  }
}
