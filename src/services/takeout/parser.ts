import { strFromU8, unzipSync } from 'fflate';
import { Parser } from 'htmlparser2';

import { parseVideoId } from '@/lib/youtube-url';
import type { LibraryImport } from '@/services/library/import-types';
import type { ChannelRef, VideoSummary } from '@/services/video-source/types';
import { columnKey, parseCsv } from './csv';

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 24 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
export interface ImportFile {
  name: string;
  bytes: Uint8Array;
}
const clean = (text: unknown) => (typeof text === 'string' ? text.trim().slice(0, 1000) : '');
const channelId = (value: string) => (/^UC[A-Za-z0-9_-]{22}$/.test(value) ? value : '');
function channelFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?youtube\.com$/.test(url.hostname)) return '';
    return channelId(url.pathname.match(/^\/channel\/([^/]+)/)?.[1] ?? '');
  } catch {
    return '';
  }
}
function video(id: string, title?: string, channel?: ChannelRef): VideoSummary {
  return {
    id,
    title: clean(title) || `YouTube-Video ${id}`,
    channel: channel ?? { id: '', name: 'YouTube' },
    thumbnails: [],
    isLive: false,
  };
}
function watchedTitle(value: unknown) {
  return clean(value)
    .replace(/^(?:Watched\s+|Angesehen:\s*|Wiedergegeben:\s*)/i, '')
    .replace(/\s+angesehen$/i, '');
}

/** Kein geratener Zeitpunkt: unbekannte HTML-Datumsformate erhalten 0 und werden gekennzeichnet. */
export function watchDate(value: string): number {
  const iso = value.match(/\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})/)?.[0];
  if (iso) {
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  const german = value.match(
    /(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(MEZ|MESZ|CET|CEST|UTC|GMT)/,
  );
  if (german) {
    const [, d, m, y, h, min, sec = '0', zone] = german;
    if (+h > 23 || +min > 59 || +sec > 59) return 0;
    const offset = /^(MESZ|CEST)$/.test(zone) ? 2 : /^(MEZ|CET)$/.test(zone) ? 1 : 0;
    const day = Date.UTC(+y, +m - 1, +d, +h, +min, +sec);
    const check = new Date(day);
    return check.getUTCFullYear() === +y &&
      check.getUTCMonth() === +m - 1 &&
      check.getUTCDate() === +d
      ? day - offset * 3600_000
      : 0;
  }
  const english = value.match(
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:CET|CEST|UTC|GMT(?:[+-]\d{2}:?\d{2})?)/i,
  )?.[0];
  const parsed = english
    ? Date.parse(english.replace(/CEST$/i, 'GMT+0200').replace(/CET$/i, 'GMT+0100'))
    : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function htmlHistory(text: string, batch: LibraryImport) {
  let depth = 0;
  let block:
    | {
        depth: number;
        text: string;
        links: { href: string; text: string }[];
        current?: { href: string; text: string };
      }
    | undefined;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'div' && /(?:^|\s)outer-cell(?:\s|$)/.test(attrs.class ?? ''))
          block = { depth, text: '', links: [] };
        if (block && name === 'a') {
          block.current = { href: attrs.href ?? '', text: '' };
          block.links.push(block.current);
        }
        if (block && name === 'br') block.text += '\n';
        depth++;
      },
      ontext(value) {
        if (block) {
          block.text += value;
          if (block.current) block.current.text += value;
        }
      },
      onclosetag(name) {
        depth--;
        if (!block) return;
        if (name === 'a') block.current = undefined;
        if (depth !== block.depth) return;
        const watched = block.links.find((link) => parseVideoId(link.href));
        if (watched) {
          const channel = block.links.find((link) => channelFromUrl(link.href));
          batch.history.push({
            video: video(
              parseVideoId(watched.href)!,
              watched.text,
              channel
                ? { id: channelFromUrl(channel.href), name: clean(channel.text) || 'YouTube' }
                : undefined,
            ),
            watchedAt: watchDate(block.text),
          });
        }
        block = undefined;
      },
    },
    { decodeEntities: true },
  );
  parser.end(text);
}

