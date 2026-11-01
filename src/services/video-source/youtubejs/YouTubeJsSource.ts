import { Constants, Innertube, Platform, YTNodes, type Types, type YT } from 'youtubei.js';

import {
  StreamUnavailableError,
  type PlaybackSource,
  type SearchPage,
  type StreamAttempt,
  type StreamResult,
  type Thumbnail,
  type VideoDetails,
  type VideoSource,
  type VideoSummary,
} from '../types';
import { evaluatePlayerScript } from './evaluator';

type Client = Types.InnerTubeClient;

/**
 * Reihenfolge der InnerTube-Clients beim Abrufen der Streams.
 * Mobile/VR-Clients liefern meist fertige URLs (oft ein HLS-Manifest) ohne
 * PoToken; der Web-Client ist der letzte Ausweg.
 */
export const DEFAULT_CLIENTS: Client[] = ['IOS', 'VISIONOS', 'ANDROID_VR', 'TV', 'WEB'];

export interface YouTubeJsOptions {
  clients?: Client[];
  /** Speichert ein DASH-Manifest und gibt eine abspielbare URI zurück (z. B. file://) */
  saveDashManifest?: (videoId: string, xml: string) => Promise<string>;
}

export class YouTubeJsSource implements VideoSource {
  readonly name = 'YouTube.js';
  private innertube?: Promise<Innertube>;
  private readonly clients: Client[];

  constructor(private readonly options: YouTubeJsOptions = {}) {
    this.clients = options.clients ?? DEFAULT_CLIENTS;
  }

  private getInnertube(): Promise<Innertube> {
    if (!this.innertube) {
      Platform.shim.eval = evaluatePlayerScript;
      this.innertube = Innertube.create({
        generate_session_locally: true,
        retrieve_player: true,
        lang: 'de',
        location: 'DE',
      }).catch((error: unknown) => {
        this.innertube = undefined; // beim nächsten Versuch neu starten
        throw error;
      });
    }
    return this.innertube;
  }

  async search(query: string): Promise<SearchPage> {
    const yt = await this.getInnertube();
    const result = await yt.search(query, { type: 'video' });
    return toSearchPage(result);
  }

  async getStreams(id: string): Promise<StreamResult> {
    const yt = await this.getInnertube();
    const attempts: StreamAttempt[] = [];
    let details: VideoDetails | undefined;

    for (const client of this.clients) {
      try {
        const info = await yt.getBasicInfo(id, { client });
        details ??= toVideoDetails(id, info);

        const status = info.playability_status?.status;
        if (status !== 'OK') {
          attempts.push({
            via: client,
            ok: false,
            message: `${status ?? 'unbekannt'}: ${info.playability_status?.reason ?? 'kein Grund angegeben'}`,
          });
          continue;
        }

        const source = await this.pickSource(yt, id, client, info);
        if (!source) {
          attempts.push({ via: client, ok: false, message: 'keine abspielbaren Formate' });
          continue;
        }

        attempts.push({ via: client, ok: true, message: `${source.contentType} gefunden` });
        return { source, details, attempts };
      } catch (error) {
        attempts.push({ via: client, ok: false, message: errorMessage(error) });
      }
    }

    throw new StreamUnavailableError(
      'Für dieses Video wurde keine abspielbare Quelle gefunden.',
      attempts,
    );
  }

  private async pickSource(
    yt: Innertube,
    id: string,
    client: Client,
    info: YT.VideoInfo,
  ): Promise<PlaybackSource | undefined> {
    const data = info.streaming_data;
    if (!data) return undefined;
    const headers = clientHeaders(client);

    if (data.hls_manifest_url) {
      return { uri: data.hls_manifest_url, contentType: 'hls', headers, via: client };
    }

    if (data.adaptive_formats.length > 0 && this.options.saveDashManifest) {
      const xml = await info.toDash();
      const uri = await this.options.saveDashManifest(id, xml);
      return { uri, contentType: 'dash', headers, via: client };
    }

    const muxed = data.formats.filter((f) => f.has_audio && f.has_video);
    if (muxed.length > 0) {
      const best = muxed.reduce((a, b) => ((b.height ?? 0) > (a.height ?? 0) ? b : a));
      const uri = await best.decipher(yt.session.player);
      if (uri) return { uri, contentType: 'progressive', headers, via: client };
    }

    return undefined;
  }
}

function clientHeaders(client: Client): Record<string, string> | undefined {
  const config = (Constants.CLIENTS as Record<string, { USER_AGENT?: string }>)[client];
  return config?.USER_AGENT ? { 'User-Agent': config.USER_AGENT } : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toThumbnails(
  list: { url: string; width: number; height: number }[] | undefined,
): Thumbnail[] {
  return (list ?? []).map(({ url, width, height }) => ({ url, width, height }));
}

function toVideoSummary(video: YTNodes.Video): VideoSummary {
  return {
    id: video.video_id,
    title: video.title.toString(),
    channel: {
      id: video.author.id,
      name: video.author.name,
      avatar: video.author.best_thumbnail,
    },
    durationSeconds: video.is_live ? undefined : video.duration?.seconds,
    viewCountText: (video.short_view_count ?? video.view_count)?.toString(),
    publishedText: video.published?.toString(),
    thumbnails: toThumbnails(video.thumbnails),
    isLive: video.is_live,
  };
}

function toSearchPage(result: YT.Search): SearchPage {
  const items = result.results
    .filter((node): node is YTNodes.Video => node.is(YTNodes.Video))
    .map(toVideoSummary);

  return {
    items,
    next: result.has_continuation
      ? async () => toSearchPage(await result.getContinuation())
      : undefined,
  };
}

function toVideoDetails(id: string, info: YT.VideoInfo): VideoDetails {
  const b = info.basic_info;
  return {
    id,
    title: b.title ?? '',
    channel: { id: b.channel?.id ?? b.channel_id ?? '', name: b.channel?.name ?? b.author ?? '' },
    durationSeconds: b.is_live ? undefined : b.duration,
    viewCount: b.view_count,
    likeCount: b.like_count,
    thumbnails: toThumbnails(b.thumbnail),
    isLive: Boolean(b.is_live),
    description: b.short_description ?? '',
  };
}
