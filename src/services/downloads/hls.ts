import { parseVariants } from '@/lib/hls';

export type DownloadMode = 'video' | 'audio';
export type DownloadQuality = 360 | 720;
export interface Resource {
  uri: string;
  name: string;
}
export interface OfflinePlan {
  manifests: { name: string; text: string }[];
  resources: Resource[];
  entry: string;
  label: string;
}

function attr(line: string, key: string) {
  return line.match(new RegExp(`(?:^|[:,])${key}=("[^"]*"|[^,]*)`))?.[1]?.replace(/^"|"$/g, '');
}

export function remoteUri(value: string, base: string): string {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Die Download-Adresse wird nicht unterstützt.');
  return url.href;
}

/** Nur vollständige VOD-Listen zulassen; jede Medien-/Schlüsseladresse wird lokal ersetzt. */
export function localMedia(
  text: string,
  base: string,
  prefix: string,
): { text: string; resources: Resource[] } {
  if (!text.trimStart().startsWith('#EXTM3U') || !/^#EXT-X-ENDLIST\s*$/m.test(text))
    throw new Error('Dieser Stream ist noch live oder nicht vollständig herunterladbar.');
  if (/#EXT-X-STREAM-INF:/.test(text))
    throw new Error('Verschachtelte HLS-Listen werden nicht unterstützt.');
  const resources: Resource[] = [];
  const names = new Map<string, string>();
  const local = (value: string) => {
    const uri = remoteUri(value, base);
    let name = names.get(uri);
    if (!name) {
      name = `${prefix}-${resources.length}.bin`;
      names.set(uri, name);
      resources.push({ uri, name });
    }
    return name;
  };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const output = lines.flatMap((line) => {
    if (!line.startsWith('#')) return [local(line)];
    if (line.startsWith('#EXT-X-KEY:')) {
      const method = attr(line, 'METHOD');
      if (method === 'NONE') return [line];
      if (method !== 'AES-128' || (attr(line, 'KEYFORMAT') ?? 'identity') !== 'identity')
        throw new Error('Geschützte Downloads werden nicht unterstützt.');
      if (!/URI="[^"]+"/.test(line)) throw new Error('Schlüsseladresse fehlt.');
      return [line.replace(/URI="[^"]*"/, `URI="${local(attr(line, 'URI')!)}"`)];
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      if (!/URI="[^"]+"/.test(line)) throw new Error('Initialisierungsadresse fehlt.');
      return [line.replace(/URI="[^"]*"/, `URI="${local(attr(line, 'URI')!)}"`)];
    }
    // Optionale Netzverweise (z. B. Vorschau-/Teilsegmente) gehören nicht in die Offline-Datei.
    if (
      /^#(?:EXTM3U$|EXTINF:|EXT-X-(?:VERSION|TARGETDURATION|MEDIA-SEQUENCE|DISCONTINUITY-SEQUENCE|PLAYLIST-TYPE|BYTERANGE|DISCONTINUITY|ENDLIST|INDEPENDENT-SEGMENTS|START)(?::|$))/.test(
        line,
      )
    )
      return [line];
    return [];
  });
  if (!resources.length) throw new Error('Der Stream enthält keine herunterladbaren Segmente.');
  return { text: output.join('\n') + '\n', resources };
}

export async function planHls(
  uri: string,
  mode: DownloadMode,
  quality: DownloadQuality,
  read: (uri: string) => Promise<{ text: string; uri: string }>,
): Promise<OfflinePlan> {
  const master = await read(uri);
  if (!master.text.trimStart().startsWith('#EXTM3U')) throw new Error('Ungültige HLS-Antwort.');
  if (/#EXT-X-SESSION-KEY:/.test(master.text))
    throw new Error('Streams mit Sitzungsschlüsseln werden nicht unterstützt.');
  const variants = parseVariants(master.text);
  if (!variants.length) {
    if (mode === 'audio') throw new Error('Für dieses Video ist keine separate Tonspur verfügbar.');
    const media = localMedia(master.text, master.uri, 'video');
    return {
      manifests: [{ name: 'index.m3u8', text: media.text }],
      resources: media.resources,
      entry: 'index.m3u8',
      label: 'Video',
    };
  }
  const ordered = variants.sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth);
  const variant = ordered.filter((v) => v.height <= quality).at(-1) ?? ordered[0];
  const group = attr(variant.info, 'AUDIO');
  const audioLines = master.text
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.startsWith('#EXT-X-MEDIA:') &&
        attr(line, 'TYPE') === 'AUDIO' &&
        (!group || attr(line, 'GROUP-ID') === group),
    );
  const audio = audioLines.find((l) => attr(l, 'DEFAULT') === 'YES') ?? audioLines[0];
  const audioUri = audio && attr(audio, 'URI');
  if (mode === 'audio' && !audioUri)
    throw new Error('Für dieses Video ist keine separate Tonspur verfügbar.');
  if (group && !audio) throw new Error('Die Tonspur des Videos fehlt.');
  const manifests: OfflinePlan['manifests'] = [];
  const resources: Resource[] = [];
  async function media(value: string, prefix: string) {
    const loaded = await read(remoteUri(value, master.uri));
    const converted = localMedia(loaded.text, loaded.uri, prefix);
    manifests.push({ name: `${prefix}.m3u8`, text: converted.text });
    resources.push(...converted.resources);
  }
  if (audioUri) await media(audioUri, 'audio');
  if (mode === 'audio') return { manifests, resources, entry: 'audio.m3u8', label: 'Nur Audio' };
  await media(variant.uri, 'video');
  const info = variant.info.replace(/,(?:SUBTITLES|CLOSED-CAPTIONS)=("[^"]*"|[^,]*)/g, '');
  manifests.push({
    name: 'index.m3u8',
    text: [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      ...(audioUri ? [audio!.replace(/URI="[^"]*"/, 'URI="audio.m3u8"')] : []),
      info,
      'video.m3u8',
      '',
    ].join('\n'),
  });
  return { manifests, resources, entry: 'index.m3u8', label: `${variant.height}p` };
}
