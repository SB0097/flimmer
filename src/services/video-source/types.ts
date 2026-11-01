/**
 * Austauschbare Datenquelle für Videos.
 *
 * Die App greift nur über dieses Interface auf YouTube zu. Ändert YouTube etwas,
 * muss nur die jeweilige Implementierung angepasst werden. Standard wird
 * YouTube.js (M1); der NewPipeExtractor kann später als natives Modul folgen.
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
  viewCount?: number;
  publishedText?: string;
  thumbnails: Thumbnail[];
  isLive: boolean;
}

export interface VideoDetails extends VideoSummary {
  description: string;
  likeCount?: number;
}

export interface StreamInfo {
  /** DASH-Manifest (bevorzugt, enthält alle Qualitäten) */
  dashManifestUrl?: string;
  /** HLS-Manifest, vor allem bei Livestreams */
  hlsManifestUrl?: string;
  /** Direkt abspielbare Audio-URL für den Nur-Audio-Modus */
  audioOnlyUrl?: string;
  /** Ablaufzeitpunkt der URLs (ms seit Epoch) */
  expiresAt?: number;
}

export interface SearchPage {
  items: VideoSummary[];
  /** Weiterblättern; `undefined`, wenn es keine weiteren Ergebnisse gibt */
  continuation?: () => Promise<SearchPage>;
}

export interface VideoSource {
  readonly name: string;
  search(query: string): Promise<SearchPage>;
  getVideo(id: string): Promise<VideoDetails>;
  getStreams(id: string): Promise<StreamInfo>;
}
