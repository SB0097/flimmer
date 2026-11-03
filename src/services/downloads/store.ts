import { randomUUID } from 'expo-crypto';
import * as FS from 'expo-file-system/legacy';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { fetchSegments } from '@/services/sponsorblock/sponsorblock';
import { videoSource } from '@/services/video-source';
import { planHls, remoteUri } from './hls';
import { DownloadManager, type DownloadEntry } from './manager';
import { abortable } from './abortable';

const root = `${FS.documentDirectory}downloads/`;
let database: SQLiteDatabase | undefined;
function db() {
  if (!database) {
    const opened = openDatabaseSync('flimmer-downloads.db');
    opened.execSync(
      'CREATE TABLE IF NOT EXISTS download_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)',
    );
    database = opened;
  }
  return database;
}
function folder(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id) || !FS.documentDirectory)
    throw new Error('Ungültiger Download-Pfad.');
  return root + id + '/';
}
function file(item: DownloadEntry) {
  if (!item.entry || !/^[a-zA-Z0-9.-]+$/.test(item.entry))
    throw new Error('Ungültige Download-Datei.');
  return folder(item.id) + item.entry;
}
function check(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Download abgebrochen.');
}

export const downloads = new DownloadManager({
  uuid: randomUUID,
  load: () => {
    const row = db().getFirstSync<{ json: string }>('SELECT json FROM download_state WHERE id = 1');
    return row ? JSON.parse(row.json) : [];
  },
  save: (items) =>
    db().runSync(
      'INSERT OR REPLACE INTO download_state (id, json) VALUES (1, ?)',
      JSON.stringify(items),
    ),
  remove: (id) => FS.deleteAsync(folder(id), { idempotent: true }),
  exists: async (item) => {
    const info = await FS.getInfoAsync(file(item));
    return info.exists && !info.isDirectory;
  },
  uri: file,
  run: async (item, signal, progress) => {
    const result = await abortable(videoSource.getStreams(item.video.id), signal);
    check(signal);
    if (result.details?.isLive) throw new Error('Livestreams können nicht heruntergeladen werden.');
    const { source } = result;
    if (source.contentType === 'dash')
      throw new Error('Für dieses Video ist derzeit kein Download verfügbar.');
    if (source.contentType !== 'hls' && item.mode === 'audio')
      throw new Error('Für dieses Video ist keine separate Tonspur verfügbar.');
    const headers = source.headers;
    const read = async (uri: string) => {
      check(signal);
      const response = await abortable(fetch(remoteUri(uri, uri), { headers, signal }), signal);
      if (!response.ok)
        throw new Error(
          `Die Download-Adresse antwortet mit HTTP ${response.status}. Bitte erneut versuchen.`,
        );
      return { text: await abortable(response.text(), signal), uri: response.url || uri };
    };
    const plan =
      source.contentType === 'hls'
        ? await planHls(source.uri, item.mode, item.quality, read)
        : {
            resources: [{ uri: source.uri, name: 'video.mp4' }],
            manifests: [],
            entry: 'video.mp4',
            label: 'Video',
          };
    check(signal);
    const path = folder(item.id);
    await FS.deleteAsync(path, { idempotent: true });
    await FS.makeDirectoryAsync(path, { intermediates: true });
    let bytes = 0;
    let complete = 0;
    const download = async (uri: string, name: string, report = true) => {
      check(signal);
      // Genug Reserve für Datenbank und Wiedergabe lassen; auch zwischen Segmenten prüfen.
      if ((await FS.getFreeDiskStorageAsync()) < 32 * 1024 * 1024)
        throw new Error('Zu wenig Speicherplatz. Bitte Downloads oder andere Dateien löschen.');
      check(signal);
      const task = FS.createDownloadResumable(uri, path + name, { headers }, (event) => {
        if (report && !signal.aborted) {
          const part =
            event.totalBytesExpectedToWrite > 0
              ? event.totalBytesWritten / event.totalBytesExpectedToWrite
              : 0;
          progress(
            bytes + event.totalBytesWritten,
            Math.min(0.99, (complete + part) / plan.resources.length),
          );
        }
      });
      const cancel = () => {
        void task.cancelAsync().catch(() => {});
      };
      signal.addEventListener('abort', cancel);
      try {
        check(signal);
        const response = await task.downloadAsync();
        check(signal);
        if (!response || response.status < 200 || response.status >= 300)
          throw new Error(
            `Download fehlgeschlagen (HTTP ${response?.status ?? 'unbekannt'}). Bitte erneut versuchen.`,
          );
        const info = await FS.getInfoAsync(path + name);
        if (!info.exists || info.isDirectory || info.size === 0)
          throw new Error('Eine Download-Datei ist leer oder fehlt.');
        const length = Number(
          Object.entries(response.headers).find(
            ([key]) => key.toLowerCase() === 'content-length',
          )?.[1],
        );
        if (Number.isFinite(length) && length > 0 && info.size !== length)
          throw new Error(
            'Eine Download-Datei wurde nicht vollständig übertragen. Bitte erneut laden.',
          );
        if (report) {
          bytes += info.size;
          complete++;
          progress(bytes, Math.min(0.99, complete / plan.resources.length));
        }
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    };
    for (const resource of plan.resources) await download(resource.uri, resource.name);
    for (const manifest of plan.manifests) {
      check(signal);
      await FS.writeAsStringAsync(path + manifest.name, manifest.text);
    }
    const details = result.details ?? { ...item.video, description: '' };
    // Vorschaubild und SponsorBlock sind optional; die Medien selbst müssen vollständig sein.
    const thumb = details.thumbnails.at(-1);
    let localThumbnail: string | undefined;
    if (thumb) {
      try {
        await download(thumb.url, 'thumbnail.jpg', false);
        localThumbnail = path + 'thumbnail.jpg';
      } catch {
        check(signal);
      }
    }
    const optional = new AbortController();
    const cancelOptional = () => optional.abort();
    signal.addEventListener('abort', cancelOptional);
    const timeout = setTimeout(cancelOptional, 8000);
    const segments = await fetchSegments(item.video.id, optional.signal).catch(() => []);
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancelOptional);
    check(signal);
    return {
      entry: plan.entry,
      contentType: source.contentType,
      label: plan.label,
      bytes,
      segments,
      details: {
        ...details,
        thumbnails: localThumbnail
          ? [{ url: localThumbnail, width: thumb!.width, height: thumb!.height }]
          : details.thumbnails,
      },
    };
  },
});

export function useDownloads() {
  return useSyncExternalStore(downloads.subscribe, downloads.get);
}
