import { openDatabaseSync } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import type { ChannelRef, VideoSummary } from '@/services/video-source/types';

import { LibraryRepository } from './repository';
import type { FeedCache, LibrarySnapshot, ProgressUpdate } from './types';

let repository: LibraryRepository | undefined;
let snapshot: LibrarySnapshot | undefined;
const listeners = new Set<() => void>();
const metadata = new Map<string, VideoSummary>();
let historyEpoch = 0;
const historyRemovals = new Map<string, number>();

function db(): LibraryRepository {
  repository ??= new LibraryRepository(openDatabaseSync('flimmer-library.db'));
  return repository;
}

function message(error: unknown): string {
  return `Bibliothek konnte nicht gespeichert oder geladen werden: ${error instanceof Error ? error.message : String(error)}`;
}

function get(): LibrarySnapshot {
  if (!snapshot) {
    try {
      snapshot = db().read();
    } catch (error) {
      snapshot = {
        history: [],
        favorites: [],
        subscriptions: [],
        playlists: [],
        error: message(error),
      };
    }
  }
  return snapshot;
}

function publish(value: LibrarySnapshot): void {
  snapshot = value;
  listeners.forEach((listener) => listener());
}

function mutate(action: (repo: LibraryRepository) => void): boolean {
  try {
    action(db());
    publish(db().read());
    return true;
  } catch (error) {
    publish({ ...get(), error: message(error) });
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const library = {
  get,
  historyVersion: (id: string) => `${historyEpoch}:${historyRemovals.get(id) ?? 0}`,
  reload: () => mutate(() => {}),
  record: (video: VideoSummary, progress: ProgressUpdate) =>
    mutate((r) => r.record(metadata.get(video.id) ?? video, progress, Date.now())),
  updateMetadata: (video: VideoSummary) => {
    metadata.set(video.id, video);
    if (metadata.size > 32) metadata.delete(metadata.keys().next().value!);
    mutate((r) => r.updateMetadata(video));
  },
  toggleFavorite: (video: VideoSummary) => mutate((r) => r.toggleFavorite(video, Date.now())),
  toggleSubscription: (channel: ChannelRef) =>
    mutate((r) => r.toggleSubscription(channel, Date.now())),
  createPlaylist: (name: string, video?: VideoSummary): string | undefined => {
    const id = randomUUID();
    return mutate((r) => r.createPlaylist(id, name, Date.now(), video)) ? id : undefined;
  },
  renamePlaylist: (id: string, name: string) =>
    mutate((r) => r.renamePlaylist(id, name, Date.now())),
  deletePlaylist: (id: string) => mutate((r) => r.deletePlaylist(id)),
  addPlaylistVideo: (id: string, video: VideoSummary) =>
    mutate((r) => r.addPlaylistVideo(id, video, Date.now())),
  removePlaylistVideo: (id: string, videoId: string) =>
    mutate((r) => r.removePlaylistVideo(id, videoId, Date.now())),
  movePlaylistVideo: (id: string, videoId: string, direction: -1 | 1) =>
    mutate((r) => r.movePlaylistVideo(id, videoId, direction, Date.now())),
  removeHistory: (id?: string) => {
    if (mutate((r) => r.removeHistory(id))) {
      if (id) historyRemovals.set(id, (historyRemovals.get(id) ?? 0) + 1);
      else {
        historyEpoch++;
        historyRemovals.clear();
      }
    }
  },
  getCache(key: string): FeedCache | undefined {
    try {
      return db().getCache(key);
    } catch {
      return undefined;
    }
  },
  cache(batch: FeedCache): void {
    // Ein fehlgeschlagener Vorschlags-Cache darf die aktuelle Bibliothek nicht verdecken.
    try {
      db().cache(batch);
    } catch {
      /* Ohne Cache bleiben Vorschläge für diese Sitzung nutzbar. */
    }
  },
};

export function useLibrary(): LibrarySnapshot {
  return useSyncExternalStore(subscribe, get, get);
}
