import { Constants, Innertube, Platform, YTNodes, type Types, type YT } from 'youtubei.js';

import {
  StreamUnavailableError,
  type PlaybackSource,
  type Comment,
  type CommentSort,
  type CommentsPage,
  type CommentsResult,
  type ChannelPage,
  type ChannelRef,
  type RelatedPage,
  type WatchPage,
  type SearchPage,
  type StreamAttempt,
  type StreamResult,
  type Thumbnail,
  type VideoDetails,
  type VideoSource,
  type VideoSummary,
} from '../types';
import { applyClientOverrides } from './client-overrides';
import { evaluatePlayerScript } from './evaluator';
import { toComment, type CommentViewLike } from './comments';
import { lockupToSummary, parseDurationText, type LockupLike } from './lockup';
import { planSource } from './select-source';

type Client = Types.InnerTubeClient;

/**
 * Reihenfolge der InnerTube-Clients beim Abrufen der Streams.
 *
 * Stand 11/2026 (getestet über einen deutschen Heimanschluss):
 * - VISIONOS (Version siehe client-overrides): fertiges HLS-Manifest für normale Videos
 *   und Livestreams, vollständig ladbar, bis 1080p. Voraussetzung: eine von YouTube
 *   abgerufene Sitzung (visitorData), keine lokal erzeugte.
 * - ANDROID, ANDROID_VR: HLS-Manifeste für Livestreams (Reserve).
 * - IOS: Einzelformate sind nur am Anfang ladbar (danach HTTP 403 ohne PoToken),
 *   daher nur noch letzter Ausweg.
 */
