import type { ChannelRef, VideoSummary } from '@/services/video-source/types';

export interface ImportedWatch {
  video: VideoSummary;
  watchedAt: number;
}
export interface ImportedPlaylist {
  key: string;
  name: string;
  videos: VideoSummary[];
}
export interface LibraryImport {
  subscriptions: ChannelRef[];
  history: ImportedWatch[];
  playlists: ImportedPlaylist[];
  warnings: string[];
}
export interface ImportResult {
  subscriptions: number;
  history: number;
  playlists: number;
  videos: number;
}
