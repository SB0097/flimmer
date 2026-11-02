/**
 * Hilfen für HLS-Master-Playlists (YouTube liefert pro Video eine Liste aller
 * Qualitäten, Ton kommt als eigene Spur über #EXT-X-MEDIA).
 */

export interface HlsVariant {
  /** Die #EXT-X-STREAM-INF-Zeile */
  info: string;
  uri: string;
  height: number;
  bandwidth: number;
  frameRate?: number;
}

export interface QualityOption {
  height: number;
  /** z. B. „1080p60“, „720p“ */
  label: string;
}

function attribute(info: string, name: string): string | undefined {
  const match = info.match(new RegExp(`(?:^|[:,])${name}=("[^"]*"|[^,]*)`));
  return match?.[1]?.replace(/^"|"$/g, '');
}

export function parseVariants(master: string): HlsVariant[] {
  const lines = master.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith('#'));
    if (!uri) continue;
    const resolution = attribute(line, 'RESOLUTION');
    const height = Number(resolution?.split('x')[1]);
    if (!Number.isFinite(height) || height <= 0) continue;
    const frameRate = Number(attribute(line, 'FRAME-RATE'));
    variants.push({
      info: line,
      uri: uri.trim(),
      height,
      bandwidth: Number(attribute(line, 'BANDWIDTH')) || 0,
      frameRate: Number.isFinite(frameRate) ? frameRate : undefined,
    });
  }
  return variants;
}

/** Verfügbare Qualitäten, höchste zuerst; „60“ wird angehängt, wenn es die Höhe mit ≥ 50 fps gibt */
export function qualityOptions(variants: HlsVariant[]): QualityOption[] {
  const byHeight = new Map<number, boolean>();
  for (const v of variants) {
    byHeight.set(v.height, (byHeight.get(v.height) ?? false) || (v.frameRate ?? 0) >= 50);
  }
  return [...byHeight.entries()]
    .sort(([a], [b]) => b - a)
    .map(([height, highFps]) => ({ height, label: `${height}p${highFps ? '60' : ''}` }));
}

/**
 * Baut eine Master-Playlist, die nur Varianten einer Höhe enthält.
 * Kopfzeilen und Tonspuren (#EXT-X-MEDIA) bleiben erhalten.
 */
export function masterForHeight(master: string, height: number): string {
  const lines = master.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const uriIndex = lines.findIndex((l, j) => j > i && l.trim() && !l.startsWith('#'));
      const resolution = attribute(line, 'RESOLUTION');
      if (Number(resolution?.split('x')[1]) === height && uriIndex > 0) {
        out.push(line, lines[uriIndex]);
      }
      if (uriIndex > 0) i = uriIndex;
      continue;
    }
    if (line.trim()) out.push(line);
  }
  return `${out.join('\n')}\n`;
}