export const DEFAULT_CLIENTS: Client[] = ['VISIONOS', 'ANDROID', 'ANDROID_VR', 'IOS'];

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
      applyClientOverrides();
      const options = { retrieve_player: true, lang: 'de', location: 'DE' } as const;
      this.innertube = Innertube.create({ ...options, generate_session_locally: false })
        // Fällt der Abruf der Sitzung aus, lokal erzeugen (einige Clients verweigern dann aber)
        .catch(() => Innertube.create({ ...options, generate_session_locally: true }))
        .catch((error: unknown) => {
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

  async getHome(): Promise<SearchPage> {
    const yt = await this.getInnertube();
    const home = await yt
      .getHomeFeed()
      .then(toFeedPage)
      .catch(() => undefined);
    if (home?.items.length) return home;
    // YouTube zeigt Gästen mitunter eine leere Startseite. Dann breit gestreute
    // öffentliche Suchergebnisse nutzen, bis lokale Interessen vorhanden sind.
    const topics = ['Wissen Dokumentation', 'Musik live', 'Technik', 'Gaming', 'Kochen', 'Sport'];
    const day = Math.floor(Date.now() / 86_400_000);
    const results = await Promise.allSettled(
      [0, 1, 2].map((offset) => this.search(topics[(day + offset * 2) % topics.length])),
    );
    const items = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value.items.slice(0, 8) : [],
    );
    if (!items.length)
      throw new Error(
        'Allgemeine Vorschläge sind gerade nicht verfügbar. Versuche es mit der Suche.',
      );
    return { items: uniqueVideos(items) };
  }

  async getChannel(id: string): Promise<ChannelPage> {
    const yt = await this.getInnertube();
    const result = await yt.getChannel(id);
    const metadata = result.metadata;
    const header = result.header;
    const subscriberCountText = header?.is(YTNodes.C4TabbedHeader)
      ? header.subscribers?.toString()
      : header?.is(YTNodes.PageHeader)
        ? header.content?.metadata?.metadata_rows
            .flatMap((row) => (row.metadata_parts ?? []).map((part) => part.text?.toString() ?? ''))
            .find((text) => /Abonnenten|subscribers/i.test(text))
        : undefined;
    const channel: ChannelRef = {
      id: metadata.external_id || id,
      name: metadata.title || id,
      avatar: (metadata.avatar ?? metadata.thumbnail)?.[0],
      subscriberCountText,
    };
    const videos = result.has_videos
      ? toFeedPage(await result.getVideos(), channel)
      : { items: [] };
    return { ...videos, channel, description: metadata.description ?? '' };
  }

  async getWatchPage(id: string): Promise<WatchPage> {
    const yt = await this.getInnertube();
    // Der WEB-Client liefert die vollständigen Seitendaten (Kanal, Beschreibung, Vorschläge).
    // Die Streams dieses Clients werden hier nicht verwendet.
    const info = await yt.getInfo(id, { client: 'WEB' });
    const page = toRelatedPage(info);
    return { details: toWatchDetails(id, info), related: page.items, moreRelated: page.more };
  }

  async getComments(id: string, sort: CommentSort): Promise<CommentsResult> {
    const yt = await this.getInnertube();
    const result = await yt.getComments(id, sort === 'newest' ? 'NEWEST_FIRST' : 'TOP_COMMENTS');
    const page = toCommentsPage(result);
    const header = result.header as { count?: { toString(): string } } | undefined;
    const countText = header?.count?.toString().replace(/\s*Kommentare?$/i, '') || undefined;
    return { ...page, countText };
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

        const picked = await this.pickSource(yt, id, client, info);
        if ('reason' in picked) {
          attempts.push({ via: client, ok: false, message: picked.reason });
          continue;
        }

        attempts.push({ via: client, ok: true, message: picked.message });
        return { source: picked.source, details, attempts };
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
  ): Promise<{ source: PlaybackSource; message: string } | { reason: string }> {
    const data = info.streaming_data;
    if (!data) return { reason: 'keine Streaming-Daten' };

    const headers = clientHeaders(client);
    const plan = planSource(data, {
      isLive: Boolean(info.basic_info.is_live),
      canGenerateDash: Boolean(this.options.saveDashManifest),
    });

    switch (plan.kind) {
      case 'hls':
        return {
          source: { uri: plan.uri, contentType: 'hls', headers, via: client },
          message: 'HLS-Manifest von YouTube',
        };
      case 'dash-server':
        return {
          source: { uri: plan.uri, contentType: 'dash', headers, via: client },
          message: 'DASH-Manifest von YouTube',
        };
      case 'dash-generated': {
        const xml = await info.toDash();
        const uri = await this.options.saveDashManifest!(id, xml);
        return {
          source: { uri, contentType: 'dash', headers, via: client },
          message: `DASH aus ${data.adaptive_formats.length} Formaten erzeugt`,
        };
      }
      case 'progressive': {
        const muxed = data.formats.filter((f) => f.has_audio && f.has_video);
        const best = muxed.reduce((a, b) => ((b.height ?? 0) > (a.height ?? 0) ? b : a));
        const uri = await best.decipher(yt.session.player);
        if (!uri) return { reason: 'kombiniertes Format ohne Adresse' };
        return {
          source: { uri, contentType: 'progressive', headers, via: client },
          message: `kombiniertes Format ${best.quality_label ?? ''}`.trim(),
        };
      }
      case 'none':
        return { reason: plan.reason };
    }
  }
}

type CommentThreadNode = YTNodes.CommentThread;

function threadToComment(thread: CommentThreadNode): Comment | undefined {
  const view = thread.comment as unknown as CommentViewLike | undefined;
  if (!view) return undefined;
  return toComment(view, thread.has_replies ? () => repliesPage(thread) : undefined);
}

async function repliesPage(thread: CommentThreadNode): Promise<CommentsPage> {
  const loaded = await thread.getReplies();
  return threadRepliesToPage(loaded as unknown as RepliesBatch);
}

/** Gemeinsame Form von CommentThread (erste Antworten) und CommentsContinuation (weitere) */
interface RepliesBatch {
  replies?: unknown[] | null;
  has_continuation: boolean;
  getContinuation(): Promise<RepliesBatch>;
}

function threadRepliesToPage(thread: RepliesBatch): CommentsPage {
  const items = (thread.replies ?? [])
    .map((reply) => {
      const view = (reply as unknown as { comment?: CommentViewLike }).comment ?? reply;
      return toComment(view as CommentViewLike);
    })
    .filter((c): c is Comment => c !== undefined);
  return {
    items,
    more: thread.has_continuation
      ? async () => threadRepliesToPage(await thread.getContinuation())
      : undefined,
  };
}

