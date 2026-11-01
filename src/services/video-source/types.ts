/**
 * Austauschbare Datenquelle für Videos.
 *
 * Die App greift nur über dieses Interface auf YouTube zu. Ändert YouTube etwas,
 * muss nur die jeweilige Implementierung angepasst werden. Standard ist
 * YouTube.js; der NewPipeExtractor kann später als natives Modul folgen.
 */

export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ChannelRef {
  id: string;
  name: string;
  avatar?: Thumbnail;
}

export interface VideoSummary {
  id: string;
  title: string;
  channel: ChannelRef;
  /** Länge in Sekunden, `undefined` bei Livestreams */
  durationSeconds?: number;
  viewCountText?: string;
  publishedText?: string;
  thumbnails: Thumbnail[];
  isLive: boolean;
}

export interface VideoDetails extends VideoSummary {
  description: string;
  viewCount?: number;
  likeCount?: number;
}

/** Abspielbare Quelle, direkt für expo-video verwendbar */
export interface PlaybackSource {
  uri: string;
  contentType: 'hls' | 'dash' | 'progressive';
  headers?: Record<string, string>;
  /** Über welchen Weg die Quelle ermittelt wurde (für die Diagnose) */
  via: string;
}

/** Ein einzelner Versuch beim Ermitteln der Streams (für die Diagnose) */
export interface StreamAttempt {
  via: string;
  ok: boolean;
  message: string;
}

export interface StreamResult {
  source: PlaybackSource;
  details?: VideoDetails;
  attempts: StreamAttempt[];
}

export class StreamUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: StreamAttempt[],
  ) {
    super(message);
    this.name = 'StreamUnavailableError';
  }
}

export interface SearchPage {
  items: VideoSummary[];
  /** Weiterblättern; `undefined`, wenn es keine weiteren Ergebnisse gibt */
  next?: () => Promise<SearchPage>;
}

export interface VideoSource {
  readonly name: string;
  search(query: string): Promise<SearchPage>;
  getStreams(id: string): Promise<StreamResult>;
}