function jsonData(text: string, batch: LibraryImport) {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Eine JSON-Datei ist beschädigt oder unvollständig.');
  }
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'items' in raw && Array.isArray(raw.items)
      ? raw.items
      : [];
  if (rows.length > MAX_ENTRIES)
    throw new Error(
      'Die Exportdatei enthält zu viele Einträge. Bitte den Zeitraum im Takeout-Export verkleinern.',
    );
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = parseVideoId(clean(row.titleUrl));
    if (id) {
      const sub = Array.isArray(row.subtitles)
        ? row.subtitles.find((s: { url?: string }) => channelFromUrl(clean(s?.url)))
        : undefined;
      batch.history.push({
        video: video(
          id,
          watchedTitle(row.title),
          sub ? { id: channelFromUrl(sub.url), name: clean(sub.name) || 'YouTube' } : undefined,
        ),
        watchedAt: watchDate(clean(row.time)),
      });
    } else {
      const snippet = row.snippet;
      const channel = channelId(clean(snippet?.resourceId?.channelId));
      if (channel) batch.subscriptions.push({ id: channel, name: clean(snippet.title) || channel });
    }
  }
}

function csvData(name: string, text: string, batch: LibraryImport) {
  const rows = parseCsv(text);
  if (rows.length > MAX_ENTRIES) throw new Error('Die CSV-Datei enthält zu viele Zeilen.');
  const find = (header: string[], keys: string[]) =>
    header.findIndex((h) => keys.includes(columnKey(h)));
  let playlistName =
    name
      .split(/[\\/]/)
      .at(-1)!
      .replace(/(?:-videos)?\.csv$/i, '')
      .slice(0, 100) || 'Importierte Playlist';
  let playlistKey = `name:${playlistName.normalize('NFC')}`;
  let current: LibraryImport['playlists'][number] | undefined;
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i];
    const channel = find(header, ['channelid', 'kanalid']);
    const channelUrl = find(header, ['channelurl', 'kanalurl']);
    const channelTitle = find(header, ['channeltitle', 'kanaltitel', 'kanalname']);
    const playlistId = find(header, ['playlistid', 'wiedergabelistenid']);
    const videoId = find(header, ['videoid']);
    if (playlistId >= 0) {
      const metadata = rows[++i] ?? [];
      playlistKey = `id:${metadata[playlistId] || playlistKey}`;
      const titleIndex = find(header, ['title', 'titel']);
      playlistName = clean(metadata[titleIndex]).slice(0, 100) || playlistName;
    } else if (channel >= 0 && channelTitle >= 0 && videoId < 0) {
      for (const row of rows.slice(i + 1)) {
        const id = channelId(clean(row[channel])) || channelFromUrl(clean(row[channelUrl]));
        if (id) batch.subscriptions.push({ id, name: clean(row[channelTitle]) || id });
      }
      return;
    } else if (videoId >= 0) {
      current = { key: playlistKey, name: playlistName, videos: [] };
      batch.playlists.push(current);
      const titleIndex = find(header, ['videotitle', 'title', 'titel']);
      for (const row of rows.slice(i + 1)) {
        const id = parseVideoId(clean(row[videoId]));
        if (id) current.videos.push(video(id, row[titleIndex]));
      }
      return;
    }
  }
}

function wanted(name: string) {
  return (
    /\.(json|html?|csv)$/i.test(name) &&
    !/search.history|suchverlauf|archive.browser/i.test(name) &&
    /watch.history|wiedergabe|verlauf|subscriptions?|abonnements?|abos|playlists?|wiedergabelisten/i.test(
      name,
    )
  );
}

