import type { Segment } from '@/lib/segments';
import type {
  PlaybackSource,
  StreamResult,
  VideoDetails,
  VideoSummary,
} from '@/services/video-source/types';
import type { DownloadMode, DownloadQuality } from './hls';

export type DownloadStatus =
  'queued' | 'downloading' | 'ready' | 'interrupted' | 'error' | 'cancelled';
export interface DownloadEntry {
  id: string;
  video: VideoSummary;
  details?: VideoDetails;
  mode: DownloadMode;
  quality: DownloadQuality;
  status: DownloadStatus;
  createdAt: number;
  bytes: number;
  progress: number;
  label?: string;
  entry?: string;
  contentType?: PlaybackSource['contentType'];
  segments?: Segment[];
  error?: string;
}
export interface DownloadSnapshot {
  items: DownloadEntry[];
  error?: string;
}
export interface DownloadBackend {
  load(): DownloadEntry[];
  save(items: DownloadEntry[]): void;
  uuid(): string;
  run(
    item: DownloadEntry,
    signal: AbortSignal,
    progress: (bytes: number, fraction: number) => void,
  ): Promise<Partial<DownloadEntry>>;
  remove(id: string): Promise<void>;
  exists(item: DownloadEntry): Promise<boolean>;
  uri(item: DownloadEntry): string;
}

/** Serialisierte Warteschlange. Erst nach vollständiger Speicherung wird ein Eintrag abspielbar. */
export class DownloadManager {
  private snapshot?: DownloadSnapshot;
  private listeners = new Set<() => void>();
  private active?: { id: string; controller: AbortController; done: Promise<void> };
  private edits = new Map<string, Promise<void>>();
  constructor(private backend: DownloadBackend) {}
  get = (): DownloadSnapshot => {
    if (!this.snapshot) {
      try {
        const items = this.backend.load().map((item) =>
          ['queued', 'downloading'].includes(item.status)
            ? {
                ...item,
                status: 'interrupted' as const,
                error: 'Download wurde unterbrochen. Bitte erneut laden.',
              }
            : item,
        );
        this.snapshot = { items };
      } catch {
        this.snapshot = {
          items: [],
          error: 'Downloads konnten nicht geladen werden. Starte die App erneut.',
        };
      }
    }
    return this.snapshot;
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(items: DownloadEntry[], persist = true) {
    if (persist) this.backend.save(items);
    this.snapshot = { items };
    this.listeners.forEach((l) => l());
  }
  private update(id: string, patch: Partial<DownloadEntry>, persist = true) {
    this.publish(
      this.get().items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      persist,
    );
  }
  add(video: VideoSummary, mode: DownloadMode, quality: DownloadQuality) {
    if (this.get().error) throw new Error(this.get().error);
    if (video.isLive) throw new Error('Livestreams können nicht heruntergeladen werden.');
    const existing = this.get().items.find(
      (item) => item.video.id === video.id && item.mode === mode,
    );
    if (existing) return existing.id;
    const id = this.backend.uuid();
    this.publish([
      ...this.get().items,
      { id, video, mode, quality, status: 'queued', createdAt: Date.now(), bytes: 0, progress: 0 },
    ]);
    this.pump();
    return id;
  }
  private pump() {
    if (this.active || this.get().error) return;
    const item = this.get().items.find((i) => i.status === 'queued');
    if (!item) return;
    const controller = new AbortController();
    // run beginnt im nächsten Microtask; active ist davor bereits gesetzt.
    const done = Promise.resolve().then(async () => {
      try {
        if (controller.signal.aborted) throw new Error('Download abgebrochen.');
        this.update(item.id, { status: 'downloading', error: undefined });
        const result = await this.backend.run(item, controller.signal, (bytes, progress) => {
          if (!controller.signal.aborted) this.update(item.id, { bytes, progress }, false);
        });
        if (controller.signal.aborted) throw new Error('Download abgebrochen.');
        if (!result.entry || !result.contentType) throw new Error('Download ist unvollständig.');
        this.update(item.id, { ...result, status: 'ready', progress: 1, error: undefined });
      } catch (error) {
        // Teil-Dateien bleiben niemals als fertiger Download sichtbar.
        try {
          await this.backend.remove(item.id);
          this.update(item.id, {
            status: controller.signal.aborted ? 'cancelled' : 'error',
            bytes: 0,
            progress: 0,
            error: controller.signal.aborted
              ? undefined
              : error instanceof Error
                ? error.message
                : 'Download fehlgeschlagen.',
          });
        } catch {
          this.snapshot = {
            ...this.get(),
            error:
              'Download konnte nicht gespeichert oder bereinigt werden. Bitte die App erneut starten.',
          };
          this.listeners.forEach((l) => l());
        }
      } finally {
        this.active = undefined;
        this.pump();
      }
    });
    this.active = { id: item.id, controller, done };
  }
  async cancel(id: string) {
    if (this.active?.id === id) {
      this.active.controller.abort();
      await this.active.done;
    } else if (this.get().items.find((i) => i.id === id)?.status === 'queued') {
      this.update(id, { status: 'cancelled' });
    }
  }
  private edit(id: string, action: () => Promise<void>) {
    const next = (this.edits.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
    this.edits.set(id, next);
    void next
      .finally(() => {
        if (this.edits.get(id) === next) this.edits.delete(id);
      })
      .catch(() => {});
    return next;
  }
  retry(id: string) {
    return this.edit(id, () => this.retryEntry(id));
  }
  private async retryEntry(id: string) {
    const item = this.get().items.find((i) => i.id === id);
    if (!item || !['error', 'cancelled', 'interrupted'].includes(item.status)) return;
    await this.backend.remove(id);
    // Status nach dem await erneut prüfen: zwei schnelle Klicks dürfen nicht zwei Jobs starten.
    if (
      !['error', 'cancelled', 'interrupted'].includes(
        this.get().items.find((i) => i.id === id)?.status ?? '',
      )
    )
      return;
    this.update(id, {
      status: 'queued',
      bytes: 0,
      progress: 0,
      error: undefined,
      entry: undefined,
    });
    this.pump();
  }
  remove(id: string) {
    return this.edit(id, async () => {
      await this.cancel(id);
      await this.backend.remove(id);
      this.publish(this.get().items.filter((i) => i.id !== id));
    });
  }
  find(videoId: string, downloadId?: string) {
    const items = this.get().items.filter((i) => i.video.id === videoId && i.status === 'ready');
    return downloadId
      ? items.find((i) => i.id === downloadId)
      : (items.find((i) => i.mode === 'video') ?? items[0]);
  }
  async playback(videoId: string, downloadId?: string): Promise<StreamResult | undefined> {
    const item = this.find(videoId, downloadId);
    if (!item) {
      if (downloadId) throw new Error('Dieser Download ist nicht mehr verfügbar.');
      return undefined;
    }
    if (!(await this.backend.exists(item))) {
      this.update(item.id, {
        status: 'error',
        error: 'Download-Dateien fehlen. Bitte erneut laden.',
      });
      throw new Error('Download-Dateien fehlen. Bitte in der Bibliothek erneut laden.');
    }
    return {
      source: {
        uri: this.backend.uri(item),
        contentType: item.contentType!,
        via: `Download · ${item.label}`,
      },
      details: item.details ?? { ...item.video, description: '' },
      attempts: [],
    };
  }
}