function toCommentsPage(result: YT.Comments): CommentsPage {
  const items = result.contents
    .map((thread) => threadToComment(thread))
    .filter((c): c is Comment => c !== undefined);
  return {
    items,
    more: result.has_continuation
      ? async () => toCommentsPage(await result.getContinuation())
      : undefined,
  };
}

function toRelatedPage(info: YT.VideoInfo): RelatedPage {
  const items = (info.watch_next_feed ?? [])
    .map((node) => {
      if (node.is(YTNodes.LockupView)) return lockupToSummary(node as unknown as LockupLike);
      if (node.is(YTNodes.CompactVideo)) return compactToSummary(node);
      return undefined;
    })
    .filter((v): v is VideoSummary => v !== undefined);

  return {
    items,
    more: info.wn_has_continuation
      ? async () => toRelatedPage(await info.getWatchNextContinuation())
      : undefined,
  };
}

function compactToSummary(video: YTNodes.CompactVideo): VideoSummary {
  return {
    id: video.video_id,
    title: video.title.toString(),
    channel: { id: video.author.id, name: video.author.name, avatar: video.author.best_thumbnail },
    durationSeconds: video.is_live ? undefined : video.duration?.seconds,
    viewCountText: (video.short_view_count ?? video.view_count)?.toString(),
    publishedText: video.published?.toString(),
    thumbnails: toThumbnails(video.thumbnails),
    isLive: video.is_live,
  };
}

function toWatchDetails(id: string, info: YT.VideoInfo): VideoDetails {
  const base = toVideoDetails(id, info);
  const primary = info.primary_info;
  const owner = info.secondary_info?.owner;
  const description = info.secondary_info?.description?.toString();

  return {
    ...base,
    title: primary?.title?.toString() || base.title,
    channel: owner
      ? {
          id: owner.author.id,
          name: owner.author.name,
          avatar: owner.author.best_thumbnail,
          subscriberCountText: owner.subscriber_count?.toString() || undefined,
        }
      : base.channel,
    viewCountText:
      (primary?.view_count?.short_view_count ?? primary?.view_count?.view_count)?.toString() ||
      undefined,
    publishedText: primary?.relative_date?.toString() || undefined,
    dateText: primary?.published?.toString() || undefined,
    description: description || base.description,
  };
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

interface VideoFeed {
  videos: {
    is: (
      type:
        | typeof YTNodes.Video
        | typeof YTNodes.CompactVideo
        | typeof YTNodes.GridVideo
        | typeof YTNodes.LockupView,
    ) => boolean;
  }[];
  has_continuation: boolean;
  getContinuation(): Promise<VideoFeed>;
}

function uniqueVideos(items: VideoSummary[]): VideoSummary[] {
  return [...new Map(items.map((video) => [video.id, video])).values()];
}

function toFeedPage(result: VideoFeed, channel?: ChannelRef): SearchPage {
  const items = result.videos
    .map((node): VideoSummary | undefined => {
      if (node.is(YTNodes.LockupView))
        return lockupToSummary(node as unknown as LockupLike, channel);
      if (node.is(YTNodes.Video)) return toVideoSummary(node as YTNodes.Video);
      if (node.is(YTNodes.CompactVideo)) return compactToSummary(node as YTNodes.CompactVideo);
      if (node.is(YTNodes.GridVideo)) {
        const video = node as YTNodes.GridVideo;
        return {
          id: video.video_id,
          title: video.title.toString(),
          channel: {
            id: video.author.id,
            name: video.author.name,
            avatar: video.author.best_thumbnail,
          },
          thumbnails: toThumbnails(video.thumbnails),
          durationSeconds: parseDurationText(video.duration?.toString()),
          viewCountText: (video.short_view_count ?? video.views)?.toString(),
          publishedText: video.published?.toString(),
          isLive: false,
        };
      }
      return undefined;
    })
    .filter((v): v is VideoSummary => v !== undefined)
    .map((video) => (channel ? { ...video, channel } : video));
  return {
    items: uniqueVideos(items),
    next: result.has_continuation
      ? async () => toFeedPage(await result.getContinuation(), channel)
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
