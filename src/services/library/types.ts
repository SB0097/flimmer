import type { ChannelRef, VideoSummary } from '@/services/video-source/types';

export interface HistoryEntry {
  video: VideoSummary;
  lastWatchedAt: number;
  position: number;
  watchedSeconds: number;
  completed: boolean;
}

export interface Favorite {
  video: VideoSummary;
  savedAt: number;
}

export interface Subscription {
  channel: ChannelRef;
  subscribedAt: number;
}

export interface LibrarySnapshot {
  history: HistoryEntry[];
  favorites: Favorite[];
  subscriptions: Subscription[];
  error?: string;
}

export interface FeedCache {
  key: string;
  fetchedAt: number;
  items: VideoSummary[];
}

export interface ProgressUpdate {
  position: number;
  watchedSeconds: number;
  completed?: boolean;
}