/** Archive werden nur im Speicher gelesen; Pfade daraus werden niemals auf die Platte geschrieben. */
export function parseTakeout(files: ImportFile[]): LibraryImport {
  if (!files.length || files.reduce((n, f) => n + f.bytes.length, 0) > MAX_IMPORT_BYTES)
    throw new Error(
      'Bitte höchstens 64 MB auswählen. Große Takeout-Archive vorher entpacken und nur Abos, Verlauf und Playlists auswählen.',
    );
  const batch: LibraryImport = { subscriptions: [], history: [], playlists: [], warnings: [] };
  const texts: { name: string; text: string }[] = [];
  let expanded = 0;
  const add = (name: string, bytes: Uint8Array) => {
    expanded += bytes.length;
    if (bytes.length > MAX_TEXT_BYTES || expanded > MAX_EXPANDED_BYTES)
      throw new Error(
        'Die entpackten Exportdaten sind zu groß. Bitte kleinere Einzeldateien auswählen.',
      );
    texts.push({ name, text: strFromU8(bytes) });
  };
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      let declared = 0;
      let entries = 0;
      const content = unzipSync(file.bytes, {
        filter: (entry) => {
          if (++entries > 10_000)
            throw new Error(
              'Das Archiv enthält zu viele Dateien. Bitte die gewünschten Exportdateien einzeln auswählen.',
            );
          if (!wanted(entry.name)) return false;
          declared += entry.originalSize;
          if (entry.originalSize > MAX_TEXT_BYTES || expanded + declared > MAX_EXPANDED_BYTES)
            throw new Error(
              'Die entpackten Exportdaten sind zu groß. Bitte Abos, Verlauf und Playlists einzeln auswählen.',
            );
          return true;
        },
      });
      for (const [name, bytes] of Object.entries(content)) add(name, bytes);
    } else if (/\.(csv|json|html?)$/i.test(file.name)) add(file.name, file.bytes);
  }
  for (const { name, text } of texts) {
    if (/search.history|suchverlauf/i.test(name)) continue;
    if (/\.csv$/i.test(name)) csvData(name, text, batch);
    else if (/\.json$/i.test(name)) jsonData(text, batch);
    else if (/watch.history|wiedergabe|verlauf/i.test(name)) htmlHistory(text, batch);
  }
  const subscriptions = [...new Map(batch.subscriptions.map((s) => [s.id, s])).values()];
  if (subscriptions.length > 5000)
    batch.warnings.push('Es werden höchstens 5.000 unterschiedliche Abos auf einmal übernommen.');
  batch.subscriptions = subscriptions.slice(0, 5000);
  const history = new Map<string, LibraryImport['history'][number]>();
  for (const item of batch.history)
    if (!history.has(item.video.id) || history.get(item.video.id)!.watchedAt < item.watchedAt)
      history.set(item.video.id, item);
  batch.history = [...history.values()].sort((a, b) => b.watchedAt - a.watchedAt);
  if (batch.history.length > 1000)
    batch.warnings.push(
      'Es werden die 1.000 neuesten unterschiedlichen Videos aus dem Export übernommen.',
    );
  batch.history = batch.history.slice(0, 1000);
  if (batch.history.some((h) => h.watchedAt === 0))
    batch.warnings.push(
      'Bei einigen Videos fehlt ein lesbarer Zeitpunkt. Diese Einträge werden entsprechend gekennzeichnet.',
    );
  const playlists = new Map<string, LibraryImport['playlists'][number]>();
  for (const list of batch.playlists) {
    const previous = playlists.get(list.key);
    const videos = new Map([...(previous?.videos ?? []), ...list.videos].map((v) => [v.id, v]));
    playlists.set(list.key, { ...list, videos: [...videos.values()] });
  }
  batch.playlists = [...playlists.values()];
  if (
    batch.playlists.length > 200 ||
    batch.playlists.reduce((n, p) => n + p.videos.length, 0) > 10_000
  )
    throw new Error(
      'Bitte höchstens 200 Playlists mit insgesamt 10.000 Videos auf einmal auswählen.',
    );
  if (!batch.history.length && !batch.subscriptions.length && !batch.playlists.length)
    throw new Error(
      'Keine unterstützten YouTube-Daten gefunden. Bitte subscriptions.csv, watch-history.json/.html oder Playlist-CSV-Dateien auswählen.',
    );
  return batch;
}
